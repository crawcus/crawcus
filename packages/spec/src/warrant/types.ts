/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Brand } from '../types/brand.js';
import type {
  ActorId,
  IssuerId,
  IntentKey,
  Region,
  TenantId,
  Timestamp,
  WarrantId,
} from '../types/ids.js';
import type { RegulationCitation } from '../contract/types.js';
import type { Intent, CrawcusSpec } from '../types/intent.js';
import type { Event } from '../types/event.js';
import type { Tenant } from '../types/tenant.js';

/**
 * # Warrant — CRAWCUS primitive #10
 *
 * A verifiable, time-bounded, revocable, issuer-signed authorization
 * that some authority attaches to a tenant's runtime, attesting:
 *
 *   *"we have reviewed this; it is authorized to operate under our
 *    authority until T."*
 *
 * Distinct from Contract (which is per-event predicate evaluation).
 * Warrant is the **continuing authorization** layer: a Contract pre-
 * check answers *"is this event allowed under the spec?"*; a Warrant
 * pre-check answers *"does this tenant currently have authority to
 * operate this spec at all?"*
 *
 * ## Issuer ecosystem
 *
 * Warrant is the **marketplace anchor primitive**. Issuers:
 *
 * - `self` — tenant self-issues (dev mode, low-risk operations)
 * - `big-4` — PwC, EY, Deloitte, KPMG
 * - `notified-body` — TÜV SÜD, Bureau Veritas, BSI
 * - `mga` — Insurance MGAs (Coalition, At-Bay, Vouch)
 * - `regulator` — UK ICO, French CNIL, etc.
 * - `cloud` — Tallyseal Cloud (operated-content premium per C3 LOCKED)
 * - `oem` — OEM platform issuers (Y2+)
 *
 * The *"pay your warrant bill"* mechanic — authorities issue Warrants
 * for fees; lapse → Warrant expires → operations halt — is the
 * auto-incentivized renewal loop that turns CRAWCUS into a compliance
 * *protocol* (not just a *runtime*). See
 * `07-engineering/primitives-audit-2026-05-21.md` §#10.
 *
 * ## Lifecycle
 *
 *   issued → exercised → expired | revoked
 *
 * All four states are distinct from Contract per-event evaluation;
 * cannot be subsumed.
 *
 * ## Signature scheme (v0.1.0 per Q-CR4 LOCKED)
 *
 * Ed25519 (RFC 8032). Signature is a base64-encoded 64-byte string
 * computed over the canonical-JSON representation of all Warrant
 * fields EXCEPT `issuerSignature` itself. Verifiers reconstruct the
 * canonical form, look up the issuer's public key via IssuerTrust
 * config, and verify the signature. X.509 chains arrive in v0.2.0
 * when Big-4 / Notified Bodies start issuing.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8032
 */

/**
 * Base64-encoded Ed25519 signature (64 bytes raw → 88 chars base64).
 * Branded to prevent accidental mixing with arbitrary base64 strings.
 */
export type Signature = Brand<string, 'Signature'>;

/**
 * The categorical kind of an issuer — drives policy decisions in
 * downstream evaluators (e.g., Big-4 + Notified Body Warrants count
 * as "third-party-attested" for Tallyseal Cloud operated-content
 * SLAs).
 */
export type IssuerKind = 'self' | 'big-4' | 'notified-body' | 'mga' | 'regulator' | 'cloud' | 'oem';

/**
 * Reference to a Warrant issuer. The `publicKey` field is the
 * verification key; signature verification uses `publicKeyAlgorithm`
 * to select the algorithm.
 *
 * In v0.1.0 only Ed25519 is supported. v0.2.0 introduces X.509 chain
 * verification for Big-4 / Notified Body issuers (Q-CR4 LOCKED).
 */
export interface IssuerRef {
  readonly id: IssuerId;
  readonly kind: IssuerKind;
  /** Display name (e.g., `'PwC AI Assurance'`). */
  readonly name: string;
  /**
   * Base64-encoded Ed25519 public key (32 bytes raw → 44 chars base64).
   */
  readonly publicKey: string;
  /** v0.1.0 supports `'ed25519'` only; X.509 chain support v0.2.0. */
  readonly publicKeyAlgorithm: 'ed25519';
}

/**
 * The set of operations a Warrant authorizes. Empty regions /
 * classifications arrays mean unrestricted on that axis.
 */
export interface WarrantScope {
  /** CrawcusSpec keys this Warrant authorizes (e.g., `'CreateCourse'`). */
  readonly specs: readonly IntentKey[];
  /** Optional region restriction. Empty = unrestricted. */
  readonly regions?: readonly Region[];
  /**
   * Optional risk-classification restriction (e.g., `'high-risk'`,
   * `'limited-risk'` per EU AI Act). Empty = unrestricted.
   */
  readonly classifications?: readonly string[];
}

/**
 * Renewal / billing metadata. Y2 commercial primitive — v0.1.0 ships
 * a minimal shape that lets the marketplace primitives reference it
 * without committing to a billing wire format yet.
 */
