/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IssuerId } from '../types/ids.js';
import type { IssuerKind, Warrant } from './types.js';

/**
 * # IssuerTrust — explicit trust roots + TOFU dev escape hatch
 * (Q-CR5 LOCKED 2026-05-21)
 *
 * Explicit per-tenant trust roots are the **production default**.
 * Trust-on-first-use (TOFU) is a **dev-mode escape hatch only**.
 *
 * Why explicit-first (Lighthouse L1 doesn't-lie):
 *   - Implicit trust = a lie waiting to happen. A Warrant claiming
 *     `issuer.id = 'pwc-uk'` could ship any public key in the
 *     Warrant body; without explicit trust roots the verifier has
 *     no way to know whether that key is genuinely PwC UK's.
 *   - Explicit trust roots (`issuerId → known-good publicKey`) are
 *     auditor-defensible: a regulator can ask "show me your trust
 *     roots" and the tenant produces a deterministic, signed list.
 *   - TOFU is for dev / local fixtures: `acceptUnknown: true` makes
 *     evaluators accept the public key in the Warrant body. Tests
 *     and getting-started flows use this. Production MUST set
 *     explicit roots.
 *
 * Runtime warning: when `acceptUnknown === true`, the runtime
 * SHOULD surface a non-fatal warning at tenant initialization
 * (`/core` emits this via the AI proxy log; OEMs are free
 * to do likewise). The spec doesn't mandate the warning channel —
 * just that production deployments not run with `acceptUnknown:
 * true` silently.
 */

/**
 * A trusted issuer — anchored at trust-root time, not at warrant
 * verification time. `publicKey` is the known-good key for this
 * issuer; the verifier checks Warrants from this `issuerId` against
 * THIS key, ignoring whatever key is in the Warrant body.
 *
 * `kind` is informational (it must match `Warrant.issuer.kind` —
 * downstream policy code may filter "only accept big-4 + notified-
 * body Warrants" etc.).
 */
export interface IssuerTrustEntry {
  readonly issuerId: IssuerId;
  /** Base64-encoded Ed25519 public key (32 bytes raw → 44 chars). */
  readonly publicKey: string;
  readonly kind: IssuerKind;
  /** Display name (e.g., `'PwC AI Assurance'`); informational. */
  readonly name: string;
}

/**
 * Per-tenant Warrant trust configuration. Production deployments
 * populate `roots` with their known-good issuer set; `acceptUnknown`
 * stays `false`. Dev / fixture deployments may set
 * `acceptUnknown: true` to skip the trust check (the Warrant's own
 * `issuer.publicKey` is used to verify the signature).
 */
export interface IssuerTrust {
  readonly roots: readonly IssuerTrustEntry[];
  /**
   * Dev-mode escape hatch. **MUST be `false` in production.** When
   * `true`, Warrants from issuers not in `roots` are accepted, using
   * the `issuer.publicKey` from the Warrant body. This trades trust
   * for ergonomics — tests + fixtures avoid configuring trust roots.
   */
  readonly acceptUnknown: boolean;
}

/**
 * Result of resolving a Warrant's trust status: the public key to
 * use for signature verification, OR `null` if the issuer is
 * untrusted and `acceptUnknown === false`.
 *
 * The `trusted` field distinguishes the two acceptance paths so
 * downstream code (audit bundle render, telemetry) can record which
 * path was taken — useful for security review.
 */
export interface ResolvedTrust {
  /** Public key the verifier should check the signature against. */
  readonly publicKey: string;
  /**
   * - `'explicit'`: issuer found in `IssuerTrust.roots`.
   * - `'tofu'`: issuer not in roots; `acceptUnknown` was true; key
   *   came from the Warrant body. Dev mode only.
   */
  readonly trusted: 'explicit' | 'tofu';
}

/**
 * Resolve which public key to verify a Warrant's signature against.
 * Pure; deterministic; no I/O.
 *
 * Order of resolution:
 *   1. If `warrant.issuer.id` matches a `roots` entry: use that
 *      entry's `publicKey`. Tag `trusted: 'explicit'`.
 *   2. Else if `trust.acceptUnknown === true`: use
 *      `warrant.issuer.publicKey` (TOFU dev mode). Tag
 *      `trusted: 'tofu'`.
 *   3. Else: return `null`. The evaluator will report status
 *      `'untrusted-issuer'`.
 *
 * Note: this function does NOT verify the signature itself — it
 * only resolves WHICH key to verify against. The evaluator calls
 * `verifyWarrantSignature` next with this key.
 */
export function resolveTrustedPublicKey(
  trust: IssuerTrust,
  warrant: Warrant,
): ResolvedTrust | null {
  const explicit = trust.roots.find((r) => r.issuerId === warrant.issuer.id);
  if (explicit !== undefined) {
    return { publicKey: explicit.publicKey, trusted: 'explicit' };
  }
  if (trust.acceptUnknown) {
    return { publicKey: warrant.issuer.publicKey, trusted: 'tofu' };
  }
  return null;
}
