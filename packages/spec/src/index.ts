// CRAWCUS open-standard reference content — public barrel.
//
// Tallyseal runtime (`/core`) imports from this barrel.
// At Y1 H2 spin-out, this package becomes `@crawcus/spec` with the
// same public surface — the scope rename is mechanical.

// ============ Branded type helpers + IFC-lite ============

export type { Brand, Tainted, Untainted } from './types/brand.js';

// ============ Branded IDs ============

export type {
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
  WarrantId,
  IssuerId,
  Timestamp,
  DisclosureId,
  DisclosureRequirementId,
  ConsentId,
  ConsentRequirementId,
  ProcessingPurpose,
  LineageId,
  Iri,
  OversightId,
  OversightRequirementId,
  OrgId,
  ToolName,
  ToolCallId,
} from './types/ids.js';

// ============ JSON value + schema primitives ============

export type {
  JsonValue,
  JsonPrimitive,
  JsonArray,
  JsonObject,
  JsonSchema,
  JsonSchemaNode,
  JsonSchemaCommon,
  JsonSchemaString,
  JsonSchemaNumber,
  JsonSchemaInteger,
  JsonSchemaBoolean,
  JsonSchemaNull,
  JsonSchemaArray,
  JsonSchemaObject,
  JsonSchemaEnum,
  JsonSchemaConst,
  JsonSchemaCombinator,
  JsonSchemaShapeError,
} from './types/json.js';

export { validateJsonSchemaShape } from './types/json.js';

// ============ Locale + duration ============

export type { Locale, LocalisedText } from './types/locale.js';
export type { ISO8601Duration } from './types/duration.js';

// ============ Core primitive types ============

export type { Tenant, Actor, TenantCtx, AccessCtx } from './types/tenant.js';
export type { Intent, CrawcusSpec, IntentClassification } from './types/intent.js';
export type {
  Event,
  EventAIProvenance,
  SystemEventKind,
  CustomEventKind,
  EventKind,
} from './types/event.js';
export type { Suggestion, SuggestionState } from './types/suggestion.js';
export type { ProjectionRef } from './types/projection.js';
export type { FieldSpec, FieldMetadata, FieldBaseType } from './types/field.js';

// ============ Compliance manifest ============

export type {
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
} from './types/compliance.js';

// ============ Contract primitive ============

export type {
  Contract,
  ContractCtx,
  FieldContractCtx,
  ContractCheckpoint,
  ContractEvaluationResult,
  ContractViolationPayload,
  RegulationCitation,
  // TKT-V6-ITEM-15 — 'tool_proposed' checkpoint surface
  ToolProposedCtx,
} from './contract/types.js';

export { CONTRACT_CHECKPOINTS } from './contract/types.js';

export { defineContract } from './contract/helpers.js';
export { evaluateContracts, buildContractCtx, hasBlockingFailure } from './contract/evaluate.js';
export type { EvaluateContractsArgs } from './contract/evaluate.js';
export { normalisePredicateSource } from './contract/normalise.js';
export { hashPredicate, hashPredicateSource } from './contract/hash.js';
export {
  validateComposition,
  type CompositionViolation,
  type CompositionViolationCode,
} from './contract/composition.js';
export { makeContractViolationPayload } from './contract/violation.js';
export { type ContractViolationKind, CONTRACT_VIOLATION_KINDS } from './contract/violation-kind.js';
export {
  checkPredicateSize,
  checkPredicateSizeFromSource,
  PREDICATE_SIZE_LIMIT_BYTES,
  type SizeLimitResult,
} from './contract/size-limit.js';

// ============ Canonical JSON + hash chain ============

export { SYSTEM_EVENT_KINDS, isSystemEventKind, customEventKind } from './event/event-kinds.js';
export { canonicalJSON, isoDate, normaliseForCanonical } from './event/canonical-json.js';
export {
  computeContentHash,
  computeJsonHash,
  verifyChain,
  GENESIS_PREV_HASH,
} from './event/hash-chain.js';
export type { HashChainProof } from './event/hash-chain-proof.js';

// ============ CrawcusSpec authoring ============

export { defineCrawcusSpec } from './intent/define-crawcus-spec.js';
export { field, type FieldBuilder } from './intent/field.js';
export { composeIntent, IntentCompositionError } from './intent/extends.js';

// ============ Compliance manifest authoring + validation ============

export { defineCompliance } from './compliance/define-compliance.js';
export { fieldPath, parseFieldPath, type FieldPath } from './compliance/field-paths.js';
export {
  validateManifest,
  type ManifestValidationCode,
  type ManifestValidationError,
  type ValidateOptions,
  type ValidationResult,
} from './compliance/validate.js';

// ============ Readiness + graph ============

