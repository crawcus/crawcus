/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

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
export { verifyEventChain as verifyHashChain } from './hash-chain.js';
export { reevaluateContracts } from './contracts.js';
// `verifyDsseSignatureUntrusted` lives in `./dsse.js` but is NOT
// re-exported. It is an integrity-only primitive: a pass means the
// envelope was signed by the key it embeds, not that the key is
// authorised. The trust-checked public API is `verifyBundle`.

// ===== Constants =====
export {
  PAYLOAD_TYPE_AUDIT_BUNDLE,
  CRAWCUS_PAYLOAD_TYPE_PREFIX,
  CRAWCUS_PAYLOAD_TYPE_SUFFIX,
  KNOWN_CRAWCUS_SUBTYPES,
} from './dsse.js';

export { VERIFIER_VERSION } from './version.js';

export { parseTrustPolicy, fingerprintTrustPolicy } from './trust/parse-policy.js';
export { evaluateSignerTrust, selectSignerTrust } from './trust/evaluate.js';
export type {
  Ed25519PinnedAnchor,
  RevokedKey,
  SignerIdentity,
  SigningTimeSource,
  SigstoreIdentityAnchor,
  TrustAnchor,
  TrustDecision,
  TrustPolicy,
  TrustReasonCode,
  TrustResult,
} from './trust/types.js';

// ===== Wave-1b additions (TKT-VERIFIER-1b) =====

/** Auditor countersign — wrap a `VerifyResult` in a separate DSSE envelope. */
export { countersignResult, PAYLOAD_TYPE_VERIFY_RESULT } from './countersign.js';
export type { CountersignInput, CountersignedResult } from './countersign.js';

/** PDF renderer — produce an auditor-signable verification report. */
export { renderPdf } from './format/index.js';

// ===== Signed trust-anchor document (trust-anchors.json) =====
export { keyIdFor, rawFromSpkiBase64, spkiBase64FromRaw } from './trust/keyid.js';
export {
  bootstrapTrustAnchors,
  updateTrustAnchors,
  loadTrustAnchors,
  checkNotExpired,
  validRootSignatures,
  trustPolicyFromAnchors,
  createMemoryTrustAnchorsStore,
} from './trust/anchors/verify.js';
export type {
  AnchorCheckOptions,
  AnchorsFail,
  AnchorsOk,
  FetchLike,
  LoadTrustAnchorsOptions,
  LoadTrustAnchorsResult,
  TrustPolicyFromAnchorsOptions,
  TrustPolicyFromAnchorsResult,
} from './trust/anchors/verify.js';
export { parseTrustAnchors } from './trust/anchors/parse.js';
export type { ParseTrustAnchorsResult } from './trust/anchors/parse.js';
export {
  trustAnchorsSigningInput,
  signTrustAnchors,
  createLocalEd25519Signer,
  anchorKeyFromPublicKey,
} from './trust/anchors/sign.js';
export {
  TRUST_ANCHORS_TYPE,
  TRUST_ANCHORS_PAYLOAD_TYPE,
  TRUST_ANCHORS_SPEC_MAJOR,
  KNOWN_PURPOSES,
  KNOWN_STATUSES,
} from './trust/anchors/types.js';
export type {
  AnchorKey,
  AnchorSigner,
  DetachedSignature,
  KeyPurpose,
  KeyStatus,
  ParsedTrustAnchors,
  PinnedRoot,
  RevocationReason,
  RootRole,
  TrustAnchorsErrorCode,
  TrustAnchorsSigned,
  TrustAnchorsStore,
} from './trust/anchors/types.js';
