import type {
  HumanOversight,
  OversightCheckpoint,
  OversightCtx,
  OversightEvaluationResult,
  OversightEvaluationStatus,
  OversightRequirement,
} from './types.js';
import type { Timestamp } from '../types/ids.js';
import { isoDate } from '../event/canonical-json.js';

/**
 * # evaluateOversight — the pre / inv / post pure evaluator
 *
 * Pure, total, side-effect-free. Given a single `OversightRequirement`,
 * the set of `HumanOversight` records the runtime has located for the
 * (tenant, requirement) pair, the evaluation context, and the
 * checkpoint — return an `OversightEvaluationResult` discriminated
 * by `status`.
 *
 * Per Q-CR8 LOCKED 2026-05-22: Role + Org abstraction. The evaluator
 * checks role acceptance + gap discipline + escalation state per the
 * regulation-specific requirement.
 *
 * ## Evaluation order (failures short-circuit)
 *
 *   1. **Missing** — no records present → `missing`.
 *   2. **Escalated** — most-recent review outcome is `'escalated'` →
 *      `escalated`. Federation rules suspend related Warrants on
 *      escalation; runtime must surface the state.
 *   3. **Role not accepted** — most-recent overseer's role is not in
 *      `requirement.acceptedRoles` → `role-not-accepted`. Defends
 *      against the "anyone in the org sign-off" failure mode.
 *   4. **Expired gap** — `now - mostRecent.conductedAt > maxGapDays`
 *      → `expired-gap`. Periodic-review discipline.
 *   5. Otherwise → `valid`.
 *
 * Order: missing dominates because the absence of any record is the
 * most certain failure. Escalation outranks role + gap because a
 * critical-finding review that triggered escalation indicates an
 * outstanding remediation requirement regardless of recency.
 */
export function evaluateOversight(
  requirement: OversightRequirement,
  oversights: readonly HumanOversight[],
  ctx: OversightCtx,
  checkpoint: OversightCheckpoint = 'pre',
): OversightEvaluationResult {
  const evaluatedAt = isoDate(ctx.now) as Timestamp;

  function result(status: OversightEvaluationStatus, reason?: string): OversightEvaluationResult {
    return reason === undefined
      ? { requirementId: requirement.id, checkpoint, status, evaluatedAt }
      : { requirementId: requirement.id, checkpoint, status, reason, evaluatedAt };
  }

  // ============ 1. Missing ============
  const forRequirement = oversights.filter((o) => o.requirementId === requirement.id);
  if (forRequirement.length === 0) {
    return result('missing', `No HumanOversight record exists for requirement '${requirement.id}'`);
  }

  // Most-recent by conductedAt — non-empty guaranteed by length check.
  const mostRecent = forRequirement.reduce((acc, o) => (o.conductedAt > acc.conductedAt ? o : acc));

  // ============ 2. Escalated ============
  if (mostRecent.outcome === 'escalated') {
    return result(
      'escalated',
      `Most-recent HumanOversight (${mostRecent.id}) is in 'escalated' state — remediation required before proceeding`,
    );
  }

  // ============ 3. Role not accepted ============
  if (!requirement.acceptedRoles.includes(mostRecent.overseer.role)) {
    return result(
      'role-not-accepted',
      `Overseer role '${mostRecent.overseer.role}' is not in requirement.acceptedRoles (${requirement.acceptedRoles.join(', ')})`,
    );
  }

  // ============ 4. Expired gap ============
  const conducted = new Date(mostRecent.conductedAt);
  const elapsedMs = ctx.now.getTime() - conducted.getTime();
  const maxGapMs = requirement.maxGapDays * 24 * 60 * 60 * 1000;
  if (elapsedMs > maxGapMs) {
    return result(
      'expired-gap',
      `Most-recent oversight conducted ${mostRecent.conductedAt} is more than ${requirement.maxGapDays} days old (now ${evaluatedAt})`,
    );
  }

  // ============ Valid ============
  return result('valid');
}
