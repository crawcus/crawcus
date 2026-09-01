/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalisePredicateSource } from './normalise.js';

/**
 * Q-S lock: predicate-source size limit. Normalised source MUST NOT
 * exceed 4 KB. Larger predicates are an anti-pattern (hard to audit,
 * hard to test, hard to render in audit bundles); the validator
 * refuses them at build time and recommends refactoring into multiple
 * smaller named Contracts.
 */
export const PREDICATE_SIZE_LIMIT_BYTES = 4 * 1024;

export interface SizeLimitResult {
  readonly ok: boolean;
  readonly sizeBytes: number;
  readonly limitBytes: number;
}

export function checkPredicateSize(predicate: (...args: never[]) => boolean): SizeLimitResult {
  return checkPredicateSizeFromSource(predicate.toString());
}

export function checkPredicateSizeFromSource(source: string): SizeLimitResult {
  const normalised = normalisePredicateSource(source);
  const sizeBytes = new TextEncoder().encode(normalised).byteLength;
  return {
    ok: sizeBytes <= PREDICATE_SIZE_LIMIT_BYTES,
    sizeBytes,
    limitBytes: PREDICATE_SIZE_LIMIT_BYTES,
  };
}
