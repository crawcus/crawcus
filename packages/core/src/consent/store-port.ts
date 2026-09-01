import type { Consent, ConsentId, ConsentRequirementId } from '@crawcus/spec';
import type { SubjectId, TenantId } from '@crawcus/spec';

/**
 * # ConsentStorePort — adapter for retrieving granted Consents
 *
 * Tallyseal-runtime port — Tallyseal's choice of how Consents are
 * stored / fetched. Other CRAWCUS-conformant runtimes are free to
 * adopt a different storage shape; the spec mandates only the wire
 * format of Consent + ConsentReceipt (Kantara CR v1.1 compatible).
 *
 * Implementations:
 *   - `@tallyseal/consent-store-prisma` (planned, Y1 H1)
 *   - `@tallyseal/consent-store-supabase` (planned, Y1 H1)
 *   - `@tallyseal/consent-store-cloud` (Cloud-only, operated per C3)
 *
 * Adapters MUST scope reads by `tenantId` (ratchet #20). Per GDPR
 * Art 7(3): adapters MUST return Consents even if withdrawn — the
 * evaluator computes withdrawal state from the record itself, not
 * by filtering at the storage layer.
 */
export interface ConsentStorePort {
  /** Load a single Consent by ID. Returns null if not found / not in tenant scope. */
  byId(tenantId: TenantId, consentId: ConsentId): Promise<Consent | null>;

  /**
   * Load all Consents for a (tenant, subject) pair matching the given
   * requirement set. Returns BOTH active and withdrawn records — the
   * evaluator computes the most-recent state per requirement.
   */
  forSubjectAndRequirements(
    tenantId: TenantId,
    subject: SubjectId,
    requirementIds: readonly ConsentRequirementId[],
  ): Promise<readonly Consent[]>;
}
