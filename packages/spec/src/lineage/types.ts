import type {
  ContentHash,
  EventId,
  IntentKey,
  Iri,
  LineageId,
  SubjectId,
  TenantId,
  Timestamp,
} from '../types/ids.js';
import type { Intent, CrawcusSpec } from '../types/intent.js';
import type { Event } from '../types/event.js';
import type { Tenant } from '../types/tenant.js';

/**
 * # Lineage — CRAWCUS primitive #13
 *
 * AI-output provenance graph. Records which inputs (training data,
 * prompt templates, source events) led to which AI-generated
 * outputs. Per EU AI Act Art 12 + Annex IV traceability and the
 * Anthropic-style model-card lineage discipline.
 *
 *   *"For output Y, what inputs X1..Xn were used at time T by model M?"*
 *
 * is a first-class DPO + auditor query — and the L1-doesn't-lie
 * answer to it requires Lineage as a structural artifact (not a
 * runtime log statement that may be dropped or tampered with).
 *
 * Per Q-CR7 LOCKED 2026-05-22: **strict W3C PROV-O JSON-LD wire
 * format**. Custom or PROV-O-inspired formats would break federation
 * across CRAWCUS-conformant runtimes (Rust/Go/JS). The serialized
 * `provO` field is a typed JSON-LD document round-trippable through
 * a standard PROV-O processor.
 *
 * ## PROV-O vocabulary subset
 *
 * | PROV term | Role in Lineage |
 * |---|---|
 * | `prov:Activity` | The inference call itself |
 * | `prov:Entity` | Inputs (prompt template, user message, training-data ref) + outputs (AI-generated content ref) |
 * | `prov:Agent` (+ `SoftwareAgent`) | The model |
 * | `prov:Plan` ⊑ Entity | The prompt template |
 * | `prov:used` | Activity → input Entity |
 * | `prov:wasGeneratedBy` | Output Entity → Activity |
 * | `prov:wasAssociatedWith` | Activity → Agent |
 * | `prov:wasDerivedFrom` | Output → input (shortcut) |
 * | `prov:wasAttributedTo` | Output → Agent (shortcut) |
 *
 * ## Federation discipline (Q-CR7a-c — sub-decisions of Q-CR7)
 *
 * - **Q-CR7a** (PROV-JSONLD context): v0.4.0 references the
 *   openprovenance.org canonical context URL. Pinning by
 *   content-hash or inlining a minimal context is a v0.5.0
 *   followup if drift matters in practice.
 * - **Q-CR7b** (subclass encoding): use the `@type` array form
 *   (e.g., `["Agent", "SoftwareAgent"]`) — NOT `prov:type`.
 *   Locked in TCK for canonical-hash stability.
 * - **Q-CR7c** (IRI minting): tenant-scoped URN form
 *   `urn:crawcus:{tenantId}:{kind}:{id}` is the canonical default.
 *   HTTPS IRIs under a tenant-controlled base also allowed.
 * - **No blank nodes**: every PROV node MUST carry an explicit
 *   `@id`. Blank node minting differs across runtimes and would
 *   break content-hash federation. Enforced by the evaluator.
 *
 * Spec: `07-engineering/primitives-audit-2026-05-21.md` §#13.
 */

/** The canonical PROV-JSONLD context URL (Q-CR7a, v0.4.0). */
export const PROV_JSONLD_CONTEXT_URL = 'https://openprovenance.org/prov-jsonld/context.jsonld';

// ============ PROV-O JSON-LD node shapes (typed subset) ============

/**
 * A PROV-O node in JSON-LD. Discriminated by `@type`. Every node MUST
 * carry an explicit `@id` (Iri brand) — blank nodes are forbidden.
 *
 * The type union is non-exhaustive on purpose: v0.4.0 ships the
 * subset needed for AI-output provenance. v0.5.0+ can extend.
 */
export type ProvNode = ProvEntity | ProvActivity | ProvAgent | ProvPlan;

export interface ProvNodeBase {
  readonly '@id': Iri;
}

export interface ProvEntity extends ProvNodeBase {
  readonly '@type': 'Entity' | readonly ['Entity', ...string[]];
  readonly wasGeneratedBy?: Iri;
  readonly wasAttributedTo?: Iri | readonly Iri[];
  readonly wasDerivedFrom?: Iri | readonly Iri[];
  /** Free-form provenance label per `prov:label` / `rdfs:label`. */
  readonly 'prov:label'?: string;
  /** Domain-specific subtype (e.g., 'UserMessage', 'TrainingDataRef'). */
  readonly 'prov:type'?: string;
}

export interface ProvActivity extends ProvNodeBase {
  readonly '@type': 'Activity' | readonly ['Activity', ...string[]];
  readonly startedAtTime?: Timestamp;
  readonly endedAtTime?: Timestamp;
  readonly used?: Iri | readonly Iri[];
  readonly wasAssociatedWith?: Iri | readonly Iri[];
}

export interface ProvAgent extends ProvNodeBase {
  readonly '@type': 'Agent' | readonly ['Agent', ...string[]];
  readonly 'prov:label'?: string;
  readonly 'prov:type'?: string;
}

