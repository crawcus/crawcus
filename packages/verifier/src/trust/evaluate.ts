/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decide whether a public key that has already verified a DSSE signature
 * is authorised by a trust policy.
 *
 * The embedded keyid is not an input. Callers pass the public key the
 * signature verified against. Revocation is applied before anchors.
 * "Now" is never consulted — only the supplied signing time — so the
 * decision is replayable.
 *
 * For pinned keys the signing time is the bundle's latest event
 * timestamp. That timestamp is signed by the key under evaluation, so
 * `notBefore` / `notAfter` bound honest use and are not a security
 * boundary. `key-compromise` revocation is the boundary: it rejects
 * every bundle signed by that key, including back-dated ones.
 */

import { bytesToHex } from '@noble/hashes/utils';
import type { ContractViolationKind } from '@crawcus/spec';
import { isCrawcusPayloadType } from '../dsse.js';
import { keyIdFor } from './keyid.js';
import type {
  Ed25519PinnedAnchor,
  SignerIdentity,
  SigningTimeSource,
  TrustPolicy,
  TrustResult,
} from './types.js';

export interface SignerTrustEvaluation {
  readonly trust: TrustResult;
  readonly checkVerdict: 'pass' | 'fail' | 'untrusted-signer';
  readonly violationKind?: ContractViolationKind;
  readonly detail: string;
  readonly signatureIndex: number;
  readonly selectedKeyId: string;
}

export interface VerifiedSignatureRef {
  readonly index: number;
  readonly publicKey: Uint8Array;
  readonly keyid: string;
}

const DETAIL_LIMIT = 200;

export function selectSignerTrust(args: {
  readonly verified: readonly VerifiedSignatureRef[];
  readonly payloadType: string;
  readonly signingTime?: string;
  readonly signingTimeSource: SigningTimeSource;
  readonly policy: TrustPolicy | undefined;
  readonly policyFingerprint?: string;
  readonly policyDetail?: string;
  readonly policyMalformed: boolean;
}): SignerTrustEvaluation {
  const first = args.verified[0];
  if (first === undefined) {
    return {
      trust: { decision: 'not-evaluated', reason: 'signature.invalid' },
      checkVerdict: 'untrusted-signer',
      detail: clip('no verified signature to evaluate'),
      signatureIndex: 0,
      selectedKeyId: '',
    };
  }

  if (args.policyMalformed) {
    const signer = signerIdentity(first.publicKey, args.signingTime, args.signingTimeSource);
    return {
      trust: {
        decision: 'not-evaluated',
        reason: 'policy.malformed',
        signer,
      },
      checkVerdict: 'fail',
      violationKind: 'TrustPolicy.malformed',
      detail: clip(args.policyDetail ?? 'trust policy is malformed'),
      signatureIndex: first.index,
      selectedKeyId: first.keyid,
    };
  }

  if (args.policy === undefined) {
    const signer = signerIdentity(first.publicKey, args.signingTime, args.signingTimeSource);
    return {
      trust: {
        decision: 'untrusted',
        reason: 'signer.untrusted.no-policy',
        signer,
      },
      checkVerdict: 'untrusted-signer',
      violationKind: 'Envelope.signer.untrusted',
      detail: clip('no trust policy supplied; verifier fails closed'),
      signatureIndex: first.index,
      selectedKeyId: first.keyid,
    };
  }

  let firstUntrusted: SignerTrustEvaluation | null = null;
  let firstFail: SignerTrustEvaluation | null = null;
  for (const sig of args.verified) {
    const evaluation = evaluateSignerTrust({
      publicKey: sig.publicKey,
      payloadType: args.payloadType,
      signingTime: args.signingTime,
      signingTimeSource: args.signingTimeSource,
      policy: args.policy,
      policyFingerprint: args.policyFingerprint ?? '',
      signatureIndex: sig.index,
      selectedKeyId: sig.keyid,
    });
    if (evaluation.checkVerdict === 'pass') return evaluation;
    if (evaluation.checkVerdict === 'fail' && firstFail === null) firstFail = evaluation;
    if (evaluation.checkVerdict === 'untrusted-signer' && firstUntrusted === null) {
      firstUntrusted = evaluation;
    }
  }
  return firstFail ?? firstUntrusted ?? {
    trust: {
      decision: 'untrusted',
      reason: 'signer.untrusted.unknown-key',
      policyId: args.policy.policyId,
      ...(args.policyFingerprint !== undefined ? { policyFingerprint: args.policyFingerprint } : {}),
      signer: signerIdentity(first.publicKey, args.signingTime, args.signingTimeSource),
    },
    checkVerdict: 'untrusted-signer',
    violationKind: 'Envelope.signer.untrusted',
    detail: clip('signer public key matched no trust anchor'),
    signatureIndex: first.index,
    selectedKeyId: first.keyid,
  };
}

