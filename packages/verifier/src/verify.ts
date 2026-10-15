/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Top-level `verifyBundle` orchestrator.
 *
 * Aggregates the 8 Wave-1 checks (spec §5) into a single
 * `VerifyResult` with verdict aggregation:
 *
 *   - `fail`                     if any check failed
 *   - `untrusted-signer`         if the signer is not authorised and
 *                                `allowUntrustedSigner` is not set
 *   - `historical-unverifiable`  if that check fired and the signer
 *                                is trusted
 *   - `pass`                     otherwise
 *
 * Pure; no I/O. The CLI layer handles file reads, format selection,
 * and exit-code mapping.
 */

import { isCrawcusPayloadType, KNOWN_CRAWCUS_SUBTYPES, verifyAllDsseSignatures } from './dsse.js';
import { parseSignedBundle } from './parse.js';
import { verifyEventChain, verifyJcsHashEquivalence } from './hash-chain.js';
import { checkEmbeddedPredicates, lintSignalAsGate, reevaluateContracts } from './contracts.js';
import { clipDetail, selectSignerTrust } from './trust/evaluate.js';
import { parseTrustPolicy } from './trust/parse-policy.js';
import type { TrustResult } from './trust/types.js';
import type {
  BundleMetadata,
  ParsedAuditBundle,
  ParsedBundle,
  VerifyCheck,
  VerifyInput,
  VerifyResult,
  VerifyVerdict,
} from './types.js';
import {
  VERIFIER_BUILD_SHA,
  VERIFIER_PUBLIC_KEY_FINGERPRINT,
  VERIFIER_VERSION,
} from './version.js';

const DEFAULT_OPTIONS = {
  requireEmbeddedPredicates: true,
  requireCrawcusPayloadType: true,
  reevaluatePredicates: true,
} as const;

/**
 * Verify a signed CRAWCUS audit bundle.
 *
 * Spec §3 the authoritative API contract; spec §5 the check
 * order + IDs.
 *
 * The function is total + pure. It never throws — all failures are
 * structured `VerifyCheck` rows in the returned `VerifyResult`.
 */