/** prov:Plan ⊑ prov:Entity — for prompt templates as plans. */
export interface ProvPlan extends ProvNodeBase {
  readonly '@type': readonly ['Entity', 'Plan'];
  readonly 'prov:label'?: string;
  readonly 'prov:type'?: string;
}

/**
 * A typed JSON-LD document carrying a PROV-O graph. The on-disk wire
 * form for `Lineage.provO`. Round-trips through a standard JSON-LD
 * processor (`jsonld` npm package, etc.).
 */
export interface ProvOSerialization {
  readonly '@context': string | readonly (string | Record<string, string>)[];
  readonly '@graph': readonly ProvNode[];
}

// ============ Tallyseal-side typed views over the PROV graph ============

/**
 * Reference to an AI model with rich metadata. Serialized to a
 * `ProvAgent` of `@type: ["Agent", "SoftwareAgent"]` in the
 * `provO` document.
 */
export interface ModelRef {
  /** Iri form (e.g., `urn:crawcus:tn_demo:model:claude-sonnet-4-6`). */
  readonly id: Iri;
  readonly provider: string;
  readonly name: string;
  readonly version: string;
  /** Optional content hash of model weights, when accessible. */
  readonly weightsHash?: ContentHash;
}

/**
 * Reference to a prompt template. Serialized to a `ProvPlan`
 * (`@type: ["Entity", "Plan"]`) in the `provO` document.
 */
export interface PromptTemplateRef {
  readonly id: Iri;
  readonly version: string;
  /** Content hash of the rendered prompt template text. */
  readonly contentHash: ContentHash;
}

/**
 * Reference to a single lineage input — a source data reference,
 * a prior event, a training-data collection. Maps to a
 * `ProvEntity` in the `provO` document.
 */
export interface LineageInput {
  readonly id: Iri;
  /** Discriminator for the input class. */
  readonly kind: 'event' | 'training-data' | 'external-source' | 'user-message';
  /**
   * If the input is itself an event in the chain, its EventId for
   * fast lookup. Optional.
   */
  readonly eventId?: EventId;
  readonly contentHash?: ContentHash;
  readonly label?: string;
}

// ============ Requirement (CrawcusSpec declaration) ============

/**
 * A spec-declared Lineage obligation. When the spec is invoked with
 * an event carrying `input.ai` AI provenance, the runtime checks
 * that a Lineage record covering that AI inference exists in the
 * store.
 */
export interface LineageRequirement {
  /** If true, every event with `input.ai` set requires a Lineage record. */
  readonly required: true;
  /**
   * Minimum number of `inputs` a Lineage record must declare to be
   * considered valid for this requirement. Defaults to 1 (at least
   * the prompt/user-message). Set higher (e.g., 2) to require both
   * a prompt template and a user message.
   */
  readonly minInputs?: number;
}

// ============ Lineage (the stored record) ============

export interface Lineage {
  readonly id: LineageId;
  readonly tenantId: TenantId;
  /**
   * The AI-generated output event this records lineage for. May be
   * null if Lineage is recorded BEFORE the output event (the
   * outputEventId is patched in via a subsequent event-link). For
   * v0.4.0 the canonical pattern is post-output recording with a
   * non-null reference.
   */
  readonly outputEventId: EventId | null;
  /** Data subjects whose data appeared in the inputs. */
  readonly affectedSubjects: readonly SubjectId[];
  readonly inputs: readonly LineageInput[];
  readonly model: ModelRef;
  readonly promptTemplate: PromptTemplateRef | null;
  readonly recordedAt: Timestamp;
  /** The serialized PROV-O JSON-LD graph. */
  readonly provO: ProvOSerialization;
}

// ============ Evaluation context + result ============

export interface LineageCtx {
  readonly intent: Intent;
  readonly spec: CrawcusSpec;
  readonly tenant: Tenant;
  readonly events: readonly Event[];
  /** Whether the proposed event carries AI provenance. */
  readonly hasAIProvenance: boolean;
  readonly now: Date;
}

export type LineageEvaluationStatus =
  | 'valid'
  | 'missing'
  | 'malformed-prov-o'
  | 'insufficient-inputs'
  | 'blank-node-forbidden';

export type LineageCheckpoint = 'pre' | 'inv' | 'post';

export interface LineageEvaluationResult {
  readonly checkpoint: LineageCheckpoint;
  readonly status: LineageEvaluationStatus;
  readonly reason?: string;
  readonly evaluatedAt: Timestamp;
}

// ============ Event payload ============

/**
 * Payload of a `LineageRequired` event. Recorded when writeEvent
 * rejects an AI-mediated event because no covering Lineage exists.
 */
export interface LineageRequiredPayload {
  readonly checkpoint: LineageCheckpoint;
  readonly status: Exclude<LineageEvaluationStatus, 'valid'>;
  readonly reason: string;
  readonly specKey: IntentKey;
}

/**
 * Payload of a `LineageRecorded` event. Lifecycle event emitted when
 * a Lineage record is persisted.
 */
export interface LineageRecordedPayload {
  readonly lineageId: LineageId;
  readonly outputEventId: EventId | null;
  readonly modelId: Iri;
  readonly inputCount: number;
}
