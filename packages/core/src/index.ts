/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

// Version
export { CRAWCUS_CORE_VERSION } from './version.js';

// ============ CRAWCUS spec surface ============
// Re-exported from @crawcus/spec so existing @crawcus/core
// consumers continue to see the same public surface. The compiler
// enforces that we can only re-export what the spec package barrel
// exposes — internal spec files are invisible to runtime code.

export type {
  // Branded type helpers + IFC-lite
  Brand,
  Tainted,
  Untainted,
  // Branded IDs
  TenantId,
  IntentId,
  IntentKey,
  EventId,
  SuggestionId,
  ProjectionId,
  ProjectionName,
  ConsentEventId,
  SubjectId,
  ActorId,
  TaskId,
  Token,
  ContentHash,
  Region,
  Purpose,
  RegulationVersion,
  // Locale + duration
  Locale,
  LocalisedText,
  ISO8601Duration,
  // Core primitive types
  Tenant,
  Actor,
  TenantCtx,
  AccessCtx,
  Intent,
  CrawcusSpec,
  IntentClassification,
  Event,
  EventAIProvenance,
  SystemEventKind,
  CustomEventKind,
  EventKind,
  Suggestion,
  SuggestionState,
  ProjectionRef,
  FieldSpec,
  FieldMetadata,
  FieldBaseType,
  // Compliance manifest
  ComplianceManifest,
  FieldCompliance,
  LawfulBasis,
  SpecialCategoryBasis,
  PIILevel,
  RetentionPolicy,
  ConsentPolicy,
  ResidencyPolicy,
  AIPolicy,
  LawfulBasisPolicy,
  SubProcessor,
  // Contract primitive
  Contract,
  ContractCtx,
  FieldContractCtx,
  ContractCheckpoint,
  ContractEvaluationResult,
  ContractViolationPayload,
  RegulationCitation,
  CompositionViolation,
  CompositionViolationCode,
  SizeLimitResult,
  FieldBuilder,
  FieldPath,
  ManifestValidationCode,
  ManifestValidationError,
  ValidateOptions,
  ValidationResult,
  ReadinessCtx,
  EventSummary,
  ReadinessResult,
  GraphState,
  HashChainProof,
  AuditBundle,
  AuditBundleVersion,
  AuditBundleDerogation,
  Projector,
  ProjectorBaseCtx,
  ProjectorOutput,
  // Warrant primitive (#10) — types only in Stage 1; algorithms + evaluator land in Stages 2-4
  WarrantId,
  IssuerId,
  Timestamp,
  Signature,
  IssuerKind,
  IssuerRef,
  WarrantScope,
  WarrantRenewal,
  Warrant,
  WarrantCheckpoint,
  WarrantEvaluationStatus,
  WarrantCtx,
  WarrantEvaluationResult,
  WarrantValidator,
  WarrantCheckpoints,
  WarrantViolationPayload,
  // Disclosure primitive (#11) — types
  DeliveryMethod,
  Disclosure,
  DisclosureAcknowledgedPayload,
  DisclosureCheckpoint,
  DisclosureContent,
  DisclosureCtx,
  DisclosureDeliveredPayload,
  DisclosureEvaluationResult,
  DisclosureEvaluationStatus,
  DisclosureRequirement,
  DisclosureRequiredPayload,
  DisclosureRetractedPayload,
  // Disclosure SIGNAL extension (Q-CR9 LOCKED 2026-06-02) — types
  DisclosureSignalEvent,
  DisclosureSignalPayload,
  DisclosureSignalType,
  DisclosureHasOpportunityToBeReadOptions,
  DisclosureSignalLintResult,
  DisclosureRequirementId,
  DisclosureId,
  // TKT-HF-BUNDLE-VERSION (HF Ask #3, 2026-06-18) — types
  ConsentBundleVersion,
  DisclosureContentWithRequirement,
  // Consent primitive (#12) — types
  Consent,
  ConsentCheckpoint,
  ConsentCtx,
  ConsentEvaluationResult,
  ConsentEvaluationStatus,
  ConsentReceipt,
  ConsentRequirement,
  ConsentRequiredPayload,
  ConsentId,
  ConsentRequirementId,
  ProcessingPurpose,
  WithdrawalMethod,
  // Lineage primitive (#13) — types
  Lineage,
  LineageCheckpoint,
  LineageCtx,
  LineageEvaluationResult,
  LineageEvaluationStatus,
  LineageInput,
  LineageRequirement,
  LineageRecordedPayload,
  LineageRequiredPayload,
  LineageId,
  Iri,
  ModelRef,
  PromptTemplateRef,
  ProvActivity,
  ProvAgent,
  ProvEntity,
  ProvNode,
  ProvOSerialization,
  ProvPlan,
  // HumanOversight primitive (#14) — types
  HumanOversight,
  OversightCheckpoint,
  OversightConductedPayload,
  OversightCtx,
  OversightEscalatedPayload,
  OversightEvaluationResult,
  OversightEvaluationStatus,
  OversightFinding,
  OversightMode,
  OversightOutcome,
  OversightRequirement,
  OversightRequiredPayload,
  OversightScheduledPayload,
  OversightScope,
  OversightSignedOffPayload,
  OverseerRef,
  OverseerRole,
  OversightId,
  OversightRequirementId,
  OrgId,
} from '@crawcus/spec';