export function verifyBundle(input: VerifyInput): VerifyResult {
  const opts = { ...DEFAULT_OPTIONS, ...input.options };
  const verifiedAt = input.options?.verifiedAt ?? new Date().toISOString();
  const verifierIdentity = {
    version: VERIFIER_VERSION,
    publicKeyFingerprint: VERIFIER_PUBLIC_KEY_FINGERPRINT,
    buildSha: VERIFIER_BUILD_SHA,
  };

  // ===== Check 1: DSSE envelope shape =====
  const parseResult = parseSignedBundle(input.bundle);
  if (parseResult.kind === 'fail') {
    return failEarly({
      verifiedAt,
      verifierIdentity,
      bundleMetadata: emptyMetadata(),
      trust: { decision: 'not-evaluated', reason: 'trust.not-evaluated' },
      check: {
        id: 'dsse.envelope.shape',
        label: 'DSSE envelope shape',
        verdict: 'fail',
        violationKind: parseResult.violationKind,
        detail: parseResult.detail,
      },
    });
  }
  const parsed = parseResult.parsed;
  const metadata = extractMetadata(parsed);

  const checks: VerifyCheck[] = [];

  // Envelope shape check itself: payloadType family validation.
  const shapeCheck = checkEnvelopeShape(parsed, opts.requireCrawcusPayloadType);
  checks.push(shapeCheck);
  if (shapeCheck.verdict === 'fail') {
    return aggregateAndReturn(
      checks,
      metadata,
      verifiedAt,
      verifierIdentity,
      { decision: 'not-evaluated', reason: 'trust.not-evaluated' },
      opts.allowUntrustedSigner === true,
    );
  }

  // ===== Check 2: DSSE signature (integrity only) =====
  const sigResult = verifyAllDsseSignatures(parsed.envelope, parsed.payloadBytes);
  checks.push({
    id: 'dsse.signature',
    label: 'DSSE ed25519 signature',
    verdict: sigResult.verdict,
    ...(sigResult.violationKind !== undefined ? { violationKind: sigResult.violationKind } : {}),
    detail: clipDetail(sigResult.detail),
    cite: [{ kind: 'envelope-field', value: 'signatures[0]' }],
  });

  const signingTime = metadata.latestEventTs.length > 0 ? metadata.latestEventTs : undefined;
  const signingTimeSource = signingTime !== undefined ? 'bundle-latest-event-ts' : 'none';
  const policyInput = input.options?.trustPolicy;
  const parsedPolicy =
    policyInput === undefined ? null : parseTrustPolicy(policyInput);
  const trustEval = selectSignerTrust({
    verified: sigResult.verified,
    payloadType: parsed.envelope.payloadType,
    signingTime,
    signingTimeSource,
    policy: parsedPolicy?.kind === 'ok' ? parsedPolicy.policy : undefined,
    ...(parsedPolicy?.kind === 'ok' ? { policyFingerprint: parsedPolicy.fingerprint } : {}),
    ...(parsedPolicy?.kind === 'fail' ? { policyDetail: parsedPolicy.detail } : {}),
    policyMalformed: parsedPolicy?.kind === 'fail',
  });
  // Signature failure still records the trust row, then short-circuits.
  // A malformed policy or an untrusted signer does not short-circuit:
  // later integrity checks still run.
  const trustCheckVerdict =
    sigResult.verdict === 'fail' ? ('skipped' as const) : trustEval.checkVerdict;
  const trust: TrustResult =
    sigResult.verdict === 'fail'
      ? { decision: 'not-evaluated', reason: 'signature.invalid' }
      : trustEval.trust;
  checks.push({
    id: 'dsse.signer-trust',
    label: 'Signer trust policy',
    verdict: trustCheckVerdict,
    ...(sigResult.verdict !== 'fail' && trustEval.violationKind !== undefined
      ? { violationKind: trustEval.violationKind }
      : {}),
    detail:
      sigResult.verdict === 'fail'
        ? 'signer trust not evaluated because the signature did not verify'
        : trustEval.detail,
    cite: [
      {
        kind: 'envelope-field',
        value: `signatures[${String(trustEval.signatureIndex)}]`,
      },
    ],
  });
  const reportedMetadata: BundleMetadata = {
    ...metadata,
    signerKeyId: trustEval.selectedKeyId.length > 0 ? trustEval.selectedKeyId : metadata.signerKeyId,
  };
  if (sigResult.verdict === 'fail') {
    // Signature failure short-circuits — the auditor sees it before
    // any payload-level disagreements.
    return aggregateAndReturn(
      checks,
      reportedMetadata,
      verifiedAt,
      verifierIdentity,
      trust,
      opts.allowUntrustedSigner === true,
    );
  }

  // ===== Check 3: JCS canonicalisation hash equivalence =====
  const jcsResult = verifyJcsHashEquivalence(parsed.bundle);
  checks.push({
    id: 'chain.jcs-hash-equivalence',
    label: 'JCS canonicalisation hash equivalence (RFC 8785)',
    verdict: jcsResult.verdict,
    ...(jcsResult.verdict === 'fail' ? { violationKind: 'Bundle.hash.mismatch' } : {}),
    detail: jcsResult.detail,
  });

  // ===== Check 4: Hash chain integrity =====
  const chainResult = verifyEventChain(parsed.bundle);
  const chainCite =
    typeof chainResult.brokenAt === 'number' && chainResult.brokenAt >= 0
      ? [{ kind: 'event-index' as const, value: chainResult.brokenAt }]
      : undefined;
  checks.push({
    id: 'chain.hash-chain',
    label: 'Hash chain integrity',
    verdict: chainResult.verdict,
    ...(chainResult.violationKind !== undefined
      ? { violationKind: chainResult.violationKind }
      : {}),
    detail: chainResult.detail,
    ...(chainCite !== undefined ? { cite: chainCite } : {}),
  });

  // ===== Check 5: Embedded predicate source text required =====
  const embeddedResults = checkEmbeddedPredicates(parsed.bundle, {
    requireEmbeddedPredicates: opts.requireEmbeddedPredicates,
  });
  for (const r of embeddedResults) {
    checks.push({
      id: `contract.predicate.unembedded.${r.contractId}`,
      label: `Embedded predicate source required (${r.contractId})`,
      verdict: r.verdict,
      ...(r.violationKind !== undefined ? { violationKind: r.violationKind } : {}),
      detail: r.detail,
      cite: [{ kind: 'contract-id', value: r.contractId }],
    });
  }

  // ===== Checks 6 + 7: Contract re-evaluation =====
  if (opts.reevaluatePredicates) {
    const contractResults = reevaluateContracts(parsed.bundle);
    for (const r of contractResults) {
      checks.push({
        id: `contract.${r.checkpoint ?? 'unknown'}.${r.contractId}`,
        label: `Contract re-evaluation (${r.checkpoint ?? 'unknown'}: ${r.contractId})`,
        verdict: r.verdict,
        ...(r.violationKind !== undefined ? { violationKind: r.violationKind } : {}),
        detail: r.detail,
        cite: [{ kind: 'contract-id', value: r.contractId }],
      });
    }
  }

  // ===== Check 8: DisclosureSignal SIGNAL-not-gate lint =====
  const signalLintResults = lintSignalAsGate(parsed.bundle);
  for (const r of signalLintResults) {
    checks.push({
      id: `contract.signal-as-gate.${r.contractId}`,
      label: `DisclosureSignal SIGNAL-not-gate lint (${r.contractId})`,
      verdict: r.verdict,
      ...(r.violationKind !== undefined ? { violationKind: r.violationKind } : {}),
      detail: r.detail,
      cite: [{ kind: 'contract-id', value: r.contractId }],
    });
  }

  return aggregateAndReturn(
    checks,
    reportedMetadata,
    verifiedAt,
    verifierIdentity,
    trust,
    opts.allowUntrustedSigner === true,
  );
}

