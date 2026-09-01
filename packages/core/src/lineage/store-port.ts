/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IntentId, Lineage, LineageId, TenantId } from '@crawcus/spec';

/**
 * # LineageStorePort — adapter for retrieving Lineage records
 *
 * Tallyseal-runtime port. Per Q-CR7 LOCKED 2026-05-22 (strict W3C
 * PROV-O JSON-LD wire format), Lineage records are serialized per
 * the canonical schema; storage adapters MUST round-trip the
 * `provO` field byte-faithfully (no lossy transforms).
 *
 * Adapters MUST scope reads by `tenantId` (ratchet #20).
 */
export interface LineageStorePort {
  byId(tenantId: TenantId, lineageId: LineageId): Promise<Lineage | null>;
  /**
   * Load all Lineage records for an intent. Used at writeEvent
   * pre-check to verify Lineage coverage of AI-mediated events on
   * the chain.
   */
  forIntent(tenantId: TenantId, intentId: IntentId): Promise<readonly Lineage[]>;
}
