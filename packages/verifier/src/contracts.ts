/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Contract re-evaluation checks — spec §5 rows 5-8.
 *
 *   Row 5  Embedded predicate source text required
 *          (`Contract.predicate.unembedded`)
 *   Row 6  Contract pre/inv/post re-evaluation
 *          (`Contract.pre.unmet` | `Contract.inv.violated` | `Contract.post.unmet`)
 *   Row 7  Historical-unverifiable discrete state
 *          (`Contract.predicate.retired` — informational, not a fail)
 *   Row 8  DisclosureSignal SIGNAL-not-gate lint
 *          (`Contract.predicate.signal-as-gate`)
 *
 * The verifier reads three sources of truth in the bundle:
 *   - `contractResults` — the historical ContractEvaluationResult
 *     array recorded at writeEvent time
 *   - `predicateSources` (verifier-only) — a map of contractId →
 *     normalised predicate source, embedded per
 *     `02-product/crawcus-format.md:446-449`
 *   - SHA-256-of-normalised-source hashes inside each
 *     `ContractEvaluationResult` (canon `ContractEvaluationResult`
 *     for `historical-unverifiable` carries `predicateHashSeen`)
 *
 * Wave-1 does NOT re-evaluate the embedded predicate against the
 * event stream by `eval`-ing JavaScript at verify time — that would
 * be a security foot-gun and a cross-language portability blocker.
 * Instead the verifier:
 *   1. Asserts every Contract has its embedded predicate source.
 *   2. Trusts the recorded historical `ContractEvaluationResult`
 *      pass/fail verdict.
 *   3. Re-hashes the embedded predicate source and compares to the
 *      recorded `predicateHash` — if they mismatch, surfaces
 *      `Contract.predicate.retired` (historical-unverifiable).
 *   4. Lints predicate names for SIGNAL-not-gate violations per Q-CR9.
 *
 * This matches the parent memo §"What's verified" Wave-1 = Option B
 * intent: re-check using the historical predicate hash, not by
 * re-executing arbitrary code. Wave-2 (`--deep`) adds executor
 * sandboxing per the parent memo §"Wave-2 vs Wave-1 split".
 */

import { hashPredicateSource, lintDisclosureSignalPredicateName } from '@crawcus/spec';
import type { ContractVerifyResult, ParsedAuditBundle } from './types.js';

interface RecordedContractResult {
  readonly result: string;
  readonly contractId?: string;
  readonly contract?: { readonly id?: string; readonly severity?: string };
  readonly severity?: string;
  readonly predicateHashSeen?: string;
  readonly checkpoint?: string;
  readonly predicateHash?: string;
}

/**
 * Spec §5 check 5 — embedded predicate source text required.
 *
 * Returns one `Contract.predicate.unembedded` fail per Contract id
 * referenced in `contractResults` but missing from `predicateSources`.
 * When `requireEmbeddedPredicates` is false, returns an empty array.
 */
export function checkEmbeddedPredicates(
  bundle: ParsedAuditBundle,
  options: { readonly requireEmbeddedPredicates: boolean },
): readonly ContractVerifyResult[] {
  if (!options.requireEmbeddedPredicates) return [];

  const contractIds = extractReferencedContractIds(bundle);
  const sources = extractPredicateSourceMap(bundle);

  const missing: ContractVerifyResult[] = [];
  for (const id of contractIds) {
    if (!sources.has(id)) {
      missing.push({
        contractId: id,
        verdict: 'fail',
        violationKind: 'Contract.predicate.unembedded',
        detail: `Contract '${id}' is referenced in contractResults but has no predicate source text in bundle.predicateSources — bundle is not third-party verifiable per crawcus-format.md:446-449`,
      });
    }
  }
  return missing;
}