export {
  // Contract evaluator + helpers
  defineContract,
  evaluateContracts,
  buildContractCtx,
  hasBlockingFailure,
  normalisePredicateSource,
  hashPredicate,
  hashPredicateSource,
  validateComposition,
  makeContractViolationPayload,
  checkPredicateSize,
  checkPredicateSizeFromSource,
  PREDICATE_SIZE_LIMIT_BYTES,
  // Canonical JSON + hash chain
  SYSTEM_EVENT_KINDS,
  isSystemEventKind,
  customEventKind,
  canonicalJSON,
  isoDate,
  normaliseForCanonical,
  computeContentHash,
  verifyChain,
  GENESIS_PREV_HASH,
  // CrawcusSpec authoring
  defineCrawcusSpec,
  field,
  composeIntent,
  IntentCompositionError,
  // Compliance manifest authoring + validation
  defineCompliance,
  fieldPath,
  parseFieldPath,
  validateManifest,
  // Readiness + graph
  materialiseReadinessCtx,
  checkReadiness,
  evaluateGraph,
  // Audit-bundle constants
  AUDIT_BUNDLE_VERSION,
  // Disclosure SIGNAL extension (Q-CR9 LOCKED 2026-06-02) — values
  disclosureHasOpportunityToBeRead,
  lintDisclosureSignalPredicateName,
  SIGNAL_NOT_GATE_FORBIDDEN_TOKENS,
  SIGNAL_NOT_GATE_REQUIRED_TOKENS,
  // TKT-HF-BUNDLE-VERSION (HF Ask #3, 2026-06-18) — values
  computeBundleVersion,
  // Result<T, E>
  Result,
  ResultAsync,
  ok,
  err,
  okAsync,
  errAsync,
  fromPromise,
  fromThrowable,
  fromAsyncThrowable,
} from '@crawcus/spec';

// ============ Tallyseal runtime surface ============

// Ports (interfaces)
export type { ProjectionPort } from './ports/projection.js';
export type { EventStorePort } from './ports/event-store.js';
export type { AIPort, AIRequest, AIResponse } from './ports/ai.js';
export type { IdentityPort, HttpRequest } from './ports/identity.js';
export type { PIIPort, PIIHit, TokenisedText } from './ports/pii.js';
export type { TaskPort, TaskSpec, TaskHandle, TaskStatus } from './ports/task.js';
export type { StoragePort, StorageOpts, StorageRef } from './ports/storage.js';
export type { TxContext } from './ports/tx-context.js';

// Typed errors + assertNever
export {
  LawfulBasisMismatchError,
  RawPIIInPayloadError,
  HashChainBrokenError,
  ConsentRequiredError,
  ReadinessNotMetError,
  ContractViolationError,
  WarrantViolationError,
  DisclosureRequiredError,
  ConsentInvalidError,
  LineageInvalidError,
  OversightInvalidError,
  assertNever,
} from './errors/index.js';

// Config — defineConfig + defineProjection
export { defineConfig, defineProjection } from './config/define-config.js';
export type {
  TallysealConfig,
  ProjectionAdapter,
  ProjectionAdapterFor,
  ReducerFn,
  ReducerCtx,
} from './config/types.js';

// PII tokenisation — the boundary between Tainted<T> and Untainted<T>
export { tokenisePayload, assertNoRawPII } from './pii/tokenise.js';
export {
  PII_MARKER_PATTERN,
  makeMarker,
  isMarker,
  extractTokens,
  containsMarker,
} from './pii/marker.js';

