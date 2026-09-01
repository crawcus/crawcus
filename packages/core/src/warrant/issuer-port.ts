/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TenantId, Warrant, WarrantId } from '@crawcus/spec';

/**
 * # WarrantIssuerPort — adapter for issuing + revoking Warrants
 *
 * Tallyseal-runtime port. Optional — only runtimes that self-issue
 * Warrants need this. Tenants that consume only externally-issued
 * Warrants (Big-4 / Notified Body / MGA / Regulator) omit this
 * port entirely.
 *
 * Implementations:
 *   - `@tallyseal/warrant-issuer-self` (planned, Y1 H1; self-signed
 *     dev-mode Warrants)
 *   - `@tallyseal/warrant-issuer-cloud` (Cloud-only, sells Warrants
 *     per C3 operated-content premium)
 *   - Big-4 / Notified Body integrations are external (HTTPS issuer
 *     APIs); adapters wrap their issuance endpoints.
 *
 * Adapters MUST refuse to issue Warrants whose `tenantId` mismatches
 * the calling actor's tenant (multi-tenant safety).
 */
export interface WarrantIssuerPort {
  /**
   * Issue a new Warrant. The issuer constructs the full Warrant
   * (incl. signature) using its private key. Returns the signed
   * Warrant for storage by the caller.
   */
  issue(
    request: Omit<Warrant, 'id' | 'issuerSignature' | 'revokedAt' | 'revocationReason'>,
  ): Promise<Warrant>;

  /**
   * Revoke a previously-issued Warrant. Sets `revokedAt` + populates
   * `revocationReason`. Returns the updated Warrant (with the new
   * `revokedAt` field); callers re-store it.
   *
   * Per spec, signature is over the ORIGINAL Warrant fields — so
   * revoking does NOT require re-signing. The evaluator checks
   * `revokedAt !== null` BEFORE signature verification (revocation
   * precedes everything; see evaluate.ts).
   */
  revoke(tenantId: TenantId, warrantId: WarrantId, reason: string): Promise<Warrant>;
}
