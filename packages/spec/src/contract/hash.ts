/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { ContentHash } from '../types/ids.js';
import { normalisePredicateSource } from './normalise.js';

/**
 * SHA-256 over the canonical predicate source. Used to:
 *
 *   1. Embed a stable identifier of the predicate in audit bundles
 *      so auditors can verify "this predicate, recomputed, matches
 *      the one recorded".
 *   2. Detect predicate evolution across spec versions (a changed
 *      hash signals a `version + 1` bump is required).
 *   3. Replay-verify `'warn'` ContractViolation events against the
 *      historical predicate (Q-U lock).
 *
 * Pure; deterministic; depends only on `normalisePredicateSource`
 * (text normalisation) + `@noble/hashes/sha256`.
 */
export function hashPredicate(predicate: (...args: never[]) => boolean): ContentHash {
  return hashPredicateSource(predicate.toString());
}

/**
 * Hash directly from a source string. Used when the source has
 * already been extracted (e.g., from an audit bundle) and we want
 * to recompute the hash without re-stringifying a Function.
 */
export function hashPredicateSource(source: string): ContentHash {
  const normalised = normalisePredicateSource(source);
  const bytes = sha256(new TextEncoder().encode(normalised));
  return bytesToHex(bytes) as ContentHash;
}