export function evaluateSignerTrust(args: {
  readonly publicKey: Uint8Array;
  readonly payloadType: string;
  readonly signingTime?: string;
  readonly signingTimeSource: SigningTimeSource;
  readonly policy: TrustPolicy;
  readonly policyFingerprint: string;
  readonly signatureIndex: number;
  readonly selectedKeyId: string;
}): SignerTrustEvaluation {
  const publicKey = bytesToHex(args.publicKey);
  const baseSigner = signerIdentity(args.publicKey, args.signingTime, args.signingTimeSource);
  const policyMeta = {
    policyId: args.policy.policyId,
    policyFingerprint: args.policyFingerprint,
  };

  const revocation = matchingRevocation(args.policy, publicKey);
  if (revocation !== null && revocation.reason === 'key-compromise') {
    return untrusted({
      ...policyMeta,
      signer: baseSigner,
      reason: 'signer.untrusted.revoked',
      checkVerdict: 'fail',
      violationKind: 'Envelope.signer.revoked',
      detail: 'public key is revoked for key-compromise; signing time is ignored',
      signatureIndex: args.signatureIndex,
      selectedKeyId: args.selectedKeyId,
    });
  }

  let selfAssertedNote = '';
  if (revocation !== null) {
    const revokedAt = Date.parse(revocation.revokedAt);
    const signedAt = args.signingTime === undefined ? Number.NaN : Date.parse(args.signingTime);
    if (!Number.isFinite(signedAt)) {
      return untrusted({
        ...policyMeta,
        signer: baseSigner,
        reason: 'signer.untrusted.signing-time-unknown',
        checkVerdict: 'untrusted-signer',
        violationKind: 'Envelope.signer.revoked',
        detail: `public key is revoked (${revocation.reason}) and the signing time is not available`,
        signatureIndex: args.signatureIndex,
        selectedKeyId: args.selectedKeyId,
      });
    }
    if (signedAt >= revokedAt) {
      return untrusted({
        ...policyMeta,
        signer: baseSigner,
        reason: 'signer.untrusted.revoked',
        checkVerdict: 'untrusted-signer',
        violationKind: 'Envelope.signer.revoked',
        detail: `public key is revoked (${revocation.reason}) at or before the signing time`,
        signatureIndex: args.signatureIndex,
        selectedKeyId: args.selectedKeyId,
      });
    }
    if (args.signingTimeSource !== 'rekor-integrated-time') {
      selfAssertedNote = ' signing time self-asserted.';
    }
  }

  const matches = args.policy.anchors.filter(
    (anchor): anchor is Ed25519PinnedAnchor =>
      anchor.type === 'ed25519-pinned' && anchor.publicKey === publicKey,
  );
  if (matches.length === 0) {
    const reserved = args.policy.anchors.some((anchor) => anchor.type === 'sigstore-identity');
    const extra = reserved
      ? ' sigstore-identity anchors are reserved and are not evaluated by this version.'
      : '';
    return untrusted({
      ...policyMeta,
      signer: baseSigner,
      reason: 'signer.untrusted.unknown-key',
      checkVerdict: 'untrusted-signer',
      violationKind: 'Envelope.signer.untrusted',
      detail: `signer public key matched no pinned anchor.${extra}`,
      signatureIndex: args.signatureIndex,
      selectedKeyId: args.selectedKeyId,
    });
  }

  let firstProblem: SignerTrustEvaluation | null = null;
  for (const anchor of matches) {
    const signer: SignerIdentity = {
      ...baseSigner,
      anchorId: anchor.id,
      ...(anchor.label !== undefined ? { label: anchor.label } : {}),
    };
    const problem = anchorProblem(anchor, args.payloadType, args.signingTime);
    if (problem === null) {
      return {
        trust: {
          decision: 'trusted',
          reason: 'signer.trusted.pinned-key',
          ...policyMeta,
          signer,
        },
        checkVerdict: 'pass',
        detail: clip(
          `signer matched pinned anchor ${anchor.id}.${selfAssertedNote}`,
        ),
        signatureIndex: args.signatureIndex,
        selectedKeyId: args.selectedKeyId,
      };
    }
    if (firstProblem === null) {
      firstProblem = untrusted({
        ...policyMeta,
        signer,
        reason: problem.reason,
        checkVerdict: 'untrusted-signer',
        violationKind: problem.violationKind,
        detail: problem.detail,
        signatureIndex: args.signatureIndex,
        selectedKeyId: args.selectedKeyId,
      });
    }
  }
  return firstProblem!;
}

