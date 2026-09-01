/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { Event } from '../types/event.js';
import type { ContentHash } from '../types/ids.js';
import { canonicalJSON, normaliseForCanonical } from './canonical-json.js';

/**
 * Per compliance-by-design #4 + NFR D2 (tamper detection) + the lock
 * decision Q-D: SHA-256 is the canonical hash algorithm. FIPS 140-3
 * approved + Web Crypto native + post-quantum-adequate.
 *
 * Hash domain: every field of the Event EXCEPT `id` and `contentHash`
 * itself (otherwise circular). `prevHash` IS included — that's the
 * chain.
 */

type HashableEvent = Omit<Event, 'id' | 'contentHash'>;

/**
 * Compute the canonical content hash for an event-shape value. The
 * caller passes an Event minus `id` + `contentHash`; the hash is
 * SHA-256 over the canonical-JSON of the remainder.
 *
 * Pure; deterministic; depends only on @noble/hashes + canonicalize.
 */
export function computeContentHash(event: HashableEvent): ContentHash {
  const normalised = normaliseForCanonical(event);
  const canonical = canonicalJSON(normalised);
  const bytes = sha256(new TextEncoder().encode(canonical));
  return bytesToHex(bytes) as ContentHash;
}

/**
 * Compute a `ContentHash` over an arbitrary JSON-like value. Same
 * pipeline as `computeContentHash` (Date normalisation → canonical
 * JSON → SHA-256) but accepts any value, not just events.
 *
 * Used at AI-port boundaries for `ToolCall.argsHash` (adapter side)
 * and by downstream audit-bundle verifiers (consumer side) to prove
 * the hash without re-serialising the args.
 *
 * Pure; deterministic; depends only on @noble/hashes + canonicalize.
 *
 * @throws TypeError on non-JSON-serialisable input (functions,
 * symbols, BigInt, non-finite numbers) — RFC 8785 §3.2.2 forbids
 * non-finite numbers; the underlying `canonicalJSON` rejects.
 */
export function computeJsonHash(value: unknown): ContentHash {
  const normalised = normaliseForCanonical(value);
  const canonical = canonicalJSON(normalised);
  const bytes = sha256(new TextEncoder().encode(canonical));
  return bytesToHex(bytes) as ContentHash;
}

/**
 * Verify an entire chain of events is unbroken: each event's
 * `prevHash` matches the prior event's `contentHash`, and each
 * event's `contentHash` matches the recomputed hash of its content.
 *
 * Returns `valid: true` iff every event passes; otherwise returns
 * the first failing index.
 *
 * Used by auditors + regulators + bundle verifiers — anyone can
 * recompute the chain locally without trusting the runtime.
 */
export function verifyChain(events: readonly Event[]): {
  valid: boolean;
  brokenAt: number | null;
  reason?: string;
} {
  if (events.length === 0) {
    return { valid: true, brokenAt: null };
  }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event === undefined) {
      return { valid: false, brokenAt: i, reason: 'event at index is undefined' };
    }

    // Genesis event must have prevHash === null
    if (i === 0) {
      if (event.prevHash !== null) {
        return {
          valid: false,
          brokenAt: 0,
          reason: 'genesis event must have prevHash === null',
        };
      }
    } else {
      const prior = events[i - 1];
      if (prior === undefined) {
        return { valid: false, brokenAt: i, reason: 'prior event is undefined' };
      }
      if (event.prevHash !== prior.contentHash) {
        return {
          valid: false,
          brokenAt: i,
          reason: `prevHash mismatch: expected ${prior.contentHash}, got ${event.prevHash ?? '<null>'}`,
        };
      }
    }

    // contentHash must match recomputed hash
    const { id: _id, contentHash, ...hashable } = event;
    void _id;
    const recomputed = computeContentHash(hashable);
    if (recomputed !== contentHash) {
      return {
        valid: false,
        brokenAt: i,
        reason: `contentHash mismatch: stored ${contentHash}, recomputed ${recomputed}`,
      };
    }
  }

  return { valid: true, brokenAt: null };
}

/**
 * Genesis-event prevHash sentinel. Exported so adapters can use the
 * canonical value when constructing the first event of an intent's
 * chain.
 */
export const GENESIS_PREV_HASH = null;
