import type { Brand } from './brand.js';
import type { ConsentEventId, ContentHash, EventId, IntentId, SubjectId, TenantId } from './ids.js';
import type { LawfulBasis, SpecialCategoryBasis } from './compliance.js';
import type { Actor } from './tenant.js';
import type { Purpose } from './ids.js';

/**
 * Closed union of system event kinds. Exhaustively switchable —
 * dispatchers MUST end with `assertNever(value)` per ratchet #19.
 *
 * Per-projection custom kinds (e.g. `'CourseCreated'`) live in
 * `CustomEventKind`; dispatchers handle them via a per-projection
 * registry, separately from this union.
 */
export type SystemEventKind =
  // Capture
  | 'CapturedTurn'
  | 'SourceCaptured'
  | 'BaselineExtracted'
  // Suggestion lifecycle
  | 'FieldProposed'
  | 'SuggestionAccepted'
  | 'SuggestionEdited'
  | 'SuggestionRejected'
  | 'SuggestionSuperseded'
  | 'FieldRejected'
  // Commit
  | 'ProjectionCommit'
  | 'ProjectionRun'
  // Consent
  | 'ConsentGranted'
  | 'ConsentRevoked'
  // Lifecycle housekeeping
  | 'RetentionExpired'
  | 'AIProxyRefused'
  // v0.2 — first-class Contracts
  | 'ContractViolation'
  // v0.1.0 (crawcus-spec) — Warrant primitive (#10)
  | 'WarrantClaimed'
  | 'WarrantPresented'
  | 'WarrantViolation'
  // v0.2.0 (crawcus-spec) — Disclosure primitive (#11)
  | 'DisclosureDelivered'
  | 'DisclosureAcknowledged'
  | 'DisclosureRetracted'
  | 'DisclosureRequired'
  // v0.2.1 (crawcus-spec) — Disclosure SIGNAL extension (Q-CR9 LOCKED 2026-06-02)
  // SIGNAL-not-gate semantics — see disclosure/types.ts + crawcus-contracts.md §6.A.
  | 'DisclosureSignal'
  // v0.3.0 (crawcus-spec) — Consent primitive (#12)
  // Note: 'ConsentGranted' + 'ConsentRevoked' lifecycle event kinds
  // already exist above (predate the primitive #12 sprint). The new
  // kind here is the rejection event emitted when writeEvent's pre-
  // check finds the data subject's consent is invalid for the
  // processing purpose. Mirrors `DisclosureRequired` shape.
  | 'ConsentRequired'
  // v0.4.0 (crawcus-spec) — Lineage primitive (#13)
  | 'LineageRecorded'
  | 'LineageRequired'
  // v0.5.0 (crawcus-spec) — HumanOversight primitive (#14)
  | 'OversightScheduled'
  | 'OversightConducted'
  | 'OversightSignedOff'
  | 'OversightEscalated'
  | 'OversightRequired';

/**
 * Custom event kind — branded string for per-projection emergent
 * kinds (`'CourseCreated'`, `'PatientAdmitted'`). The brand prevents
 * accidental conflation with `SystemEventKind` at the type level.
 */
export type CustomEventKind = Brand<string, 'CustomEventKind'>;

/**
 * Union of system + custom kinds. Used in `Event['kind']`.
 *
 * Dispatchers that need exhaustiveness over the *system* set should
 * narrow with `isSystemEventKind` first, then switch on
 * `SystemEventKind`.
 */
export type EventKind = SystemEventKind | CustomEventKind;

/**
 * Optional AI provenance recorded for AI-mediated events. Powers
 * audit-bundle reconstruction + per-tenant cost telemetry + Insurance
 * MGA pricing input.
 */
export interface EventAIProvenance {
  readonly model: string;
  readonly promptTemplateVersion: string;
  readonly inputHash: ContentHash;
  readonly outputHash: ContentHash;
  readonly latencyMs: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costUsd: number;
}

/**
 * Immutable log entry. The only public mutation path is `writeEvent()`
 * (lands 4c). Hash-chain linked + tamper-evident.
 *
 * Mandatory compliance fields are non-optional by design (ratchet
 * #19 — total functions); GDPR Art. 6 lawful basis and Art. 15
 * subject indexing cannot be retrofitted.
 */
export interface Event<TPayload = unknown> {
  readonly id: EventId;
  readonly tenantId: TenantId;
  readonly intentId: IntentId;
  readonly kind: EventKind;
  /** Monotonic per `intentId`; assigned by `writeEvent`. */
  readonly version: number;
  readonly timestamp: Date;
  readonly actor: Actor;

  // GDPR + AI Act compliance — mandatory
  readonly lawfulBasis: LawfulBasis;
  readonly purpose: Purpose;
  readonly dataSubjectIds: readonly SubjectId[];
  readonly consentEventId?: ConsentEventId;
  readonly specialCategoryBasis?: SpecialCategoryBasis;

  // Hash chain — compliance-by-design #4
  /** `null` only for the genesis event in an intent's chain. */
  readonly prevHash: ContentHash | null;
  readonly contentHash: ContentHash;

  // Payload — MUST be tokenised (Untainted) before reaching writeEvent.
  // At the Event type level we accept TPayload directly since the chain
  // verifier doesn't care about taint, but writeEvent's input requires
  // Untainted<TPayload>.
  readonly payload: TPayload;

  // Provenance
  readonly ai?: EventAIProvenance;
  readonly correlationId?: string;
  readonly causationId?: EventId;
}