export function signerIdentity(
  publicKey: Uint8Array,
  signingTime: string | undefined,
  signingTimeSource: SigningTimeSource,
): SignerIdentity {
  const selfAsserted =
    signingTimeSource !== 'rekor-integrated-time' && signingTimeSource !== 'none';
  return {
    keyFingerprint: keyIdFor(publicKey),
    publicKey: bytesToHex(publicKey),
    ...(signingTime !== undefined ? { signingTime } : {}),
    signingTimeSource,
    ...(selfAsserted ? { signingTimeSelfAsserted: true } : {}),
  };
}

export function clipDetail(detail: string): string {
  return clip(detail);
}

function matchingRevocation(policy: TrustPolicy, publicKey: string) {
  return policy.revoked?.find((row) => row.publicKey === publicKey) ?? null;
}

function anchorProblem(
  anchor: Ed25519PinnedAnchor,
  payloadType: string,
  signingTime: string | undefined,
): { reason: SignerTrustEvaluation['trust']['reason']; violationKind: ContractViolationKind; detail: string } | null {
  const allowed = anchor.payloadTypes ?? null;
  const payloadOk =
    allowed === null ? isCrawcusPayloadType(payloadType) : allowed.includes(payloadType);
  if (!payloadOk) {
    return {
      reason: 'signer.untrusted.payload-type-not-allowed',
      violationKind: 'Envelope.signer.untrusted',
      detail: `payload type is not allowed by anchor ${anchor.id}`,
    };
  }

  const hasWindow = anchor.notBefore !== undefined || anchor.notAfter !== undefined;
  if (!hasWindow) return null;

  const signedAt = signingTime === undefined ? Number.NaN : Date.parse(signingTime);
  if (!Number.isFinite(signedAt)) {
    return {
      reason: 'signer.untrusted.signing-time-unknown',
      violationKind: 'Envelope.signer.expired',
      detail: `anchor ${anchor.id} has a validity window and the signing time is not available`,
    };
  }
  if (anchor.notBefore !== undefined && signedAt < Date.parse(anchor.notBefore)) {
    return {
      reason: 'signer.untrusted.not-yet-valid',
      violationKind: 'Envelope.signer.expired',
      detail: `anchor ${anchor.id} is not yet valid at the signing time`,
    };
  }
  if (anchor.notAfter !== undefined && signedAt > Date.parse(anchor.notAfter)) {
    return {
      reason: 'signer.untrusted.expired',
      violationKind: 'Envelope.signer.expired',
      detail: `anchor ${anchor.id} is expired at the signing time`,
    };
  }
  return null;
}

function untrusted(args: {
  readonly policyId: string;
  readonly policyFingerprint: string;
  readonly signer: SignerIdentity;
  readonly reason: SignerTrustEvaluation['trust']['reason'];
  readonly checkVerdict: 'fail' | 'untrusted-signer';
  readonly violationKind: ContractViolationKind;
  readonly detail: string;
  readonly signatureIndex: number;
  readonly selectedKeyId: string;
}): SignerTrustEvaluation {
  return {
    trust: {
      decision: 'untrusted',
      reason: args.reason,
      policyId: args.policyId,
      policyFingerprint: args.policyFingerprint,
      signer: args.signer,
    },
    checkVerdict: args.checkVerdict,
    violationKind: args.violationKind,
    detail: clip(args.detail),
    signatureIndex: args.signatureIndex,
    selectedKeyId: args.selectedKeyId,
  };
}

function clip(detail: string): string {
  const clean = detail.replace(/[\u0000-\u001f\u007f]/g, '?');
  if (clean.length <= DETAIL_LIMIT) return clean;
  return `${clean.slice(0, DETAIL_LIMIT - 3)}...`;
}