// ============ Aggregation + helpers ============

function checkEnvelopeShape(parsed: ParsedBundle, requireCrawcusPayloadType: boolean): VerifyCheck {
  if (!requireCrawcusPayloadType) {
    return {
      id: 'dsse.envelope.shape',
      label: 'DSSE envelope shape',
      verdict: 'pass',
      detail: `envelope parsed; payloadType '${parsed.envelope.payloadType}' (family check skipped per options)`,
      cite: [{ kind: 'envelope-field', value: 'payloadType' }],
    };
  }

  if (!isCrawcusPayloadType(parsed.envelope.payloadType)) {
    return {
      id: 'dsse.envelope.shape',
      label: 'DSSE envelope shape',
      verdict: 'fail',
      violationKind: 'Envelope.shape.invalid',
      detail: `envelope.payloadType '${parsed.envelope.payloadType}' is not in the application/vnd.crawcus.*+jsonl family per crawcus-format.md:667-679`,
      cite: [{ kind: 'envelope-field', value: 'payloadType' }],
    };
  }

  const known = KNOWN_CRAWCUS_SUBTYPES.has(parsed.envelope.payloadType);
  return {
    id: 'dsse.envelope.shape',
    label: 'DSSE envelope shape',
    verdict: 'pass',
    detail: known
      ? `envelope parsed; payloadType '${parsed.envelope.payloadType}' known to Wave-1 verifier`
      : `envelope parsed; payloadType '${parsed.envelope.payloadType}' is in CRAWCUS family but unknown to Wave-1 (forward-compat fall-through per crawcus-format.md:677)`,
    cite: [{ kind: 'envelope-field', value: 'payloadType' }],
  };
}

function aggregateAndReturn(
  checks: readonly VerifyCheck[],
  bundleMetadata: BundleMetadata,
  verifiedAt: string,
  verifierIdentity: VerifyResult['verifierIdentity'],
  trust: TrustResult,
  allowUntrustedSigner: boolean,
): VerifyResult {
  const verdict = aggregateVerdict(checks, trust, allowUntrustedSigner);
  return { verdict, checks, bundleMetadata, verifiedAt, verifierIdentity, trust };
}

function aggregateVerdict(
  checks: readonly VerifyCheck[],
  trust: TrustResult,
  allowUntrustedSigner: boolean,
): VerifyVerdict {
  for (const c of checks) {
    if (c.verdict === 'fail') return 'fail';
  }
  if (trust.decision === 'untrusted' && !allowUntrustedSigner) return 'untrusted-signer';
  let sawHistoricalUnverifiable = false;
  for (const c of checks) {
    if (c.verdict === 'historical-unverifiable') sawHistoricalUnverifiable = true;
  }
  return sawHistoricalUnverifiable ? 'historical-unverifiable' : 'pass';
}

function failEarly(args: {
  readonly verifiedAt: string;
  readonly verifierIdentity: VerifyResult['verifierIdentity'];
  readonly bundleMetadata: BundleMetadata;
  readonly trust: TrustResult;
  readonly check: VerifyCheck;
}): VerifyResult {
  return {
    verdict: 'fail',
    checks: [args.check],
    bundleMetadata: args.bundleMetadata,
    verifiedAt: args.verifiedAt,
    verifierIdentity: args.verifierIdentity,
    trust: args.trust,
  };
}

function emptyMetadata(): BundleMetadata {
  return {
    bundleId: '',
    schemaVersion: '',
    payloadType: '',
    signerKeyId: '',
    eventCount: 0,
    contractCount: 0,
    earliestEventTs: '',
    latestEventTs: '',
  };
}

function extractMetadata(parsed: ParsedBundle): BundleMetadata {
  const bundle: ParsedAuditBundle = parsed.bundle;
  const events = Array.isArray(bundle.events) ? bundle.events : [];
  const contractResults = Array.isArray(bundle.contractResults) ? bundle.contractResults : [];
  const firstSig = parsed.envelope.signatures[0];

  let earliestTs = '';
  let latestTs = '';
  for (const e of events) {
    if (typeof e === 'object' && e !== null) {
      const ts = (e as Record<string, unknown>)['timestamp'];
      if (typeof ts === 'string') {
        if (earliestTs === '' || ts < earliestTs) earliestTs = ts;
        if (ts > latestTs) latestTs = ts;
      }
    }
  }

  const intent = bundle.intent;
  const intentId =
    typeof intent === 'object' && intent !== null
      ? String((intent as Record<string, unknown>)['id'] ?? '')
      : '';

  const bundleVersion = typeof bundle.bundleVersion === 'string' ? bundle.bundleVersion : '';

  return {
    bundleId: intentId,
    schemaVersion: bundleVersion,
    payloadType: parsed.envelope.payloadType,
    signerKeyId: firstSig?.keyid ?? '',
    eventCount: events.length,
    contractCount: contractResults.length,
    earliestEventTs: earliestTs,
    latestEventTs: latestTs,
  };
}
