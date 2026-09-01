import type { Disclosure, DisclosureId, DisclosureRequirementId } from '@crawcus/spec';
import type { SubjectId, TenantId } from '@crawcus/spec';

/**
 * # DisclosureStorePort — adapter for retrieving delivered Disclosures
 *
 * Tallyseal-runtime port — Tallyseal's choice of how Disclosures are
 * stored / fetched. Other CRAWCUS-conformant runtimes are free to
 * adopt a different storage shape; the spec only mandates the wire
 * format of Disclosures themselves (`@crawcus/spec`).
 *
 * Implementations:
 *   - `@tallyseal/disclosure-store-prisma` (planned, Y1 H1)
 *   - `@tallyseal/disclosure-store-supabase` (planned, Y1 H1)
 *   - `@tallyseal/disclosure-store-cloud` (Cloud-only, operated per C3)
 *
 * Adapters MUST scope reads by `tenantId` — never return Disclosures
 * across tenants (ratchet #20 multi-tenant safety).
 */
export interface DisclosureStorePort {
  /** Load a single Disclosure by ID. Returns null if not found / not in tenant scope. */
  byId(tenantId: TenantId, disclosureId: DisclosureId): Promise<Disclosure | null>;

  /**
   * Load all Disclosures for a (tenant, subject) pair matching the
   * given requirement set. The caller (evaluator) handles recurrence-
   * window + acknowledgment + retraction logic; the store just returns
   * the raw delivery records.
   *
   * Returning ALL deliveries (including retracted, including expired)
   * is intentional — the evaluator needs the full history to compute
   * the "most recent non-retracted" state per requirement.
   */
  forSubjectAndRequirements(
    tenantId: TenantId,
    subject: SubjectId,
    requirementIds: readonly DisclosureRequirementId[],
  ): Promise<readonly Disclosure[]>;
}
