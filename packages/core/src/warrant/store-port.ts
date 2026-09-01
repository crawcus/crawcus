/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TenantId, IntentKey, Warrant, WarrantId } from '@crawcus/spec';

/**
 * # WarrantStorePort — adapter for retrieving active Warrants
 *
 * Tallyseal-runtime port — Tallyseal's choice of how Warrants are
 * stored / fetched. Other CRAWCUS-conformant runtimes are free to
 * adopt a different storage shape; the spec only mandates the wire
 * format of Warrants themselves (see `@crawcus/spec`).
 *
 * Implementations:
 *   - `@tallyseal/warrant-store-prisma` (planned, Y1 H1)
 *   - `@tallyseal/warrant-store-supabase` (planned, Y1 H1)
 *   - `@tallyseal/warrant-store-cloud` (Cloud-only, operated per C3)
 *
 * Adapters MUST scope reads by `tenantId` — never return Warrants
 * across tenants (ratchet #18 multi-tenant safety).
 */
export interface WarrantStorePort {
  /** Load a single Warrant by ID. Returns null if not found / not in tenant scope. */
  byId(tenantId: TenantId, warrantId: WarrantId): Promise<Warrant | null>;

  /**
   * Load all currently-active Warrants for a tenant that match the
   * given spec key. "Active" = not revoked + within issuedAt /
   * expiresAt window relative to `now`. The store handles the temporal
   * filter; the caller (evaluator) handles signature + scope checks.
   */
  activeForSpec(tenantId: TenantId, specKey: IntentKey, now: Date): Promise<readonly Warrant[]>;
}