/**
 * Spec §5 check 6 — Contract pre/inv/post re-evaluation.
 *
 * Reads `bundle.contractResults` (recorded at writeEvent time). For
 * each recorded result:
 *   - `pass` → emit one passing `ContractVerifyResult`
 *   - `fail` → emit one failing result, mapping `checkpoint` to the
 *     corresponding `violationKind` (`Contract.pre.unmet`, etc.)
 *   - `historical-unverifiable` → emit one historical-unverifiable
 *     result with `Contract.predicate.retired` (the spec §5 row 7
 *     informational kind — auditor distinguishes from a hard fail)
 *
 * Hash-cross-check: if the bundle embeds the predicate source for a
 * Contract, the verifier recomputes the source's hash and compares
 * to the recorded `predicateHashSeen`. Mismatch produces a
 * historical-unverifiable (per `02-product/crawcus-format.md:449-453`).
 */
export function reevaluateContracts(bundle: ParsedAuditBundle): readonly ContractVerifyResult[] {
  const results = extractContractResults(bundle);
  if (results === null) return [];

  const sources = extractPredicateSourceMap(bundle);

  const out: ContractVerifyResult[] = [];
  for (const r of results) {
    const id = extractContractId(r);
    if (id === null) {
      // Skip malformed result records — the chain integrity check
      // already covered structural tampering at the event level.
      continue;
    }
    const checkpoint = normaliseCheckpoint(r.checkpoint);

    switch (r.result) {
      case 'pass': {
        // Cross-check embedded source hash matches recorded hash when both present.
        const recordedHash = r.predicateHash;
        const embedded = sources.get(id);
        if (
          typeof recordedHash === 'string' &&
          recordedHash.length > 0 &&
          typeof embedded === 'string'
        ) {
          const recomputed = hashPredicateSource(embedded);
          if (recomputed !== recordedHash) {
            out.push({
              contractId: id,
              verdict: 'historical-unverifiable',
              violationKind: 'Contract.predicate.retired',
              detail: `Contract '${id}': embedded predicate source hashes to ${recomputed} but recorded predicateHash is ${recordedHash} — predicate appears to have been edited or retired since the bundle was sealed`,
              ...(checkpoint !== undefined ? { checkpoint } : {}),
            });
            break;
          }
        }
        out.push({
          contractId: id,
          verdict: 'pass',
          detail: `Contract '${id}' historically evaluated to pass`,
          ...(checkpoint !== undefined ? { checkpoint } : {}),
        });
        break;
      }

      case 'fail': {
        const violationKind = checkpointToViolationKind(checkpoint);
        out.push({
          contractId: id,
          verdict: 'fail',
          violationKind,
          detail: `Contract '${id}' historically failed at checkpoint '${checkpoint ?? 'unknown'}' with severity '${r.severity ?? 'unknown'}'`,
          ...(checkpoint !== undefined ? { checkpoint } : {}),
        });
        break;
      }

      case 'historical-unverifiable': {
        const seen = r.predicateHashSeen;
        out.push({
          contractId: id,
          verdict: 'historical-unverifiable',
          violationKind: 'Contract.predicate.retired',
          detail: `Contract '${id}' historical predicate (hash ${seen ?? '<unknown>'}) is unavailable for re-evaluation — recorded result was historical-unverifiable`,
          ...(checkpoint !== undefined ? { checkpoint } : {}),
        });
        break;
      }

      default: {
        // Unknown result kind — treat as historical-unverifiable so
        // an auditor sees the gap explicitly rather than a silent skip.
        out.push({
          contractId: id,
          verdict: 'historical-unverifiable',
          violationKind: 'Contract.predicate.retired',
          detail: `Contract '${id}' has unknown historical result '${r.result}' — treated as historical-unverifiable`,
          ...(checkpoint !== undefined ? { checkpoint } : {}),
        });
      }
    }
  }
  return out;
}

