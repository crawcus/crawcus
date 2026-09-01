/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Public type surface for `@crawcus/verifier`.
 *
 * Spec source:
 *   `docs/notebook/02-product/q-verifier-cli-oss-lock-tkt-verifier-1a-spec.md` §3
 *
 * Discipline (per ratchet #4 two-release deprecation):
 *   - Every exported symbol below is load-bearing for ≥2 minor versions.
 *   - Adding fields is additive-MINOR (ratchet #16); removing or
 *     renaming requires the deprecation cycle.
 *   - Canon vocabulary (`ContractViolationKind`) is re-exported from
 *     `@crawcus/spec`, NOT redefined here.
 */

import type { ContractViolationKind } from '@crawcus/spec';

// Re-export the canon taxonomy so consumers can import it directly
// from `@crawcus/verifier` without learning the spec-package layout.
// The verifier is a consumer of the spec, not a sibling source-of-truth.
export type { ContractViolationKind } from '@crawcus/spec';

/**
 * Top-level input to `verifyBundle`.
 *
 * The bundle bytes are the raw DSSE envelope JSON (UTF-8 encoded);
 * verification is a pure function over these bytes and an optional
 * options object. No I/O happens inside the verifier — the CLI reads
 * the file, the library only inspects the bytes.
 */
export interface VerifyInput {
  /** The signed bundle bytes (DSSE envelope wrapping JCS-canonicalised JSONL). */
  readonly bundle: Uint8Array;
  /** Optional verifier-side overrides; mostly used for testing. */
  readonly options?: VerifyOptions;
}

/**
 * Per-call options. All default to the safest interpretation so
 * `verifyBundle({ bundle })` matches the auditor-facing CLI default.
 */
export interface VerifyOptions {
  /**
   * When true, fail verification if any Contract referenced in the
   * bundle is missing embedded predicate source text. Default `true`
   * per `02-product/crawcus-format.md:446-449` — verifier MUST be
   * able to re-evaluate without trusting an external source.
   */
  readonly requireEmbeddedPredicates?: boolean;
  /**
   * When true, validate the DSSE `payloadType` matches the
   * `application/vnd.crawcus.*+jsonl` family. Default `true`.
   */
  readonly requireCrawcusPayloadType?: boolean;
  /**
   * When true, run Contract pre/inv/post re-evaluation. Default
   * `true`; set `false` for CI smoke tests that only need to confirm
   * the envelope + hash chain are intact.
   */
  readonly reevaluatePredicates?: boolean;
  /**
   * Override `verifiedAt` for deterministic test fixtures + snapshot
   * tests. Production callers omit (default: now in ISO 8601).
   */
  readonly verifiedAt?: string;
}

/** Overall verdict — `pass` iff every check passes. */
export type VerifyVerdict = 'pass' | 'fail' | 'historical-unverifiable';

/** Per-check verdict. `skipped` is reserved for option-driven dispatch. */
export type VerifyCheckVerdict = 'pass' | 'fail' | 'skipped' | 'historical-unverifiable';

/**
 * One row of the structured per-check report. Maps to one of the 8
 * Wave-1 checks in spec §5.
 *
 * `detail` is human-readable diagnostic text; the verifier MUST
 * escape any untrusted bundle content before embedding in `detail`
 * (rule of thumb: only embed values the verifier itself derived,
 * never raw payload strings).
 */
export interface VerifyCheck {
  /** Stable identifier — e.g., `dsse.envelope.shape`. */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
  /** The check verdict. */
  readonly verdict: VerifyCheckVerdict;
  /** When `verdict === 'fail'`, cite the canon `ContractViolationKind`. */
  readonly violationKind?: ContractViolationKind;
  /** Free-form detail for human readers. */
  readonly detail: string;
  /** Citations into the bundle for the verifier UI. */
  readonly cite?: readonly BundleCite[];
}

/** Citation entry — points the verifier UI / drill-down at a specific bundle location. */
export interface BundleCite {
  readonly kind: 'event-index' | 'contract-id' | 'envelope-field';
  readonly value: string | number;
}

/**
 * Top-level result returned by `verifyBundle`.
 *
 * Verdict aggregation:
 *   - `pass`                     iff all 8 checks pass
 *   - `historical-unverifiable`  iff Check 7 fires AND all others pass
 *                                AND `--strict` is not set
 *   - `fail`                     otherwise
 */
export interface VerifyResult {
  readonly verdict: VerifyVerdict;
  readonly checks: readonly VerifyCheck[];
  readonly bundleMetadata: BundleMetadata;
  /** ISO 8601 timestamp when the verifier ran. */
  readonly verifiedAt: string;
  readonly verifierIdentity: VerifierIdentity;
}

/**
 * Bundle metadata surfaced for human display + downstream tooling.
 * All fields are extracted from the bundle itself; the verifier does
 * NOT mutate or enrich them.
 */
export interface BundleMetadata {
  readonly bundleId: string;
  readonly schemaVersion: string;
  readonly payloadType: string;
  readonly signerKeyId: string;
  readonly eventCount: number;
  readonly contractCount: number;
  readonly earliestEventTs: string;
  readonly latestEventTs: string;
}

/**
 * The verifier-binary identity. Lets a downstream auditor verify
 * WHICH `crawcus-verify` ran. Distinct from the bundle's signer key.
 *
 * Wave-1 ships an unsigned identity — the verifier-output signing
 * keypair is a Wave-1b (PDF + countersign) deliverable per the
 * parent memo §"Wave-1 vs Wave-2 scope split".
 */
export interface VerifierIdentity {
  readonly version: string;
  readonly publicKeyFingerprint: string;
  readonly buildSha: string;
}

// ============ Lower-level types used by the staged verifier ============

/**
 * A parsed DSSE envelope + decoded JCS-canonical payload bytes.
 *
 * Holding both keeps later checks pure — DSSE check inspects the
 * envelope shape; chain + contract checks consume the payload.
 */
export interface ParsedBundle {
  readonly envelope: DsseEnvelope;
  /** Base64-decoded JCS-canonical JSONL bytes. */
  readonly payloadBytes: Uint8Array;
  /** The parsed `AuditBundle` JSON (decoded once, cached for downstream checks). */
  readonly bundle: ParsedAuditBundle;
}

/**
 * A DSSE envelope per the secure-systems-lab/dsse spec.
 *
 * Local structural type — not a redefinition of canon. The DSSE spec
 * is owned by secure-systems-lab; this interface mirrors the shape
 * the verifier consumes for type-safety.
 */
export interface DsseEnvelope {
  readonly payloadType: string;
  /** Base64-encoded JCS-canonical bundle bytes per DSSE transport rules. */
  readonly payload: string;
  readonly signatures: readonly DsseSignature[];
}

export interface DsseSignature {
  readonly keyid: string;
  /** Base64-encoded ed25519 signature over PAE(payloadType, decoded(payload)). */
  readonly sig: string;
}

/**
 * The audit-bundle payload as decoded from the DSSE envelope.
 *
 * Treated as `unknown`-shaped at the type level (so a malformed
 * payload can be surfaced as a structured fail rather than a runtime
 * crash); the chain + contract checks narrow as they consume fields.
 */
export interface ParsedAuditBundle {
  readonly bundleVersion?: unknown;
  readonly tenant?: unknown;
  readonly intent?: unknown;
  readonly spec?: unknown;
  readonly events?: unknown;
  readonly chainProof?: unknown;
  readonly contractResults?: unknown;
  readonly derogations?: unknown;
  readonly warrants?: unknown;
  readonly disclosures?: unknown;
  readonly consents?: unknown;
  readonly lineages?: unknown;
  readonly oversights?: unknown;
  readonly generatedAt?: unknown;
  // Verifier-specific: the embedded predicate source text per Contract id.
  // Spec source: 02-product/crawcus-format.md:446-449.
  readonly predicateSources?: unknown;
}

/** DSSE envelope verify check result. */
export interface DsseVerifyResult {
  readonly verdict: 'pass' | 'fail';
  readonly violationKind?: ContractViolationKind;
  readonly detail: string;
}

/** Chain verify check result. */
export interface ChainVerifyResult {
  readonly verdict: 'pass' | 'fail';
  readonly violationKind?: ContractViolationKind;
  readonly detail: string;
  readonly brokenAt?: number;
}

/** Single Contract re-evaluation result. */
export interface ContractVerifyResult {
  readonly contractId: string;
  readonly verdict: 'pass' | 'fail' | 'historical-unverifiable';
  readonly violationKind?: ContractViolationKind;
  readonly detail: string;
  readonly checkpoint?: 'pre' | 'invariants' | 'post';
}
