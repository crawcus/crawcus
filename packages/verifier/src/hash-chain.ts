/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * JCS hash-equivalence check + hash-chain walk.
 *
 * Spec §5 checks 3 + 4:
 *   - JCS canonicalisation hash equivalence — re-canonicalise the
 *     payload via RFC 8785 JCS, assert byte-equality with the
 *     bundle's own self-hash field (`Bundle.hash.mismatch`).
 *   - Hash chain integrity — each event's `prevHash` matches the
 *     SHA-256 of the prior event's canonical bytes (`Chain.hash.broken`).
 *
 * Implementation reuses canon primitives from `@crawcus/spec`:
 *   - `canonicalJSON` (RFC 8785 wrapper)
 *   - `computeContentHash` / `verifyChain` (the chain walker)
 *
 * Per spec §"Three hard rules" rule 3 + §7 "Cross-package wiring":
 * the verifier is a CONSUMER of the spec, not a sibling source-of-truth.
 */

import { canonicalJSON, verifyChain } from '@crawcus/spec';
import type { Event } from '@crawcus/spec';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { ChainVerifyResult, ParsedAuditBundle } from './types.js';

/**
 * SHA-256 over an arbitrary byte sequence, returned as lowercase
 * hex. Pure; reuses `@noble/hashes`.
 */
export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

/**
 * Spec §5 check 3 — JCS canonicalisation hash equivalence.
 *
 * The check:
 *   1. Re-canonicalise the bundle (minus `chainProof.bundleSelfHash` if
 *      it would otherwise be self-referential) via RFC 8785 JCS.
 *   2. SHA-256 over the canonical bytes.
 *   3. Compare byte-for-byte with the bundle's recorded self-hash
 *      (which, per `02-product/crawcus-format.md:603-612`, is stored
 *      in `chainProof.bundleSelfHash` when emitted).
 *
 * When the bundle does NOT carry a recorded self-hash (older
 * composer versions), the check passes vacuously — the wire-format
 * spec requires `bundleSelfHash` for v0.2+ bundles but legacy v0.1
 * fixtures may omit it.
 */
export function verifyJcsHashEquivalence(bundle: ParsedAuditBundle): {
  verdict: 'pass' | 'fail';
  detail: string;
  recordedHash?: string;
  recomputedHash?: string;
} {
  // The bundleSelfHash lives in chainProof per crawcus-format.md
  // §"Hash equivalence test" (lines 603-612). When absent, treat as
  // a legacy bundle and let the chain walk be the sole tamper guard.
  const chainProof = bundle.chainProof;
  if (typeof chainProof !== 'object' || chainProof === null) {
    return {
      verdict: 'pass',
      detail: 'no chainProof present — JCS equivalence check skipped (legacy bundle)',
    };
  }

  const recordedRaw = (chainProof as Record<string, unknown>)['bundleSelfHash'];
  if (typeof recordedRaw !== 'string' || recordedRaw.length === 0) {
    return {
      verdict: 'pass',
      detail: 'chainProof.bundleSelfHash absent — JCS equivalence check skipped (legacy bundle)',
    };
  }

  // Build the canonicalisation target by stripping the self-hash
  // field — otherwise the hash includes itself, which is impossible.
  const canonicalTarget = stripSelfHash(bundle);

  let canonical: string;
  try {
    canonical = canonicalJSON(canonicalTarget);
  } catch (e) {
    return {
      verdict: 'fail',
      detail: `payload not RFC-8785-canonicalisable: ${describe(e)}`,
    };
  }
  const recomputed = sha256Hex(new TextEncoder().encode(canonical));

  if (recomputed !== recordedRaw) {
    return {
      verdict: 'fail',
      detail: `chainProof.bundleSelfHash mismatch: recorded ${recordedRaw}, recomputed ${recomputed}`,
      recordedHash: recordedRaw,
      recomputedHash: recomputed,
    };
  }

  return {
    verdict: 'pass',
    detail: 'JCS canonicalisation hash equivalence verified',
    recordedHash: recordedRaw,
    recomputedHash: recomputed,
  };
}

/**
 * Strip `chainProof.bundleSelfHash` for the JCS recomputation step.
 * Returns a shallow-cloned object tree so the input is untouched.
 */
function stripSelfHash(bundle: ParsedAuditBundle): unknown {
  const out: Record<string, unknown> = { ...bundle };
  const chainProof = out['chainProof'];
  if (typeof chainProof === 'object' && chainProof !== null) {
    const cp = { ...(chainProof as Record<string, unknown>) };
    delete cp['bundleSelfHash'];
    out['chainProof'] = cp;
  }
  return out;
}

/**
 * Spec §5 check 4 — hash-chain integrity.
 *
 * Delegates to `verifyChain` from `@crawcus/spec` — the
 * canon-owned walker. The verifier translates the result into the
 * standard `ChainVerifyResult` shape, mapping `verifyChain`'s
 * `brokenAt` index to a `BundleCite.event-index` for drill-down.
 */
export function verifyEventChain(bundle: ParsedAuditBundle): ChainVerifyResult {
  if (bundle.events === undefined || bundle.events === null) {
    // No events array — vacuous pass (e.g., a genesis-only bundle).
    return {
      verdict: 'pass',
      detail: 'no events in bundle — chain check vacuous',
    };
  }

  if (!Array.isArray(bundle.events)) {
    return {
      verdict: 'fail',
      violationKind: 'Chain.hash.broken',
      detail: 'bundle.events is not an array',
    };
  }

  // The canon walker expects typed `Event[]`. We trust the structural
  // shape here — `verifyChain` recomputes each event's hash and will
  // surface a fail if any field is wrong type. Cast is sound because
  // `verifyChain` reads `prevHash` + `contentHash` defensively.
  const events = bundle.events as readonly Event<unknown>[];

  const result = verifyChain(events);
  if (result.valid) {
    return {
      verdict: 'pass',
      detail: `hash chain valid over ${String(events.length)} events`,
    };
  }

  const reason = result.reason ?? 'chain walk failed';
  const brokenAt = result.brokenAt ?? -1;
  return {
    verdict: 'fail',
    violationKind: 'Chain.hash.broken',
    detail: `hash chain broken at event index ${String(brokenAt)}: ${reason}`,
    brokenAt,
  };
}

function describe(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
