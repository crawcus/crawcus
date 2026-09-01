import type {
  ActorId,
  ConsentId,
  ConsentRequirementId,
  ContentHash,
  IntentKey,
  ProcessingPurpose,
  SubjectId,
  TenantId,
  Timestamp,
} from '../types/ids.js';
import type { RegulationCitation } from '../contract/types.js';
import type { Intent, CrawcusSpec } from '../types/intent.js';
import type { Event } from '../types/event.js';
import type { Tenant } from '../types/tenant.js';

/**
 * # Consent — CRAWCUS primitive #12
 *
 * A **data-subject-issued** authorization for specific data
 * processing purposes. Legally distinct from Warrant (issuer-signed
 * authority) and Disclosure (system-emitted notice) — Consent is
 * **inbound** from the data subject (or their legal guardian) to
 * the runtime:
 *
 *   *"I (the data subject) authorize you (the operator) to process
 *    my data for purposes P1..Pn, under regulation R, until I
 *    withdraw."*
 *
 * Per Q-CR6 LOCKED 2026-05-22: **fully distinct from Warrant**.
 * Conflating risks GDPR Art 7 vs Art 6 misframing — Consent is one
 * possible lawful basis under Art 6(1)(a), with its own withdrawal
 * mechanics (Art 7(3)). API + storage may share infrastructure
 * under the hood; type system enforces the distinction.
 *
 * ## Lifecycle
 *
 *   requested (system asks)
 *     → granted (`ConsentGranted` event references this Consent.id)
 *     → exercised (events with `consentEventId` reference the grant)
 *     → withdrawn (`ConsentRevoked` event references this Consent.id;
 *        all future processing for this purpose halts)
 *
 * ## Why distinct from Warrant
 *
 * | Property | Consent | Warrant |
 * |---|---|---|
 * | Issuer | Data subject (or guardian) | Authority |
 * | Legal weight | GDPR Art 7 / FERPA §99.30 / HIPAA 45 CFR 164.508 | Industry attestation / insurance / regulatory |
 * | Withdrawal | Intrinsic right (Art 7(3) "as easy to withdraw as to give") | Issuer-controlled revocation |
 * | Renewal | Subject-driven | Authority-driven (often fee-based) |
 * | Scope | Specific processing purposes | Broad operational authorization |
 *
 * Spec: `07-engineering/primitives-audit-2026-05-21.md` §#12.
 * Q-CR6 LOCKED 2026-05-22 (fully distinct modules).
 *
 * ## Wire format: Kantara Consent Receipt v1.1 compatibility
 *
 * The `ConsentReceipt` shape is intentionally aligned with Kantara
 * CR v1.1 (https://kantarainitiative.org/confluence/display/infosharing/Consent+Receipt+Specification).
 * Federation across CRAWCUS-conformant runtimes is wire-format-stable
 * by construction.
 */

// ============ Withdrawal method ============

/**
 * How a Consent was withdrawn. Channels mirror Kantara CR §5.5 +
 * GDPR Art 7(3) "as easy to withdraw as to give" requirement.
 */
export type WithdrawalMethod =
  | 'in-app'
  | 'email'
  | 'phone'
  | 'mail'
  | 'api'
  | 'data-subject-portal';

// ============ Receipt (Kantara CR v1.1 compatible) ============

/**
 * Consent Receipt per Kantara CR v1.1. Intentionally non-exhaustive
 * here — v0.3.0 ships the minimum cross-jurisdiction-portable subset;
 * v1.0 will surface the full Kantara field set. Wire-format-stable.
 */
export interface ConsentReceipt {
  /** Kantara `version` field. */
  readonly version: '1.1';
  /** Stable per-grant identifier rendered into audit bundles. */
  readonly jurisdiction: string;
  /** Free-form natural-language statement of what was consented to. */
  readonly consentStatement: string;
  /** Locale of the statement (BCP 47). */
  readonly locale: string;
  /** Hash of the consentStatement + locale for tamper-evidence. */
  readonly contentHash: ContentHash;
}

// ============ Requirement ============

/**
 * A spec-declared consent obligation. When the spec is invoked
 * (writeEvent with this spec's intent), the runtime checks that
 * every required consent is currently granted (not withdrawn,
 * within scope, in window) for every data subject.
 *
 * The `id` is stable across runtime restarts — it identifies the
 * regulation-driven consent obligation (e.g., "GDPR Art 7 for
 * AI training data"), not a specific consent instance.
 */
export interface ConsentRequirement {
  readonly id: ConsentRequirementId;
  readonly regulation: RegulationCitation;
  /** The granular processing purposes this requirement covers. */
  readonly purposes: readonly ProcessingPurpose[];
  /**
   * Per GDPR Art 7(3) right-of-withdrawal: a Consent must be
   * actively-granted (not withdrawn) at write time. This is
   * always-required by construction; the field is reserved for
   * future "grace period" semantics (e.g., FERPA §99.31(a)(15)).
   */
  readonly mustBeActive: true;
}

// ============ Consent (the stored authorization) ============

export interface Consent {
  readonly id: ConsentId;
  readonly tenantId: TenantId;
  /** The data subject the consent is for. */
  readonly subject: SubjectId;
  /** Who granted (usually = subject; differs for guardian-on-behalf). */
  readonly grantor: ActorId;
  /** Which `ConsentRequirement` this grant satisfies. */
  readonly requirementId: ConsentRequirementId;
  /** Granular processing purposes consented to (subset of requirement.purposes). */
  readonly purposes: readonly ProcessingPurpose[];
  readonly regulation: RegulationCitation;
  readonly grantedAt: Timestamp;
  /** `null` until a `ConsentRevoked` event references this id. */
  readonly withdrawnAt: Timestamp | null;
  readonly withdrawalMethod: WithdrawalMethod | null;
  readonly receipt: ConsentReceipt;
}

// ============ Evaluation context + result ============

export interface ConsentCtx {
  readonly intent: Intent;
  readonly spec: CrawcusSpec;
  readonly tenant: Tenant;
  readonly events: readonly Event[];
  /** Data subjects whose consent state must be verified. */
  readonly dataSubjectIds: readonly SubjectId[];
  /**
   * The processing purpose the current event invokes — must be a
   * subset of every required Consent's `purposes`.
   */
  readonly processingPurpose: ProcessingPurpose;
  readonly now: Date;
}

export type ConsentEvaluationStatus =
  | 'valid'
  | 'missing'
  | 'withdrawn'
  | 'purpose-out-of-scope'
  | 'regulation-mismatch';

export type ConsentCheckpoint = 'pre' | 'inv' | 'post';

export interface ConsentEvaluationResult {
  readonly requirementId: ConsentRequirementId;
  readonly subject: SubjectId;
  readonly checkpoint: ConsentCheckpoint;
  readonly status: ConsentEvaluationStatus;
  readonly reason?: string;
  readonly evaluatedAt: Timestamp;
}

// ============ Event payloads ============

/**
 * Payload of a `ConsentRequired` event. Recorded when the runtime
 * rejects a proposed event because Consent is not in a valid state.
 * Mirrors `DisclosureRequiredPayload` + `WarrantViolationPayload`.
 */
export interface ConsentRequiredPayload {
  readonly requirementId: ConsentRequirementId;
  readonly subject: SubjectId;
  readonly processingPurpose: ProcessingPurpose;
  readonly checkpoint: ConsentCheckpoint;
  readonly status: Exclude<ConsentEvaluationStatus, 'valid'>;
  readonly reason: string;
  readonly specKey: IntentKey;
}
