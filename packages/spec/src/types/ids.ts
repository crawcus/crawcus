import type { Brand } from './brand.js';

/**
 * All Tallyseal IDs are branded strings — runtime-cheap, type-distinct.
 *
 * Canonical format: UUIDv7 (RFC 9562, ratified May 2024) — sortable
 * timestamp prefix, native PostgreSQL `uuid` column type, IETF
 * standards-grade. Adapters MAY accept other shapes (ULID, opaque
 * strings) but UUIDv7 is the documented default; the audit-bundle
 * render layer presents IDs however auditors prefer.
 */

export type TenantId = Brand<string, 'TenantId'>;
export type IntentId = Brand<string, 'IntentId'>;
export type IntentKey = Brand<string, 'IntentKey'>;
export type EventId = Brand<string, 'EventId'>;
export type SuggestionId = Brand<string, 'SuggestionId'>;
export type ProjectionId = Brand<string, 'ProjectionId'>;
export type ProjectionName = Brand<string, 'ProjectionName'>;
export type ConsentEventId = Brand<EventId, 'ConsentEventId'>;
export type SubjectId = Brand<string, 'SubjectId'>;
export type ActorId = Brand<string, 'ActorId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type Token = Brand<string, 'Token'>;
export type ContentHash = Brand<string, 'ContentHash'>;
export type Region = Brand<string, 'Region'>;
export type Purpose = Brand<string, 'Purpose'>;
export type RegulationVersion = Brand<string, 'RegulationVersion'>;

// ============ v0.1.0 — Warrant primitive (#10) ============

/**
 * Warrant identifier. UUIDv7 per the canonical ID format.
 */
export type WarrantId = Brand<string, 'WarrantId'>;

/**
 * Issuer identifier. Stable across an issuer's lifetime; rotated only
 * via formal re-credentialing (cryptographic key rotation does not
 * change IssuerId).
 */
export type IssuerId = Brand<string, 'IssuerId'>;

/**
 * ISO 8601 UTC timestamp string (e.g., `'2026-05-21T17:09:00Z'`).
 * Branded to prevent accidental conversion to/from arbitrary strings.
 * Use the runtime's `isoDate` helper to construct from `Date`.
 */
export type Timestamp = Brand<string, 'Timestamp'>;

// ============ v0.2.0 — Disclosure primitive (#11) ============

/**
 * Disclosure identifier. UUIDv7 per the canonical ID format. Each
 * delivery of a notice is a discrete Disclosure with its own id —
 * re-delivery (after retraction or per recurrence window) is a new
 * Disclosure, not a state mutation of the prior one.
 */
export type DisclosureId = Brand<string, 'DisclosureId'>;

/**
 * Stable identifier for a *required-disclosure declaration* on a
 * CrawcusSpec — distinct from `DisclosureId` (which IDs a specific
 * delivery). E.g., `'ai-act-art-50-ai-interaction'`, `'ferpa-§99.7-
 * annual-notification'`. Convention: kebab-case, regulation-prefixed.
 */
export type DisclosureRequirementId = Brand<string, 'DisclosureRequirementId'>;

// ============ v0.3.0 — Consent primitive (#12) ============

/**
 * Consent identifier. UUIDv7 per the canonical ID format. Distinct
 * from `ConsentEventId` (which IDs a specific `ConsentGranted` /
 * `ConsentRevoked` event in the event log). A single Consent record
 * may have many associated events through its lifecycle.
 */
export type ConsentId = Brand<string, 'ConsentId'>;

/**
 * Stable identifier for a *required-consent declaration* on a
 * CrawcusSpec — distinct from `ConsentId` (which IDs an instance).
 * E.g., `'gdpr-art-7-ai-training'`, `'ferpa-99.30-disclosure-to-org'`.
 * Convention: kebab-case, regulation-prefixed.
 */
export type ConsentRequirementId = Brand<string, 'ConsentRequirementId'>;

/**
 * Processing purpose — the granular processing operation a Consent
 * authorizes. Distinct from `Purpose` (which is the spec-level event
 * purpose); `ProcessingPurpose` is intentionally finer-grained per
 * GDPR Art 7 specificity requirement ("specific, informed").
 */
export type ProcessingPurpose = Brand<string, 'ProcessingPurpose'>;

// ============ v0.4.0 — Lineage primitive (#13) ============

/**
 * Lineage record identifier. UUIDv7 per the canonical ID format.
 * Each AI-output provenance record is a discrete Lineage with its
 * own id.
 */
export type LineageId = Brand<string, 'LineageId'>;

/**
 * Internationalized Resource Identifier — full URI form. Used for
 * PROV-O JSON-LD `@id` fields per Q-CR7 LOCKED 2026-05-22 (strict
 * W3C PROV-O JSON-LD wire format, expanded IRIs for content-hash
 * stability across runtimes).
 */
export type Iri = Brand<string, 'Iri'>;

// ============ v0.5.0 — HumanOversight primitive (#14) ============

/**
 * HumanOversight record identifier. UUIDv7 per the canonical ID format.
 */
export type OversightId = Brand<string, 'OversightId'>;

/**
 * Stable identifier for an oversight-requirement declaration on a
 * CrawcusSpec — distinct from `OversightId` (which IDs a specific
 * conducted review). E.g., `'ai-act-art-14-periodic-supervisory'`.
 */
export type OversightRequirementId = Brand<string, 'OversightRequirementId'>;

/**
 * Organization identifier (e.g., a hospital, university, or
 * regulatory body). Distinct from `TenantId` (which IDs the
 * operating customer); an Org may employ overseers across many
 * tenants (e.g., a Notified Body federating across customers).
 */
export type OrgId = Brand<string, 'OrgId'>;

// ============ v0.6.0 — Tool-use primitive (#15) ============

/**
 * Tool identifier as declared on `ToolDefinition.name` and echoed by
 * `ToolCall.name`.
 *
 * Canonical format: kebab-case, `[a-z][a-z0-9-]*`. Reserved prefixes
 * `crawcus.*` and `tallyseal.*` are forbidden in user-declared tools
 * (the runtime may emit them for built-in tools). Validated at
 * `defineCrawcusSpec` time by `isValidToolName`; runtime-rejected at
 * `AIPort.call` boundaries by every adapter.
 *
 * The brand is on `string` (not on a more constrained nominal type)
 * so adapter-side string operations (lookup in a `Map<ToolName, ...>`,
 * pattern matching) work without re-branding.
 */
export type ToolName = Brand<string, 'ToolName'>;

/**
 * Tool-call invocation identifier — matches the upstream provider's
 * id (Anthropic `tool_use.id`, OpenAI `tool_calls[].id`, etc.).
 * Adapters preserve it so multi-turn calls can thread results back
 * via `AIRequest.priorToolResults`. Generated by the model provider,
 * never minted by the consumer.
 */
export type ToolCallId = Brand<string, 'ToolCallId'>;
