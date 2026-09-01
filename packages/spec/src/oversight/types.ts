import type {
  ActorId,
  IntentKey,
  OrgId,
  OversightId,
  OversightRequirementId,
  TenantId,
  Timestamp,
} from '../types/ids.js';
import type { RegulationCitation } from '../contract/types.js';
import type { Intent, CrawcusSpec } from '../types/intent.js';
import type { Event } from '../types/event.js';
import type { Tenant } from '../types/tenant.js';

/**
 * # HumanOversight — CRAWCUS primitive #14
 *
 * A record of supervisory review of AI system behavior by designated
 * oversight personnel. Distinct from `Suggestion` (which is the
 * per-decision AI-proposes-human-accepts cycle). HumanOversight
 * covers EU AI Act Art 14's broader oversight role: supervisors who
 * can detect, intervene in, and stop autonomous AI behavior —
 * including periodic post-hoc review of decisions the AI made
 * without inline human gating.
 *
 * Per Q-CR8 LOCKED 2026-05-22: **Role + Org abstraction**. Typed
 * role hierarchy supports regulation-specific specializations:
 *
 *   - FDA IND/IDE: named-individual Principal Investigator
 *   - EU AI Act Art 14: "person or persons" — committee or rotation
 *   - HIPAA: Security Officer with mandatory rotation
 *   - ISO 42001 §9.1: monitoring oversight role
 *
 * The `Overseer` type carries a role + organisation + (optional)
 * named individual; the runtime + audit-bundle layer can specialize
 * per-regulation without rebuilding the primitive.
 *
 * ## Why distinct from Suggestion
 *
 * | Moment | Primitive |
 * |---|---|
 * | Pre-decision (gate this specific output) | Suggestion (human-in-loop) |
 * | Periodic supervisory review | HumanOversight (human-on-loop) |
 * | Post-hoc audit of past period | HumanOversight (retrospective) |
 *
 * EU AI Act Art 14(4) explicitly mandates BOTH in-loop and on-loop
 * oversight modes; runtime exposes both as primitives.
 *
 * ## Lifecycle
 *
 *   scheduled → conducted → signed-off | escalated | remediation-required
 *
 * Escalation triggers `OversightEscalated` event which may, per
 * federation rules, suspend related Warrants or trigger issuer-
 * driven revocation.
 *
 * Spec: `07-engineering/primitives-audit-2026-05-21.md` §#14.
 * Q-CR8 LOCKED 2026-05-22.
 */

// ============ Role hierarchy (Q-CR8) ============

/**
 * Oversight role taxonomy. Regulation-driven specializations layer
 * on top via `concreteRole` discriminator. Locked closed for v0.5.0;
 * additions are additive-union per the EventKind discipline.
 */
export type OverseerRole =
  | 'individual' // named human (e.g., FDA PI)
  | 'committee' // multiple humans deliberate (e.g., AI Act Art 14 committee)
  | 'rotation' // role rotates per period (e.g., HIPAA Security Officer)
  | 'compliance-officer' // designated compliance role (ISO 42001)
  | 'ethics-board' // institutional ethics review board
  | 'notified-body'; // Y2 federation — external Notified Body review

export interface OverseerRef {
  /** ActorId of the overseer (or committee chair / rotation incumbent). */
  readonly id: ActorId;
  readonly role: OverseerRole;
  /** Organization the overseer represents. */
  readonly orgId: OrgId;
  /** Display name for audit-bundle rendering. */
  readonly name: string;
  /**
   * For `'committee'` role: members beyond the chair. The chair's
   * id is `id` above; this list captures the full committee.
   */
  readonly committeeMembers?: readonly ActorId[];
  /**
   * For `'rotation'` role: when the current incumbent's term ends.
   * Auditors verify the rotation discipline by checking
   * incumbent-at-time matches the conductedAt timestamp.
   */
  readonly rotationEndsAt?: Timestamp;
}

// ============ Scope ============

/**
 * What the oversight review covered. Discriminated union — each
 * variant carries the data needed to reconstruct the review's reach.
 */