export {
  materialiseReadinessCtx,
  type ReadinessCtx,
  type EventSummary,
} from './readiness/context.js';
export { checkReadiness, type ReadinessResult } from './readiness/check.js';
export { evaluateGraph, type GraphState } from './graph/evaluate.js';

// ============ Projector primitive ============

export type { Projector, ProjectorBaseCtx, ProjectorOutput } from './projector/types.js';

// ============ Warrant primitive (#10) ============

export type {
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
} from './warrant/types.js';

export { canonicalWarrantSigningBytes, bytesToBase64, base64ToBytes } from './warrant/codec.js';

export { signWarrant, verifyWarrantSignature } from './warrant/verify.js';

export {
  resolveTrustedPublicKey,
  type IssuerTrust,
  type IssuerTrustEntry,
  type ResolvedTrust,
} from './warrant/issuer-trust.js';

export { evaluateWarrant } from './warrant/evaluate.js';

export {
  assertProductionTrust,
  isProductionTrust,
  InsecureTrustConfigError,
} from './warrant/production-trust.js';

// ============ Disclosure primitive (#11) ============

export type {
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
  // v0.2.1 — DisclosureSignal (Q-CR9 LOCKED 2026-06-02)
  DisclosureSignalEvent,
  DisclosureSignalPayload,
  DisclosureSignalType,
} from './disclosure/types.js';

export { evaluateDisclosure, isWithinRecurrenceWindow } from './disclosure/evaluate.js';

export {
  disclosureHasOpportunityToBeRead,
  lintDisclosureSignalPredicateName,
  SIGNAL_NOT_GATE_FORBIDDEN_TOKENS,
  SIGNAL_NOT_GATE_REQUIRED_TOKENS,
  type DisclosureHasOpportunityToBeReadOptions,
  type DisclosureSignalLintResult,
} from './disclosure/signal.js';

// TKT-HF-BUNDLE-VERSION — consent-bundle content-hash helper (HF Ask #3)
export { computeBundleVersion } from './disclosure/bundle-version.js';
export type {
  ConsentBundleVersion,
  DisclosureContentWithRequirement,
} from './disclosure/bundle-version.js';

// ============ Consent primitive (#12) ============

export type {
  Consent,
  ConsentCheckpoint,
  ConsentCtx,
  ConsentEvaluationResult,
  ConsentEvaluationStatus,
  ConsentReceipt,
  ConsentRequirement,
  ConsentRequiredPayload,
  WithdrawalMethod,
} from './consent/types.js';

export { evaluateConsent } from './consent/evaluate.js';

// ============ Lineage primitive (#13) ============

export type {
  Lineage,
  LineageCheckpoint,
  LineageCtx,
  LineageEvaluationResult,
  LineageEvaluationStatus,
  LineageInput,
  LineageRequirement,
  LineageRecordedPayload,
  LineageRequiredPayload,
  ModelRef,
  PromptTemplateRef,
  ProvActivity,
  ProvAgent,
  ProvEntity,
  ProvNode,
  ProvOSerialization,
  ProvPlan,
} from './lineage/types.js';

export { PROV_JSONLD_CONTEXT_URL } from './lineage/types.js';
export { evaluateLineage, checkProvOIntegrity } from './lineage/evaluate.js';

// ============ HumanOversight primitive (#14) ============

export type {
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
} from './oversight/types.js';

export { evaluateOversight } from './oversight/evaluate.js';

// ============ Tool-use primitive (#15) ============

export type {
  ToolDefinition,
  ToolCall,
  ToolResult,
  ToolResultOk,
  ToolResultErr,
  StopReason,
  ToolNameValidationError,
  // TKT-V6-ITEM-14 — spec-side per-tool declaration
  ToolRisk,
  ToolGate,
  ToolSpec,
  ToolSpecMap,
  ToolSpecViolation,
  ToolSpecEvaluationResult,
} from './tool/types.js';

export {
  validateToolName,
  isValidToolName,
  STOP_REASONS,
  RESERVED_TOOL_NAME_PREFIXES,
  MAX_TOOL_NAME_LENGTH,
  // TKT-V6-ITEM-14 — runtime arrays + evaluator
  TOOL_RISKS,
  TOOL_GATES,
  LAWFUL_BASIS_VALUES,
} from './tool/types.js';

export { evaluateToolSpec } from './tool/evaluate.js';

// ============ Audit-bundle wire-format types (Attestation primitive) ============

export {
  AUDIT_BUNDLE_VERSION,
  type AuditBundle,
  type AuditBundleVersion,
  type AuditBundleDerogation,
} from './audit-bundle/types.js';

// ============ Result<T, E> from neverthrow ============

export {
  Result,
  ResultAsync,
  ok,
  err,
  okAsync,
  errAsync,
  fromPromise,
  fromThrowable,
  fromAsyncThrowable,
} from './effect/result.js';
