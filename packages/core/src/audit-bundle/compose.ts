import type {
  ComplianceManifest,
  Consent,
  ContractEvaluationResult,
  Disclosure,
  Event,
  HumanOversight,
  Intent,
  CrawcusSpec,
  HashChainProof,
  Lineage,
  Tenant,
  Warrant,
  AuditBundle,
  AuditBundleDerogation,
} from '@crawcus/spec';
import { isoDate, AUDIT_BUNDLE_VERSION } from '@crawcus/spec';

export interface ComposeAuditBundleInput {
  readonly tenant: Tenant;
  readonly intent: Intent;
  readonly spec: CrawcusSpec;
  readonly compliance: ComplianceManifest;
  readonly events: readonly Event[];
  readonly chainProof: HashChainProof;
  readonly contractResults?: readonly ContractEvaluationResult[];
  readonly derogations?: readonly AuditBundleDerogation[];
  /** Primitive #10 — Warrants consulted during the intent's lifetime. */
  readonly warrants?: readonly Warrant[];
  /** Primitive #11 — delivered (or retracted) Disclosure records. */
  readonly disclosures?: readonly Disclosure[];
  /** Primitive #12 — Consent grants (active + withdrawn — evaluator owns state). */
  readonly consents?: readonly Consent[];
  /** Primitive #13 — Lineage records (PROV-O JSON-LD graphs). */
  readonly lineages?: readonly Lineage[];
  /** Primitive #14 — HumanOversight records (signed-off + escalated). */
  readonly oversights?: readonly HumanOversight[];
  /**
   * Override `generatedAt`. Production callers omit (default: now);
   * snapshot/fixture tests pin to a fixed ISO string for determinism.
   */
  readonly generatedAt?: Date;
}

export function composeAuditBundle(input: ComposeAuditBundleInput): AuditBundle {
  const generatedAt = isoDate(input.generatedAt ?? new Date());
  const bundle: {
    -readonly [K in keyof AuditBundle]: AuditBundle[K];
  } = {
    bundleVersion: AUDIT_BUNDLE_VERSION,
    generatedAt,
    tenant: { id: input.tenant.id, region: input.tenant.region },
    intent: input.intent,
    spec: {
      key: input.spec.key,
      version: input.spec.version,
      classification: input.spec.classification ?? 'unspecified',
    },
    compliance: input.compliance,
    events: input.events,
    chainProof: input.chainProof,
  };
  if (input.contractResults && input.contractResults.length > 0) {
    bundle.contractResults = input.contractResults;
  }
  if (input.derogations && input.derogations.length > 0) {
    bundle.derogations = input.derogations;
  }
  if (input.warrants && input.warrants.length > 0) {
    bundle.warrants = input.warrants;
  }
  if (input.disclosures && input.disclosures.length > 0) {
    bundle.disclosures = input.disclosures;
  }
  if (input.consents && input.consents.length > 0) {
    bundle.consents = input.consents;
  }
  if (input.lineages && input.lineages.length > 0) {
    bundle.lineages = input.lineages;
  }
  if (input.oversights && input.oversights.length > 0) {
    bundle.oversights = input.oversights;
  }
  return bundle;
}
