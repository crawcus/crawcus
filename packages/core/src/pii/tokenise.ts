/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PIIPort } from '../ports/pii.js';
import type { TenantCtx } from '@crawcus/spec';
import type { Tainted, Untainted } from '@crawcus/spec';
import { RawPIIInPayloadError } from '../errors/index.js';
import { isMarker } from './marker.js';

/**
 * Boundary tokeniser — the ONLY function that promotes `Tainted<T>`
 * to `Untainted<T>`. Customer code that bypasses this cannot
 * satisfy `writeEvent`'s signature; the TS compiler refuses.
 *
 * Walks every string value in the payload, calling
 * `ctx.pii.tokenize` to detect + replace any PII spans with
 * `[[pii:<token>]]` markers. Originals go to the vault
 * (adapter-specific; e.g., per-tenant-encrypted KMS-backed store).
 *
 * Per `00-canon/compliance-by-design.md` §1: this runs before the
 * Event log. Strings already containing markers are passed through
 * unchanged (already tokenised — typically when re-emitting
 * extracted suggestions).
 *
 * Pure-async over the input — never mutates.
 */
export async function tokenisePayload<T>(
  payload: Tainted<T>,
  ctx: TenantCtx & { pii: PIIPort },
): Promise<Untainted<T>> {
  const result = await walk(payload, async (s) => {
    if (isMarker(s)) return s; // already tokenised — leave alone
    const out = await ctx.pii.tokenize(s, { tenant: ctx.tenant, actor: ctx.actor });
    return out.text;
  });
  return result as Untainted<T>;
}

/**
 * Defense-in-depth scrubber — runs INSIDE `writeEvent` even though
 * the `Untainted<T>` compile-time guarantee already holds. Catches:
 *
 *   - Adapters that bypass the type system (the `no-untainted-cast`
 *     lint rule plans to catch this at lint time too).
 *   - Emergent PII the customer didn't anticipate but a detector
 *     surfaces (e.g., a stray DOB in a free-text field).
 *
 * Walks every string; runs `ctx.pii.detect`; throws
 * `RawPIIInPayloadError` if any non-marker string contains detected
 * PII spans.
 */
export async function assertNoRawPII(payload: unknown, ctx: { pii: PIIPort }): Promise<void> {
  await walk(payload, async (s) => {
    if (isMarker(s)) return s;
    const hits = await ctx.pii.detect(s);
    const first = hits[0];
    if (first) {
      throw new RawPIIInPayloadError(
        `raw PII detected in event payload: kind='${first.kind}' confidence=${first.confidence} at offset ${first.start}-${first.end}`,
        'unknown',
        first.kind,
      );
    }
    return s;
  });
}

// ---------- internal: recursive string walker ----------

/**
 * Walk every string in a nested value, applying `transform` to each.
 * Returns a new value tree with transformed strings; never mutates
 * input.
 *
 * Non-string leaves (numbers, booleans, null, Date) pass through
 * unchanged. Arrays + plain objects are recursed. Class instances
 * other than Date are passed through as-is (we don't introspect
 * private state).
 */
async function walk(value: unknown, transform: (s: string) => Promise<string>): Promise<unknown> {
  if (typeof value === 'string') {
    return transform(value);
  }
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    const out = await Promise.all(value.map((v) => walk(v, transform)));
    return out;
  }
  if (typeof value === 'object') {
    // Only recurse into plain objects (not class instances)
    const proto = Object.getPrototypeOf(value) as object | null;
    if (proto === Object.prototype || proto === null) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = await walk(v, transform);
      }
      return out;
    }
    return value;
  }
  return value;
}