/**
 * Spec §5 check 8 — DisclosureSignal SIGNAL-not-gate lint.
 *
 * For every Contract id referenced in `contractResults`, run the
 * canon `lintDisclosureSignalPredicateName` check (which lives in
 * `@crawcus/spec` per Q-CR9 LOCKED).
 *
 * Per the spec ticket §5 row 8: the lint applies "for every
 * DisclosureSignal event" — i.e., only Contracts whose predicate
 * names contain a forbidden token AND whose bundle contains a
 * DisclosureSignal event are flagged. The lint applies even if the
 * DisclosureSignal event is referenced by a different Contract — the
 * forbidden-token rule is a name-discipline rule that protects the
 * SIGNAL semantics across the whole bundle.
 *
 * Returns one `Contract.predicate.signal-as-gate` fail per offending
 * predicate name when a DisclosureSignal is present.
 */
export function lintSignalAsGate(bundle: ParsedAuditBundle): readonly ContractVerifyResult[] {
  if (!hasDisclosureSignalEvent(bundle)) return [];

  const ids = extractReferencedContractIds(bundle);
  const out: ContractVerifyResult[] = [];
  for (const id of ids) {
    const lintResult = lintDisclosureSignalPredicateName(id);
    if (!lintResult.ok && lintResult.code === 'FORBIDDEN_TOKEN') {
      out.push({
        contractId: id,
        verdict: 'fail',
        violationKind: 'Contract.predicate.signal-as-gate',
        detail: `Contract '${id}' uses forbidden token '${lintResult.token}' in its name — DisclosureSignal records SIGNAL (opportunity to perceive), never GATE (affirmative consent). See 02-product/crawcus-contracts.md §6.A.`,
      });
    }
  }
  return out;
}

// ============ Bundle-shape extraction helpers ============

function extractContractResults(
  bundle: ParsedAuditBundle,
): readonly RecordedContractResult[] | null {
  const raw = bundle.contractResults;
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) return null;
  // Treat each element structurally — verifier never trusts that
  // unknown fields are absent, just reads the ones it understands.
  return raw.filter((r): r is RecordedContractResult => {
    if (typeof r !== 'object' || r === null) return false;
    const result = (r as Record<string, unknown>)['result'];
    return typeof result === 'string';
  });
}

function extractContractId(r: RecordedContractResult): string | null {
  if (typeof r.contractId === 'string' && r.contractId.length > 0) return r.contractId;
  if (
    typeof r.contract === 'object' &&
    r.contract !== null &&
    typeof r.contract.id === 'string' &&
    r.contract.id.length > 0
  ) {
    return r.contract.id;
  }
  return null;
}

function extractReferencedContractIds(bundle: ParsedAuditBundle): readonly string[] {
  const results = extractContractResults(bundle);
  if (results === null) return [];
  const ids = new Set<string>();
  for (const r of results) {
    const id = extractContractId(r);
    if (id !== null) ids.add(id);
  }
  return Array.from(ids);
}

function extractPredicateSourceMap(bundle: ParsedAuditBundle): ReadonlyMap<string, string> {
  const raw = bundle.predicateSources;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return new Map();
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.length > 0) out.set(k, v);
  }
  return out;
}

function hasDisclosureSignalEvent(bundle: ParsedAuditBundle): boolean {
  const events = bundle.events;
  if (!Array.isArray(events)) return false;
  for (const e of events) {
    if (typeof e === 'object' && e !== null) {
      const kind = (e as Record<string, unknown>)['kind'];
      if (kind === 'DisclosureSignal') return true;
    }
  }
  return false;
}

function normaliseCheckpoint(raw: unknown): 'pre' | 'invariants' | 'post' | undefined {
  if (raw === 'pre' || raw === 'invariants' || raw === 'post') return raw;
  return undefined;
}

function checkpointToViolationKind(
  cp: 'pre' | 'invariants' | 'post' | undefined,
): 'Contract.pre.unmet' | 'Contract.inv.violated' | 'Contract.post.unmet' {
  switch (cp) {
    case 'invariants':
      return 'Contract.inv.violated';
    case 'post':
      return 'Contract.post.unmet';
    case 'pre':
    default:
      // Default to pre.unmet when checkpoint is missing or unknown —
      // pre is the most common, and missing-checkpoint is itself a
      // signal worth surfacing via the existing detail string.
      return 'Contract.pre.unmet';
  }
}
