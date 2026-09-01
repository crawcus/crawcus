import type {
  Consent,
  ConsentCheckpoint,
  ConsentCtx,
  ConsentEvaluationResult,
  ConsentEvaluationStatus,
  ConsentRequirement,
} from './types.js';
import type { SubjectId, Timestamp } from '../types/ids.js';
import { isoDate } from '../event/canonical-json.js';

/**
 * # evaluateConsent — the pre / inv / post pure evaluator
 *
 * Pure, total, side-effect-free. Given a single `ConsentRequirement`,
 * the set of `Consent` records the runtime has located for the
 * (tenant, subject, requirement) combination, the materialised
 * evaluation context, and the current checkpoint — return a
 * `ConsentEvaluationResult` discriminated by `status`.
 *
 * Mirrors `evaluateDisclosure` + `evaluateWarrant` structurally; the
 * semantics are GDPR-Art-7-shaped. Per Q-CR6 LOCKED 2026-05-22:
 * Consent is fully distinct from Warrant; this evaluator MUST NOT
 * conflate.
 *
 * ## Evaluation order (failures short-circuit)
 *
 *   1. **Missing** — no Consent record exists for the (subject,
 *      requirement) pair → `'missing'`.
 *   2. **Withdrawn** — the most-recent Consent has a `withdrawnAt`
 *      timestamp → `'withdrawn'` (per GDPR Art 7(3) right-of-
 *      withdrawal; processing must halt).
 *   3. **Regulation mismatch** — the most-recent active Consent's
 *      regulation citation differs from the requirement's →
 *      `'regulation-mismatch'`. Defensive against accidental record-
 *      crossing.
 *   4. **Purpose out-of-scope** — the event's `processingPurpose` is
 *      NOT in the Consent.purposes set → `'purpose-out-of-scope'`.
 *      GDPR Art 7 specificity: a Consent for `'ai-training'` does
 *      NOT authorize `'ad-targeting'`.
 *   5. Otherwise → `'valid'`.
 *
 * Order matters for audit clarity: a missing-consent failure always
 * reports `'missing'` even if the requirement is also out-of-scope
 * — the certain failure reason is the absence of any consent.
 */
export function evaluateConsent(
  requirement: ConsentRequirement,
  subject: SubjectId,
  consents: readonly Consent[],
  ctx: ConsentCtx,
  checkpoint: ConsentCheckpoint = 'pre',
): ConsentEvaluationResult {
  const evaluatedAt = isoDate(ctx.now) as Timestamp;

  function result(status: ConsentEvaluationStatus, reason?: string): ConsentEvaluationResult {
    return reason === undefined
      ? { requirementId: requirement.id, subject, checkpoint, status, evaluatedAt }
      : { requirementId: requirement.id, subject, checkpoint, status, reason, evaluatedAt };
  }

  // ============ 1. Missing ============
  const forSubjectAndRequirement = consents.filter(
    (c) => c.subject === subject && c.requirementId === requirement.id,
  );
  if (forSubjectAndRequirement.length === 0) {
    return result(
      'missing',
      `No Consent granted by subject '${subject}' for requirement '${requirement.id}'`,
    );
  }

  // Most-recent active grant — sort by grantedAt descending. Earlier
  // length guard guarantees non-empty.
  const mostRecent = forSubjectAndRequirement.reduce((acc, c) =>
    c.grantedAt > acc.grantedAt ? c : acc,
  );

  // ============ 2. Withdrawn ============
  if (mostRecent.withdrawnAt !== null) {
    return result(
      'withdrawn',
      `Most recent Consent for subject '${subject}' was withdrawn at ${mostRecent.withdrawnAt}`,
    );
  }

  // ============ 3. Regulation mismatch ============
  // Compare `regulation` (RegulationVersion brand) + `article`
  // literally. Two Consents under different versions of the same
  // regulation are treated as DIFFERENT obligations — version-tolerant
  // matching would require parsing the brand string, deferred to v0.4
  // when we introduce a regulation-family helper. The strict literal
  // match is L1-doesn't-lie-conservative.
  if (
    mostRecent.regulation.regulation !== requirement.regulation.regulation ||
    mostRecent.regulation.article !== requirement.regulation.article
  ) {
    return result(
      'regulation-mismatch',
      `Consent regulation (${mostRecent.regulation.regulation} ${mostRecent.regulation.article}) does not match requirement (${requirement.regulation.regulation} ${requirement.regulation.article})`,
    );
  }

  // ============ 4. Purpose out-of-scope ============
  if (!mostRecent.purposes.includes(ctx.processingPurpose)) {
    return result(
      'purpose-out-of-scope',
      `Processing purpose '${ctx.processingPurpose}' is not in Consent.purposes (${mostRecent.purposes.join(', ')}) for subject '${subject}'`,
    );
  }

  // ============ Valid ============
  return result('valid');
}
