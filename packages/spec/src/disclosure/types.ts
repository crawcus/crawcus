import type {
  ContentHash,
  DisclosureId,
  DisclosureRequirementId,
  EventId,
  IntentKey,
  SubjectId,
  TenantId,
  Timestamp,
} from '../types/ids.js';
import type { RegulationCitation } from '../contract/types.js';
import type { Intent, CrawcusSpec } from '../types/intent.js';
import type { Event } from '../types/event.js';
import type { Tenant } from '../types/tenant.js';

/**
 * # Disclosure — CRAWCUS primitive #11
 *
 * A discrete, demonstrably-delivered notice from the system to a
 * user / data subject. Distinct from a Contract pre-check that one
 * *should* be shown — Disclosure is the *delivered* artifact:
 *
 *   *"user X received notice Y at T"*
 *
 * is a structural artifact, not a Contract author discipline. Without
 * Disclosure, runtime can pass a Contract pre-check ("notice will be
 * shown") but never verify it actually was. With Disclosure, the
 * doesn't-lie property holds against EU AI Act Art 50/13, GDPR Art
 * 13/14, FERPA §99.7 — all regulations that mandate the *delivered*
 * artifact, not the *intent* to deliver.
 *
 * ## Lifecycle
 *
 *   drafted (content registered)
 *     → delivered (DisclosureDelivered event)
 *     → acknowledged (DisclosureAcknowledged event; optional)
 *     → retracted (DisclosureRetracted event; triggers re-delivery)
 *
 * ## Distinct from Warrant
 *
 * Warrant is issuer-signed authority from an external party.
 * Disclosure is system-emitted notice to a data subject. No signature,
 * no issuer-trust — the hash chain itself provides tamper-evidence; the
 * runtime's event log is the integrity surface.
 *
 * ## Distinct from Consent
 *
 * Disclosure is *outbound* (system → subject). Consent (primitive #12)
 * is *inbound* (subject → system). A Disclosure may be a precondition
 * for collecting a Consent ("here's what we'll do — do you agree?"),
 * but they are independent primitives with independent lifecycles per
 * GDPR Art 7 and Kantara CR v1.1.
 *
 * Spec: `07-engineering/primitives-audit-2026-05-21.md` §#11.
 */

// ============ Delivery method ============

/**
 * How a Disclosure was delivered to its subject. Adapters per channel
 * live behind `DeliveryPort` (Tallyseal-runtime concept, not part of
 * the spec — different CRAWCUS-conformant runtimes are free to define
 * their own delivery model).
 */
export type DeliveryMethod = 'in-app' | 'email' | 'sms' | 'mail' | 'api';

// ============ Content ============

/**
 * The actual notice content. Hashed for tamper-evidence (the runtime
 * records `contentHash` on the `DisclosureDelivered` event so audit
 * bundles can verify the user saw exactly this text). Versioning is
 * up to the content registry — a new content revision means a new
 * `Disclosure.contentHash`, which means a new delivery is required
 * for subjects who only acknowledged the prior version.
 *
 * Localization: `locale` identifies the rendered language. Multi-
 * language compliance scenarios (e.g., GDPR-required notice in the
 * data subject's preferred language) deliver one Disclosure per
 * locale, each with its own contentHash + delivery record.
 */
export interface DisclosureContent {
  readonly text: string;
  readonly format: 'text' | 'html' | 'markdown';
  readonly locale: string; // BCP 47 language tag, e.g., 'en', 'fr-CA'
}

// ============ Requirement ============

/**
 * A regulation-mandated disclosure declared by a `CrawcusSpec`.
 * When the spec is invoked, the runtime checks that every required
 * disclosure has been delivered to every data subject within the
 * recurrence window.
 *
 * The `id` is stable across runtime restarts and content revisions —
 * it identifies *what* must be disclosed (e.g., the GDPR Art 13
 * obligation), not *which version of the text* was used. Content
 * revisions are tracked via `Disclosure.content.contentHash` on the
 * delivery event.
 */
export interface DisclosureRequirement {
  readonly id: DisclosureRequirementId;
  readonly regulation: RegulationCitation;
  /**
   * If true, delivery alone is insufficient — the subject must also
   * acknowledge via a `DisclosureAcknowledged` event before the
   * runtime considers the requirement satisfied. Default false.
   */
  readonly mustAcknowledge: boolean;
  /**
   * How often the disclosure must be re-delivered:
   *
   *   - `'once-per-subject'`     — single delivery per subject ever
   *   - `'annual'`               — re-delivered yearly (FERPA §99.7)
   *   - `'per-session'`          — re-delivered each user session
   *     (advisory; runtime needs sessionId in DisclosureCtx to enforce)
   *   - `'per-event'`            — re-delivered on every event
   *     (AI Act Art 50 — "informed when interacting with AI")
   */
  readonly recurrence: 'once-per-subject' | 'annual' | 'per-session' | 'per-event';
}

