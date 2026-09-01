/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import canonicalize from 'canonicalize';

/**
 * RFC 8785 JSON Canonicalization Scheme wrapper.
 *
 * Returns the canonical UTF-8 serialisation of `value`: keys sorted
 * lexicographically by UTF-8 code-point, no insignificant whitespace,
 * numbers per RFC 8785 §3.2.2, strings per RFC 8785 §3.2.3.
 *
 * Hash equivalence across implementations (TS / Go / Rust / Python)
 * is the load-bearing property. Conformance fixtures live in
 * `@crawcus/tck` (4b).
 *
 * @throws TypeError if `value` is not JSON-serialisable (functions,
 * symbols, cycles, BigInt) OR contains non-finite numbers
 * (NaN / Infinity / -Infinity). RFC 8785 §3.2.2 forbids non-finite
 * numbers; coercing them to `null` (as JSON.stringify does) would
 * break hash equivalence across implementations because the original
 * value cannot be recovered. Reject at the boundary instead.
 */
export function canonicalJSON(value: unknown): string {
  assertJsonFinite(value);
  const result = canonicalize(value);
  if (typeof result !== 'string') {
    throw new TypeError('canonicalJSON: value is not JSON-serialisable');
  }
  return result;
}

/**
 * Walk `value` and throw TypeError if any number is non-finite.
 *
 * Cycles produce stack overflow on the recursive descent — which is
 * acceptable; cycles are also not JSON-serialisable, so the eventual
 * `canonicalize()` call would reject them anyway. We don't pre-emptively
 * detect them here to keep this guard cheap on the common path.
 */
function assertJsonFinite(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError(
      `canonicalJSON: non-finite number (${value}) — RFC 8785 forbids NaN / Infinity`,
    );
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) assertJsonFinite(v);
    return;
  }
  for (const v of Object.values(value as Record<string, unknown>)) {
    assertJsonFinite(v);
  }
}

/**
 * Sentinel for canonicalising `Date` instances. Per RFC 3339 / ISO 8601
 * with sub-second precision in Z-terminated UTC form, matching the
 * wire-format spec (`02-product/crawcus-format.md` v0.2). Dates
 * MUST be normalised to this string form before passing to
 * `canonicalJSON` — vanilla JSON serialisation would format them
 * inconsistently across runtimes otherwise.
 */
export function isoDate(d: Date): string {
  return d.toISOString();
}

/**
 * Normalise a payload by replacing every Date with its ISO-8601 string
 * recursively. Required before canonicalisation because RFC 8785
 * doesn't define Date semantics — it only canonicalises JSON values.
 *
 * Pure; returns a new object tree, leaves input untouched.
 */
export function normaliseForCanonical(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return isoDate(value);
  if (Array.isArray(value)) return value.map(normaliseForCanonical);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normaliseForCanonical(v);
    }
    return out;
  }
  return value;
}
