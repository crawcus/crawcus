import type {
  Disclosure,
  DisclosureCheckpoint,
  DisclosureCtx,
  DisclosureEvaluationResult,
  DisclosureEvaluationStatus,
  DisclosureRequirement,
} from './types.js';
import type { SubjectId, Timestamp } from '../types/ids.js';
import { isoDate } from '../event/canonical-json.js';

/**
 * # evaluateDisclosure — the pre / inv / post pure evaluator
 *
 * Pure, total, side-effect-free. Given a single `DisclosureRequirement`,
 * the set of `Disclosure` records the runtime has located for the
 * (tenant, subject, requirement) combination, the materialised
 * evaluation context, and the current checkpoint — return a
 * `DisclosureEvaluationResult` discriminated by `status`.
 *
 * Mirrors the Warrant evaluator pattern (`evaluateWarrant`). The
 * runtime caller iterates over `(requirement × subject)` combinations
 * and invokes this once per pair; the first non-`'valid'` result
 * short-circuits.
 *
 * ## Evaluation order (failures short-circuit)
 *
 *   1. **Undelivered** — no Disclosure exists for the (subject,
 *      requirement) pair → `'undelivered'`.
 *   2. **Retracted** — the most-recent Disclosure has a `retractedAt`
 *      timestamp → `'retracted'` (forces re-delivery).
 *   3. **Recurrence window** — for `'annual'` / `'per-session'` /
 *      `'per-event'` requirements, the most-recent non-retracted
 *      delivery must fall within the active window → `'expired-window'`.
 *      (`'once-per-subject'` skips this check.)
 *   4. **Acknowledgment** — if `requirement.mustAcknowledge`, the
 *      most-recent delivery must have a non-null `acknowledgedAt` →
 *      `'unacknowledged'`.
 *   5. **Per-session sentinel** — `'per-session'` requirement with
 *      undefined `ctx.sessionId` → `'subject-missing-session'`.
 *      (Caller must supply sessionId to enforce per-session
 *      recurrence; absence is treated as no-prior-session.)
 *   6. Otherwise → `'valid'`.
 *
 * Order matters for audit clarity: an `'undelivered'` failure always
 * reports `'undelivered'` even if the requirement also has acknowledgment
 * issues — the certain failure reason is the absence of any delivery.
 */
export function evaluateDisclosure(
  requirement: DisclosureRequirement,
  subject: SubjectId,
  disclosures: readonly Disclosure[],
  ctx: DisclosureCtx,
  checkpoint: DisclosureCheckpoint = 'pre',
): DisclosureEvaluationResult {
  const evaluatedAt = isoDate(ctx.now) as Timestamp;

  function result(status: DisclosureEvaluationStatus, reason?: string): DisclosureEvaluationResult {
    return reason === undefined
      ? { requirementId: requirement.id, subject, checkpoint, status, evaluatedAt }
      : { requirementId: requirement.id, subject, checkpoint, status, reason, evaluatedAt };
  }

  // ============ 1. Per-session sentinel ============
  // Check this FIRST so per-session requirements without a sessionId
  // fail with the most informative status (rather than 'undelivered'
  // which would hide the actual root cause).
  if (requirement.recurrence === 'per-session' && ctx.sessionId === undefined) {
    return result(
      'subject-missing-session',
      `Requirement '${requirement.id}' has recurrence 'per-session' but DisclosureCtx.sessionId is undefined`,
    );
  }

  // ============ 2. Undelivered ============
  const forSubjectAndRequirement = disclosures.filter(
    (d) => d.subject === subject && d.requirementId === requirement.id,
  );
  if (forSubjectAndRequirement.length === 0) {
    return result(
      'undelivered',
      `No Disclosure delivered to subject '${subject}' for requirement '${requirement.id}'`,
    );
  }

  // Sort by deliveredAt descending — most recent first. The earlier
  // `length === 0` guard guarantees at least one entry, so `reduce` to
  // pick the max avoids the lint-forbidden non-null assertion.
  const mostRecent = forSubjectAndRequirement.reduce((acc, d) =>
    d.deliveredAt > acc.deliveredAt ? d : acc,
  );

  // ============ 3. Retracted ============
  if (mostRecent.retractedAt !== null) {
    return result(
      'retracted',
      `Most recent Disclosure for subject '${subject}' was retracted at ${mostRecent.retractedAt}`,
    );
  }

  // ============ 4. Recurrence window ============
  if (requirement.recurrence !== 'once-per-subject') {
    const withinWindow = isWithinRecurrenceWindow(
      requirement.recurrence,
      mostRecent.deliveredAt,
      ctx.now,
    );
    if (!withinWindow) {
      return result(
        'expired-window',
        `Most recent delivery (${mostRecent.deliveredAt}) is outside the '${requirement.recurrence}' recurrence window`,
      );
    }
  }

  // ============ 5. Acknowledgment ============
  if (requirement.mustAcknowledge && mostRecent.acknowledgedAt === null) {
    return result(
      'unacknowledged',
      `Requirement '${requirement.id}' requires acknowledgment; most recent delivery to subject '${subject}' has not been acknowledged`,
    );
  }

  // ============ Valid ============
  return result('valid');
}

/**
 * Pure recurrence-window predicate. Exposed as a helper so the runtime
 * + auditors can reproduce window decisions independently of the
 * evaluator.
 */
export function isWithinRecurrenceWindow(
  recurrence: Exclude<DisclosureRequirement['recurrence'], 'once-per-subject'>,
  deliveredAt: Timestamp,
  now: Date,
): boolean {
  const delivered = new Date(deliveredAt);
  const elapsedMs = now.getTime() - delivered.getTime();

  if (recurrence === 'annual') {
    // 365 days ± leap-year tolerance. Use 365 * 24h; auditors who care
    // about leap precision can recompute with calendar arithmetic.
    return elapsedMs < 365 * 24 * 60 * 60 * 1000;
  }

  if (recurrence === 'per-event') {
    // Strict: re-delivery required for every event. An existing delivery
    // is *never* within the per-event window unless the current event
    // IS the delivery itself — which the runtime handles by sequencing
    // (delivery event → triggering event in the same chain).
    // For evaluator purposes, treat 'per-event' as never satisfied by
    // a pre-existing delivery; the runtime caller is responsible for
    // ensuring per-event semantics via event-kind sequencing.
    return false;
  }

  // 'per-session' — handled by the sentinel check above. If we reach
  // here with 'per-session', a sessionId was supplied; we have no
  // session-membership signal in the disclosure record itself, so
  // accept any delivery as in-window. Stricter session-binding is a
  // future enhancement (would require DisclosureContent to record the
  // sessionId at delivery time).
  return true;
}