// writeEvent — sole mutation entrypoint
export {
  writeEvent,
  unsafeAssertUntainted,
  type WriteEventInput,
  type WriteEventResult,
  type WriteEventCtx,
  type WriteEventCtxExtras,
} from './event/write-event.js';

// Reducer — per-intent dispatch + determinism gate
export { dispatchReducer } from './reducer/dispatcher.js';
export { assertReducerDeterminism } from './reducer/determinism.js';

// Warrant runtime ports (primitive #10; v0.1.0)
export type { WarrantStorePort } from './warrant/store-port.js';
export type { WarrantIssuerPort } from './warrant/issuer-port.js';
export type { TallysealWarrantsConfig } from './config/types.js';

// Disclosure primitive (#11) runtime ports + config
export type { DisclosureStorePort } from './disclosure/store-port.js';
export type {
  DeliveryPort,
  DeliveryRegistry,
  DeliveryRequest,
  DeliveryResult,
} from './disclosure/delivery-port.js';
export type { TallysealDisclosuresConfig } from './config/types.js';

// Consent primitive (#12) runtime ports + config
export type { ConsentStorePort } from './consent/store-port.js';
export type { TallysealConsentConfig } from './config/types.js';

// Lineage primitive (#13) runtime ports + config
export type { LineageStorePort } from './lineage/store-port.js';
export type { TallysealLineageConfig } from './config/types.js';

// HumanOversight primitive (#14) runtime ports + config
export type { OversightStorePort } from './oversight/store-port.js';
export type { TallysealOversightConfig } from './config/types.js';

// Projector — Layer-3 extractor interface. Spec primitives
// (Projector + ProjectorBaseCtx + ProjectorOutput) live in
// @crawcus/spec and are re-exported below. Tallyseal-
// specific narrowing (ProjectorCtx adds AIPort + PIIPort,
// TallysealProjector binds Projector to ProjectorCtx) ships here.
export type { ProjectorCtx, TallysealProjector } from './projector/types.js';

// Audit bundle — auditor-facing artifact (composer; wire-format types
// live in @crawcus/spec and are re-exported below)
export { composeAuditBundle, type ComposeAuditBundleInput } from './audit-bundle/compose.js';

// ============ Tool-use surface re-exports (TKT-CORE-REEXPORTS-TOOLSURFACE) ============
// Single-import-surface for runtime consumers (HF + future adopters):
// the spec-level tool-use API is surfaced through @crawcus/core so consumers
// don't need a second import boundary. Pure pass-throughs from
// @crawcus/spec; no logic copying. Per Q-CORE-REEXPORT-POLICY Option B
// (LOCKED 2026-06-03). See docs/notebook/09-operating/tkt-core-reexports-toolsurface-spec.md.
export {
  type ToolDefinition,
  type ToolCall,
  type ToolCallId,
  type ToolName,
  type ToolResult,
  type ToolResultOk,
  type ToolResultErr,
  type ToolNameValidationError,
  type StopReason,
  type JsonValue,
  type JsonObject,
  type JsonArray,
  type JsonPrimitive,
  type JsonSchema,
  type JsonSchemaNode,
  type JsonSchemaObject,
  type JsonSchemaString,
  type JsonSchemaNumber,
  type JsonSchemaInteger,
  type JsonSchemaBoolean,
  type JsonSchemaArray,
  type JsonSchemaEnum,
  // TKT-V6-ITEM-14 — spec-side tools declaration
  type ToolRisk,
  type ToolGate,
  type ToolSpec,
  type ToolSpecMap,
  type ToolSpecViolation,
  type ToolSpecEvaluationResult,
  // TKT-V6-ITEM-15 — 'tool_proposed' Contract checkpoint surface
  type ToolProposedCtx,
  type EvaluateContractsArgs,
  CONTRACT_CHECKPOINTS,
  computeJsonHash,
  validateToolName,
  isValidToolName,
  validateJsonSchemaShape,
  STOP_REASONS,
  MAX_TOOL_NAME_LENGTH,
  RESERVED_TOOL_NAME_PREFIXES,
  TOOL_RISKS,
  TOOL_GATES,
  LAWFUL_BASIS_VALUES,
  evaluateToolSpec,
} from '@crawcus/spec';
