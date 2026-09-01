/**
 * `@crawcus/verifier` — CRAWCUS audit-bundle verifier (library API).
 *
 * Spec:
 *   - Wave-1a: `docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1a-spec.md` §3
 *   - Wave-1b: `docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1b-spec.md` §3
 *
 * Public surface — exactly the symbols listed below. Per ratchet #4,
 * additions are MINOR-bump-only; removals or renames trigger the
 * two-release-deprecation discipline.
 *
 * v0.2.0 additions (TKT-VERIFIER-1b, 2026-06-03):
 *   - `countersignResult` — auditor countersign flow + DSSE envelope
 *   - `renderPdf` — auditor-signable PDF report renderer
 *   - `PAYLOAD_TYPE_VERIFY_RESULT` — the countersign envelope's payloadType
 *   - Types: `CountersignInput`, `CountersignedResult`
 */

// ===== Top-level entry-point =====
export { verifyBundle } from './verify.js';

// ===== Public types =====
export type {
  BundleCite,
  BundleMetadata,
  ChainVerifyResult,
  ContractVerifyResult,
  DsseEnvelope,
  DsseSignature,
  DsseVerifyResult,
  ParsedAuditBundle,
  ParsedBundle,
  VerifierIdentity,
  VerifyCheck,
  VerifyCheckVerdict,
  VerifyInput,
  VerifyOptions,
  VerifyResult,
  VerifyVerdict,
  ContractViolationKind,
} from './types.js';

// ===== Lower-level functions for advanced callers =====
// (The lighthouse app, Anthropic's cloud verify endpoint, etc.)
export { parseSignedBundle } from './parse.js';
export { verifyDsseSignature as verifyDsseEnvelope } from './dsse.js';
export { verifyEventChain as verifyHashChain } from './hash-chain.js';
export { reevaluateContracts } from './contracts.js';

// ===== Constants =====
export {
  PAYLOAD_TYPE_AUDIT_BUNDLE,
  CRAWCUS_PAYLOAD_TYPE_PREFIX,
  CRAWCUS_PAYLOAD_TYPE_SUFFIX,
  KNOWN_CRAWCUS_SUBTYPES,
} from './dsse.js';

export { VERIFIER_VERSION } from './version.js';

// ===== Wave-1b additions (TKT-VERIFIER-1b) =====

/** Auditor countersign — wrap a `VerifyResult` in a separate DSSE envelope. */
export { countersignResult, PAYLOAD_TYPE_VERIFY_RESULT } from './countersign.js';
export type { CountersignInput, CountersignedResult } from './countersign.js';

/** PDF renderer — produce an auditor-signable verification report. */
export { renderPdf } from './format/index.js';