// ============ Disclosure (the delivered artifact) ============

/**
 * A single delivered notice. Recorded on the chain via a
 * `DisclosureDelivered` event with this payload. Acknowledgment +
 * retraction are tracked via subsequent events that reference the
 * `id`; the canonical "current state" of a Disclosure is computed
 * by replaying its event sequence.
 */
export interface Disclosure {
  readonly id: DisclosureId;
  readonly tenantId: TenantId;
  /** The data subject the notice was delivered to. */
  readonly subject: SubjectId;
  /** Which `DisclosureRequirement` this delivery satisfies. */
  readonly requirementId: DisclosureRequirementId;
  readonly content: DisclosureContent;
  /** Hash of `content` (canonical-JSON + SHA-256). Tamper-evidence. */
  readonly contentHash: ContentHash;
  readonly deliveredAt: Timestamp;
  readonly deliveryMethod: DeliveryMethod;
  /** `null` until a `DisclosureAcknowledged` event references this id. */
  readonly acknowledgedAt: Timestamp | null;
  /** `null` until a `DisclosureRetracted` event references this id. */
  readonly retractedAt: Timestamp | null;
}

// ============ Evaluation context + result ============

/**
 * Context for `evaluateDisclosure`. Mirrors `WarrantCtx`. Carries the
 * data subjects whose disclosure status must be verified; if none,
 * the evaluator returns `'valid'` (system events with no data
 * subjects don't trigger disclosure checks).
 */
export interface DisclosureCtx {
  readonly intent: Intent;
  readonly spec: CrawcusSpec;
  readonly tenant: Tenant;
  readonly events: readonly Event[];
  /**
   * Data subjects this event is about. Disclosure obligations are
   * per-subject; an event with multiple subjects requires every
   * subject to have current disclosures.
   */
  readonly dataSubjectIds: readonly SubjectId[];
  readonly now: Date;
  /**
   * Optional session id — required only if any
   * `DisclosureRequirement.recurrence` is `'per-session'`. Absent
   * sessionId with a per-session requirement is treated as no prior
   * session → re-delivery required.
   */
  readonly sessionId?: string;
}

/**
 * Discriminator on the evaluation outcome. `'valid'` is the only
 * status that allows the event to proceed; any other triggers a
 * `DisclosureRequiredError` + a `DisclosureRequired` event on the
 * chain.
 */
export type DisclosureEvaluationStatus =
  | 'valid'
  | 'undelivered'
  | 'unacknowledged'
  | 'retracted'
  | 'expired-window'
  | 'subject-missing-session';

export type DisclosureCheckpoint = 'pre' | 'inv' | 'post';

export interface DisclosureEvaluationResult {
  readonly requirementId: DisclosureRequirementId;
  readonly subject: SubjectId;
  readonly checkpoint: DisclosureCheckpoint;
  readonly status: DisclosureEvaluationStatus;
  readonly reason?: string;
  readonly evaluatedAt: Timestamp;
}

// ============ Event payloads ============

/**
 * Payload of a `DisclosureDelivered` event. Records the delivery of
 * one Disclosure to one subject.
 */
export interface DisclosureDeliveredPayload {
  readonly disclosureId: DisclosureId;
  readonly subject: SubjectId;
  readonly requirementId: DisclosureRequirementId;
  readonly contentHash: ContentHash;
  readonly deliveryMethod: DeliveryMethod;
  readonly locale: string;
}

/**
 * Payload of a `DisclosureAcknowledged` event. References the
 * `DisclosureDelivered` event that the user is acknowledging.
 */
export interface DisclosureAcknowledgedPayload {
  readonly disclosureId: DisclosureId;
  readonly subject: SubjectId;
  /** The `DisclosureDelivered` event ID being acknowledged. */
  readonly acknowledges: EventId;
}

/**
 * Payload of a `DisclosureRetracted` event. Retraction triggers
 * re-delivery requirements per the recurrence rule of the requirement.
 */
export interface DisclosureRetractedPayload {
  readonly disclosureId: DisclosureId;
  readonly subject: SubjectId;
  readonly reason: string;
}

/**
 * Payload of a `DisclosureRequired` event. Recorded when a Disclosure
 * evaluation fails at writeEvent pre-check, preventing the proposed
 * event from being appended. Mirrors `WarrantViolationPayload`.
 */