export interface WarrantRenewal {
  /**
   * - `'annual'` / `'biennial'`: time-based renewal
   * - `'event-based'`: renewal tied to external trigger (Big-4 audit close,
   *   Notified Body re-attestation, MGA underwriting cycle)
   * - `'perpetual'`: no renewal required (rare; typically `self` issuers)
   */
  readonly cycle: 'annual' | 'biennial' | 'event-based' | 'perpetual';
  /**
   * Opaque external billing reference (Stripe subscription ID, Big-4
   * engagement ref, MGA policy number). Not interpreted by the runtime
   * — passed through to the auditor in the audit bundle.
   */
  readonly billingRef?: string;
  /** Whether the issuer auto-renews without tenant action. */
  readonly autoRenew: boolean;
}

/**
 * The Warrant primitive — wire format. Any CRAWCUS-conformant runtime
 * emits and verifies Warrants in this exact shape.
 *
 * Canonical-JSON-serialisable per RFC 8785 (sorted keys, deterministic
 * number encoding). Signature is computed over the canonical form of
 * all fields EXCEPT `issuerSignature` itself.
 */
export interface Warrant {
  readonly id: WarrantId;
  readonly tenantId: TenantId;
  /** The actor (or service principal) the Warrant authorizes. */
  readonly subject: ActorId;
  readonly issuer: IssuerRef;
  /**
   * Base64-encoded Ed25519 signature over canonical-JSON(warrant
   * without this field). Verifies against `issuer.publicKey`.
   */
  readonly issuerSignature: Signature;
  /** Legal basis the Warrant asserts (GDPR Art 6(1)(b), EU AI Act Art 6, etc.). */
  readonly authority: readonly RegulationCitation[];
  readonly scope: WarrantScope;
  readonly issuedAt: Timestamp;
  /** `null` = until-revoked (no expiry). */
  readonly expiresAt: Timestamp | null;
  /** `null` = not revoked. */
  readonly revokedAt: Timestamp | null;
  /** Human-readable reason; populated iff `revokedAt !== null`. */
  readonly revocationReason: string | null;
  /** `null` = renewal not tracked (e.g., self-issued dev warrants). */
  readonly renewal: WarrantRenewal | null;
}

// ============ Evaluation surface ============

/**
 * Checkpoint at which a Warrant is evaluated. Mirrors the Contract
 * pattern: `pre` before the operation, `inv` continuously during
 * (rare for Warrant — usually pre-only), `post` after (audit-trail
 * confirmation).
 *
 * v0.1.0 defaults to `pre` only; `inv` and `post` are opt-in per
 * CrawcusSpec.
 */
export type WarrantCheckpoint = 'pre' | 'inv' | 'post';

/**
 * Status of a Warrant evaluation. Stratified failure modes so the
 * audit bundle can render a precise rejection reason.
 */
export type WarrantEvaluationStatus =
  | 'valid'
  | 'expired'
  | 'revoked'
  | 'signature-mismatch'
  | 'untrusted-issuer'
  | 'out-of-scope'
  | 'not-yet-valid';

/**
 * The materialised context passed to a Warrant validator. Mirrors
 * Contract's `ContractCtx` pattern; runtime fetches state once per
 * checkpoint and presents it here. Validators MUST be pure-sync.
 */
export interface WarrantCtx {
  readonly intent: Intent;
  readonly spec: CrawcusSpec;
  readonly tenant: Tenant;
  readonly events: readonly Event[];
  /**
   * Current time, supplied by the runtime per evaluation. Allows
   * deterministic replay via the audit bundle (auditors pin `now` to
   * the recorded `Event.recordedAt` of the evaluation Event).
   */
  readonly now: Date;
}

/**
 * Result of evaluating a Warrant at a checkpoint. Mirrors
 * `ContractEvaluationResult`.
 */
export interface WarrantEvaluationResult {
  readonly warrantId: WarrantId;
  readonly checkpoint: WarrantCheckpoint;
  readonly status: WarrantEvaluationStatus;
  /** Human-readable failure reason; absent on `'valid'`. */
  readonly reason?: string;
  /** Evaluation timestamp (RFC 8785 canonical isoDate). */
  readonly evaluatedAt: Timestamp;
}

/**
 * Pure-sync validator function. Custom validators can layer on top
 * of the default evaluator to enforce scope-specific rules (e.g., a
 * tenant might require all `'mga'`-issued Warrants to specify a
 * `billingRef`).
 */
export type WarrantValidator = (warrant: Warrant, ctx: WarrantCtx) => WarrantEvaluationResult;

/**
 * Checkpoint configuration on a CrawcusSpec. Mirrors
 * `ContractCheckpoint` configuration. `pre` is required; `inv` +
 * `post` opt-in.
 */
export interface WarrantCheckpoints {
  readonly pre: WarrantValidator;
  readonly inv?: WarrantValidator;
  readonly post?: WarrantValidator;
}

/**
 * Payload of a `WarrantViolation` Event. Recorded when a Warrant
 * evaluation fails. Mirrors `ContractViolationPayload`.
 */
export interface WarrantViolationPayload {
  readonly warrantId: WarrantId;
  readonly checkpoint: WarrantCheckpoint;
  readonly status: Exclude<WarrantEvaluationStatus, 'valid'>;
  readonly reason: string;
  readonly issuerId: IssuerId;
  readonly issuerKind: IssuerKind;
}
