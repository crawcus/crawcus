import type { RegulationVersion } from '@crawcus/core';

/**
 * Pinned regulator-quarter for this module's content. Customers
 * reference this in `tallyseal.compliance.ts` via
 * `regulations: ['gdpr@2025-Q1']`.
 *
 * Quarterly refresh cadence per `03-compliance/reg-as-code.md`.
 * Stale versions get a deprecation window per ratchet #4.
 */
export const GDPR_VERSION = 'gdpr@2025-Q1' as RegulationVersion;
