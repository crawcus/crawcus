/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  HumanOversight,
  OversightId,
  OversightRequirementId,
  TenantId,
} from '@crawcus/spec';

/**
 * # OversightStorePort — adapter for retrieving HumanOversight records
 *
 * Tallyseal-runtime port. Per Q-CR8 LOCKED 2026-05-22: Role + Org
 * abstraction means adapters MUST preserve the full `OverseerRef`
 * (role + orgId + committee members + rotation deadline) on round-
 * trip. Lossy adapters will be caught by the TCK round-trip fixture.
 *
 * Adapters MUST scope reads by `tenantId` (ratchet #20).
 */
export interface OversightStorePort {
  byId(tenantId: TenantId, oversightId: OversightId): Promise<HumanOversight | null>;
  /**
   * Load all HumanOversight records for a (tenant, requirementId)
   * pair. Used at writeEvent pre-check to compute most-recent
   * conducted review + verify gap discipline + role acceptance.
   * Returns BOTH signed-off and escalated records — evaluator
   * computes state.
   */
  forRequirement(
    tenantId: TenantId,
    requirementId: OversightRequirementId,
  ): Promise<readonly HumanOversight[]>;
}