export interface DisclosureRequiredPayload {
  readonly requirementId: DisclosureRequirementId;
  readonly subject: SubjectId;
  readonly checkpoint: DisclosureCheckpoint;
  readonly status: Exclude<DisclosureEvaluationStatus, 'valid'>;
  readonly reason: string;
  readonly specKey: IntentKey;
}

// ============ DisclosureSignal — Q-CR9 LOCKED 2026-06-02 ============

/**
 * Open enum of observational signal types about a delivered Disclosure.
 *
 * **SIGNAL-not-gate semantics.** Each value records *evidence the data
 * subject had an opportunity to perceive the notice*, NEVER affirmative
 * acknowledgment. Per ICO + LG Munich + CJEU Planet49: passive UI
 * interaction (scroll, dwell, click) does not constitute valid consent.
 * If a Contract author needs to gate on affirmative acknowledgment,
 * use the `Disclosure.acknowledgedAt` lifecycle state (driven by
 * `DisclosureAcknowledged` events) — not these signals.
 *
 * Day-1 values:
 *
 *   - `'read'`     — banner / notice scrolled into the viewport for ≥
 *                    a configured threshold (typically 1500 ms per
 *                    ICO "opportunity to read" framing)
 *   - `'click'`    — link or expander on the notice followed / opened
 *   - `'dwell'`    — view-time threshold (longer than `'read'`)
 *                    observed without scroll-away
 *   - `'replay'`   — notice surface re-opened by the subject (e.g.,
 *                    "View again" menu item)
 *
 * **Extensibility.** Open enum at the spec layer — additional signal
 * types ship via additive-MINOR per ratchet #16. Controllers MAY
 * extend with custom values (e.g., `'voice-confirmation'`,
 * `'eye-track-gaze'`) using the spec-extension mechanism; the
 * `DisclosureSignal` EventKind itself is the single, stable
 * discriminator surface.
 *
 * Source: `02-product/crawcus-contracts.md` §6.A; Q-CR9 LOCKED.
 */
export type DisclosureSignalType = 'read' | 'click' | 'dwell' | 'replay';

/**
 * The full `DisclosureSignal` Event interface — the canonical
 * standalone shape from `07-engineering/primitives-audit-2026-05-21.md`
 * §#11. Provided alongside `DisclosureSignalPayload` so dispatchers
 * that narrow `Event['kind']` to `'DisclosureSignal'` can type the
 * combined `{ kind, payload }` shape directly without unwrapping
 * through `Event<DisclosureSignalPayload>`.
 *
 * **Use by**:
 *   - TCK fixtures asserting positive-case predicate evaluation
 *   - Runtime emitters constructing event payloads
 *   - Audit-bundle wire-format readers narrowing by `kind`
 *
 * The `kind` discriminant is the literal `'DisclosureSignal'`.
 */
export interface DisclosureSignalEvent {
  readonly kind: 'DisclosureSignal';
  readonly disclosureId: DisclosureId;
  /** Canonical regulation requirement (e.g. `'gdpr.art13.notice'`). */
  readonly requirementId: DisclosureRequirementId;
  /**
   * Hash of the Disclosure content the signal was observed against.
   * MUST equal the delivered Disclosure's `contentHash` for the signal
   * to count toward `pre.disclosureHasOpportunityToBeRead` — signal-on-
   * stale-content does not satisfy the predicate per §6.A.
   */
  readonly contentHash: ContentHash;
  readonly signalType: DisclosureSignalType;
  readonly observedAt: Timestamp;
  /**
   * For `'dwell'` / `'read'` — view duration in ms. Optional because
   * `'click'` / `'replay'` are instantaneous; controllers MAY supply
   * `viewMs` for any signal type but auditors only read it when the
   * discriminant warrants.
   */
  readonly viewMs?: number;
  /**
   * Free-form controller-extension bag. Frozen `Readonly` so audit-
   * bundle canonicalisation is deterministic; controllers MUST stringify
   * + freeze before constructing.
   */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * Payload of a `DisclosureSignal` event — the structure that lives
 * inside `Event<DisclosureSignalPayload>['payload']`. Differs from
 * `DisclosureSignalEvent` only by omitting the `kind` discriminant
 * (which lives on `Event['kind']`, not inside `payload`).
 *
 * Runtime emitters constructing events through `writeEvent` use this
 * type; auditor-facing readers narrowing `Event<unknown>` typically
 * reach for `DisclosureSignalEvent` instead.
 */
export interface DisclosureSignalPayload {
  readonly disclosureId: DisclosureId;
  readonly requirementId: DisclosureRequirementId;
  readonly contentHash: ContentHash;
  readonly signalType: DisclosureSignalType;
  readonly observedAt: Timestamp;
  readonly viewMs?: number;
  readonly meta?: Readonly<Record<string, unknown>>;
}