export type OversightScope =
  | { readonly kind: 'period'; readonly from: Timestamp; readonly to: Timestamp }
  | {
      readonly kind: 'class-of-decisions';
      readonly specKey: IntentKey;
      readonly from: Timestamp;
      readonly to: Timestamp;
    }
  | { readonly kind: 'specific-event-set'; readonly eventIds: readonly string[] };

// ============ Mode ============

/**
 * Per EU AI Act Art 14(4): runtime must support both in-loop and
 * on-loop modes. Retrospective mode covers post-hoc audit reviews.
 */
export type OversightMode = 'in-loop' | 'on-loop' | 'retrospective';

// ============ Outcome ============

export type OversightOutcome = 'signed-off' | 'escalated' | 'remediation-required';

export interface OversightFinding {
  readonly id: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly description: string;
  /** Optional evidence — references to specific events / lineage / contracts. */
  readonly evidenceEventIds?: readonly string[];
}

// ============ Requirement (CrawcusSpec declaration) ============

/**
 * A spec-declared oversight obligation. When the runtime executes
 * the spec over a period, this requirement constrains who can
 * conduct supervisory review and how often.
 */
export interface OversightRequirement {
  readonly id: OversightRequirementId;
  readonly regulation: RegulationCitation;
  /** The role(s) authorized to conduct oversight under this requirement. */
  readonly acceptedRoles: readonly OverseerRole[];
  readonly mode: OversightMode;
  /**
   * Maximum gap (in days) between conducted oversight reviews before
   * the requirement is considered out-of-date.
   */
  readonly maxGapDays: number;
}

// ============ HumanOversight (the stored record) ============

export interface HumanOversight {
  readonly id: OversightId;
  readonly tenantId: TenantId;
  readonly requirementId: OversightRequirementId;
  readonly overseer: OverseerRef;
  readonly scope: OversightScope;
  readonly mode: OversightMode;
  readonly conductedAt: Timestamp;
  readonly outcome: OversightOutcome;
  readonly findings: readonly OversightFinding[];
  readonly regulation: RegulationCitation;
}

// ============ Evaluation context + result ============

export interface OversightCtx {
  readonly intent: Intent;
  readonly spec: CrawcusSpec;
  readonly tenant: Tenant;
  readonly events: readonly Event[];
  readonly now: Date;
}

export type OversightEvaluationStatus =
  | 'valid'
  | 'missing'
  | 'expired-gap'
  | 'role-not-accepted'
  | 'escalated';

export type OversightCheckpoint = 'pre' | 'inv' | 'post';

export interface OversightEvaluationResult {
  readonly requirementId: OversightRequirementId;
  readonly checkpoint: OversightCheckpoint;
  readonly status: OversightEvaluationStatus;
  readonly reason?: string;
  readonly evaluatedAt: Timestamp;
}

// ============ Event payloads ============

export interface OversightScheduledPayload {
  readonly oversightId: OversightId;
  readonly requirementId: OversightRequirementId;
  readonly scheduledFor: Timestamp;
  readonly overseerId: ActorId;
}

export interface OversightConductedPayload {
  readonly oversightId: OversightId;
  readonly requirementId: OversightRequirementId;
  readonly mode: OversightMode;
  readonly conductedAt: Timestamp;
  readonly findingCount: number;
}

export interface OversightSignedOffPayload {
  readonly oversightId: OversightId;
  readonly requirementId: OversightRequirementId;
  readonly overseerId: ActorId;
  readonly signedOffAt: Timestamp;
}

export interface OversightEscalatedPayload {
  readonly oversightId: OversightId;
  readonly requirementId: OversightRequirementId;
  readonly escalatedAt: Timestamp;
  readonly criticalFindingCount: number;
  readonly reason: string;
}

export interface OversightRequiredPayload {
  readonly requirementId: OversightRequirementId;
  readonly checkpoint: OversightCheckpoint;
  readonly status: Exclude<OversightEvaluationStatus, 'valid'>;
  readonly reason: string;
  readonly specKey: IntentKey;
}
