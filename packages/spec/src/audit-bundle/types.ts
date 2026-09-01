import type { ComplianceManifest } from '../types/compliance.js';
import type { ContractEvaluationResult } from '../contract/types.js';
import type { Event } from '../types/event.js';
import type { Intent, IntentClassification } from '../types/intent.js';
import type { HashChainProof } from '../event/hash-chain-proof.js';
import type { ActorId, IntentKey, RegulationVersion, Region, TenantId } from '../types/ids.js';
import type { Warrant } from '../warrant/types.js';
import type { Disclosure } from '../disclosure/types.js';
import type { Consent } from '../consent/types.js';
import type { Lineage } from '../lineage/types.js';
import type { HumanOversight } from '../oversight/types.js';

/**
 * The customer-facing artifact handed to an auditor. Deterministic,
 * canonical-JSON-serialisable, and contains everything needed for an
 * independent verifier to:
 *
 *   1. Reconstruct + verify the per-intent hash chain (from
 *      `events` + `chainProof`).
 *   2. Re-evaluate every Contract that fired against the recorded
 *      `spec` + `compliance` manifest snapshots.
 *   3. Confirm derogations cite the correct regulation + approver.
 *
 * Bundle versioning is a hard ratchet: any breaking change to this
 * shape bumps `bundleVersion`. Auditors pin to a bundleVersion the
 * way they pin to a regulation version.
 *
 * Wire format — part of the CRAWCUS open spec (Attestation primitive).
 * Any CRAWCUS-conformant runtime emits this exact shape; the composer
 * function `composeAuditBundle` is a runtime implementation choice
 * (Tallyseal's lives in `/core`).
 */
export const AUDIT_BUNDLE_VERSION = '0.1.0' as const;
export type AuditBundleVersion = typeof AUDIT_BUNDLE_VERSION;

export interface AuditBundleDerogation {
  readonly contractId: string;
  readonly reason: string;
  readonly approver: ActorId;
  readonly approvedAt: string;
  readonly regulation: RegulationVersion;
  readonly clauseReference: string;
}

/**
 * Customer-facing audit artifact. v0.1.0 surfaces all five additive
 * primitive sections — Warrants / Disclosures / Consents / Lineages /
 * Oversights — as discrete first-class arrays alongside the event log
 * and contract evaluations. The semantic distinction: events are the
 * what-happened ledger; these five sections are the discrete
 * attestations the auditor reads alongside it (issuer-signed
 * authority / delivered notice / data-subject grant / output
 * provenance / human review).
 *
 * Each section is optional + omitted when empty (mirror of the
 * existing `contractResults` / `derogations` pattern) so bundles
 * stay terse when a deployment hasn't yet wired the corresponding
 * store.
 */
export interface AuditBundle {
  readonly bundleVersion: AuditBundleVersion;
  readonly generatedAt: string;
  readonly tenant: {
    readonly id: TenantId;
    readonly region: Region;
  };
  readonly intent: Intent;
  readonly spec: {
    readonly key: IntentKey;
    readonly version: number;
    readonly classification: IntentClassification | 'unspecified';
  };
  readonly compliance: ComplianceManifest;
  readonly events: readonly Event[];
  readonly chainProof: HashChainProof;
  readonly contractResults?: readonly ContractEvaluationResult[];
  readonly derogations?: readonly AuditBundleDerogation[];
  /** Primitive #10 — issuer-signed authority records consulted during the intent's lifetime. */
  readonly warrants?: readonly Warrant[];
  /** Primitive #11 — delivered (or retracted) notice records satisfying disclosure requirements. */
  readonly disclosures?: readonly Disclosure[];
  /** Primitive #12 — data-subject-issued consent grants + active/withdrawn state. */
  readonly consents?: readonly Consent[];
  /** Primitive #13 — AI-output provenance graphs (PROV-O JSON-LD per Q-CR7). */
  readonly lineages?: readonly Lineage[];
  /** Primitive #14 — human-oversight conduct records (signed-off + escalated). */
  readonly oversights?: readonly HumanOversight[];
}
