/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  AUDIT_BUNDLE_VERSION,
  canonicalJSON,
  composeAuditBundle,
  computeContentHash,
  defineCompliance,
  defineCrawcusSpec,
  field,
} from '../../src/index.js';
import type {
  ActorId,
  AuditBundle,
  ComplianceManifest,
  Consent,
  ContentHash,
  Disclosure,
  Event,
  HashChainProof,
  HumanOversight,
  Intent,
  IntentId,
  IntentKey,
  ISO8601Duration,
  Lineage,
  Locale,
  ProjectionName,
  Purpose,
  RegulationVersion,
  Region,
  SubjectId,
  Tenant,
  TenantId,
  Warrant,
} from '../../src/index.js';

/**
 * Snapshot tests for the audit-bundle output.
 *
 * The audit bundle is what an auditor receives — a customer-facing
 * artifact. Drift in its structure is a breaking change that ratchets
 * `bundleVersion`. Snapshot tests catch unintentional drift; if a
 * field changes meaning, bump the version + intentionally update
 * the snapshot in the same commit.
 *
 * All inputs are pinned: fixed timestamps, fixed UUIDs, fixed hashes.
 * The bundle should be byte-identical on every machine.
 */

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const FIXED_NOW = new Date('2026-05-20T12:00:00.000Z');
const FIXED_GENERATED_AT = new Date('2026-05-20T13:00:00.000Z');

const tenant: Tenant = {
  id: b<string, 'TenantId'>('tnt_audit') as TenantId,
  region: b<string, 'Region'>('eu-west-2') as Region,
};

const compliance: ComplianceManifest = defineCompliance({
  regulations: ['gdpr@2025-Q1' as RegulationVersion],
  dpoContact: 'dpo@crawcus.example',
  fields: {
    'Recipe.title': { pii: 'none' },
    'Recipe.notes': { pii: 'personal', retention: 'P7Y' as ISO8601Duration },
  },
  retention: {
    default: 'P7Y' as ISO8601Duration,
    events: 'P10Y' as ISO8601Duration,
    pii: {
      personal: 'P7Y' as ISO8601Duration,
      sensitive: 'P3Y' as ISO8601Duration,
      special: 'P1Y' as ISO8601Duration,
    },
  },
  residency: {
    region: 'eu-west-2' as Region,
    eventStore: 'eu-west-2' as Region,
    piiVault: 'eu-west-2' as Region,
    aiProvider: { provider: 'stub', endpoint: 'in-process' },
    crossBorderTransfers: 'forbid',
  },
  ai: {
    allowedModels: ['stub-model'],
    promptTemplateVersion: 'v1',
    costCeilingPerIntent: { currency: 'usd', amount: 0.5 },
  },
  lawfulBasis: {
    default: 'contract',
    perPurpose: {
      'recipe-creation': 'contract',
    },
  },
});

const spec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('CreateRecipe') as IntentKey,
  projection: b<string, 'ProjectionName'>('Recipe') as ProjectionName,
  version: 1,
  classification: 'standard',
  i18nDefault: 'en' as Locale,
  fields: {
    title: field.string().required(),
    notes: field.string().optional(),
  },
  readiness: () => true,
});

const intentId = b<string, 'IntentId'>('00000000-0000-7000-0000-000000000001') as IntentId;

const intent: Intent = {
  id: intentId,
  tenantId: tenant.id,
  key: spec.key,
  specVersion: spec.version,
  state: 'committed',
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
  snapshot: { title: 'Pancakes', notes: '[[pii:tok_001]]' },
};

const makeEvent = (
  version: number,
  prevHash: ContentHash | null,
  kind: 'CapturedTurn' | 'ProjectionCommit',
  payload: Record<string, unknown>,
): Event => {
  const base = {
    tenantId: tenant.id,
    intentId,
    kind,
    version,
    timestamp: FIXED_NOW,
    actor: { id: b<string, 'ActorId'>('act_paul') as ActorId, kind: 'human' as const },
    lawfulBasis: 'contract' as const,
    purpose: b<string, 'Purpose'>('recipe-creation') as Purpose,
    dataSubjectIds: [b<string, 'SubjectId'>('subj_anon') as SubjectId],
    prevHash,
    payload,
  };
  const contentHash = computeContentHash(base);
  return {
    ...base,
    id: b<string, 'EventId'>(
      `00000000-0000-7000-0000-${String(version).padStart(12, '0')}`,
    ) as never,
    contentHash,
  };
};

const e0 = makeEvent(0, null, 'CapturedTurn', { field: 'title', value: 'Pancakes' });
const e1 = makeEvent(1, e0.contentHash, 'CapturedTurn', {
  field: 'notes',
  value: '[[pii:tok_001]]',
});
const e2 = makeEvent(2, e1.contentHash, 'ProjectionCommit', {
  projection: 'Recipe',
  snapshot: { title: 'Pancakes', notes: '[[pii:tok_001]]' },
});

const events: readonly Event[] = [e0, e1, e2];

const chainProof: HashChainProof = {
  intentId,
  fromEventId: e0.id,
  toEventId: e2.id,
  rootHash: e2.contentHash,
  hashes: events.map((e) => ({
    id: e.id,
    prevHash: e.prevHash,
    contentHash: e.contentHash,
  })),
};

describe('composeAuditBundle', () => {
  const bundle: AuditBundle = composeAuditBundle({
    tenant,
    intent,
    spec,
    compliance,
    events,
    chainProof,
    generatedAt: FIXED_GENERATED_AT,
  });

  it('produces a stable canonical-JSON snapshot', () => {
    const json = canonicalJSON(bundle);
    expect(json).toMatchSnapshot();
  });

  it('includes the bundle version', () => {
    expect(bundle.bundleVersion).toBe(AUDIT_BUNDLE_VERSION);
  });

  it('emits generatedAt as an ISO-8601 string', () => {
    expect(bundle.generatedAt).toBe('2026-05-20T13:00:00.000Z');
  });

  it('includes the full event log', () => {
    expect(bundle.events).toHaveLength(3);
    expect(bundle.events[0]?.version).toBe(0);
    expect(bundle.events[2]?.kind).toBe('ProjectionCommit');
  });

  it('includes the chain proof with matching rootHash', () => {
    expect(bundle.chainProof.rootHash).toBe(e2.contentHash);
    expect(bundle.chainProof.hashes).toHaveLength(3);
  });

  it('snapshots PII as markers, never plaintext', () => {
    const json = canonicalJSON(bundle);
    expect(json).toContain('[[pii:tok_001]]');
    expect(json).not.toMatch(/secret-personal-data/i);
  });

  it('omits derogations when none supplied', () => {
    expect(bundle.derogations).toBeUndefined();
  });

  it('includes derogations when supplied', () => {
    const withDerogation = composeAuditBundle({
      tenant,
      intent,
      spec,
      compliance,
      events,
      chainProof,
      generatedAt: FIXED_GENERATED_AT,
      derogations: [
        {
          contractId: 'ferpa.99-31.disclosureConsent',
          reason: 'Legitimate educational interest per §99.31(a)(1)(i)(A)',
          approver: b<string, 'ActorId'>('act_dpo') as ActorId,
          approvedAt: '2026-05-20T10:00:00.000Z',
          regulation: 'ferpa@2024' as RegulationVersion,
          clauseReference: '§99.31(a)(1)(i)(A)',
        },
      ],
    });
    expect(withDerogation.derogations).toHaveLength(1);
    expect(withDerogation.derogations?.[0]?.contractId).toBe('ferpa.99-31.disclosureConsent');
  });

  it('canonical JSON output is byte-stable across two invocations', () => {
    const j1 = canonicalJSON(bundle);
    const j2 = canonicalJSON(bundle);
    expect(j1).toBe(j2);
  });
});

// ============ v0.1.0 — five additive primitive sections ============
//
// composeAuditBundle accepts five new optional inputs (warrants /
// disclosures / consents / lineages / oversights). Each is rendered
// into the bundle when supplied + non-empty, mirroring the existing
// contractResults / derogations omit-when-empty pattern.
//
// Fixtures are minimum-viable shape (cast through never): the composer
// is opaque to record content — it pass-through-appends arrays — so
// real signed Warrants / PROV-O graphs aren't needed for the composer
// tests. Per-primitive evaluator tests in
// packages/crawcus-spec/test/{warrant,disclosure,consent,lineage,
// oversight}/ exercise the structural validation paths.

const warrantFixture = { id: 'wt_test' } as never as Warrant;
const disclosureFixture = { id: 'dl_test' } as never as Disclosure;
const consentFixture = { id: 'cn_test' } as never as Consent;
const lineageFixture = { id: 'ln_test' } as never as Lineage;
const oversightFixture = { id: 'ov_test' } as never as HumanOversight;

const baseInput = {
  tenant,
  intent,
  spec,
  compliance,
  events,
  chainProof,
  generatedAt: FIXED_GENERATED_AT,
} as const;

describe('composeAuditBundle — warrants section (primitive #10)', () => {
  it('omits warrants when input.warrants is undefined', () => {
    expect(composeAuditBundle(baseInput).warrants).toBeUndefined();
  });

  it('omits warrants when input.warrants is an empty array', () => {
    expect(composeAuditBundle({ ...baseInput, warrants: [] }).warrants).toBeUndefined();
  });

  it('includes warrants when supplied with one record', () => {
    const b1 = composeAuditBundle({ ...baseInput, warrants: [warrantFixture] });
    expect(b1.warrants).toHaveLength(1);
    expect(b1.warrants?.[0]?.id).toBe('wt_test');
  });

  it('includes warrants when supplied with multiple records', () => {
    const second = { id: 'wt_test_2' } as never as Warrant;
    const b1 = composeAuditBundle({ ...baseInput, warrants: [warrantFixture, second] });
    expect(b1.warrants).toHaveLength(2);
  });
});

describe('composeAuditBundle — disclosures section (primitive #11)', () => {
  it('omits disclosures when input.disclosures is undefined', () => {
    expect(composeAuditBundle(baseInput).disclosures).toBeUndefined();
  });

  it('omits disclosures when input.disclosures is an empty array', () => {
    expect(composeAuditBundle({ ...baseInput, disclosures: [] }).disclosures).toBeUndefined();
  });

  it('includes disclosures when supplied', () => {
    const b1 = composeAuditBundle({ ...baseInput, disclosures: [disclosureFixture] });
    expect(b1.disclosures).toHaveLength(1);
    expect(b1.disclosures?.[0]?.id).toBe('dl_test');
  });
});

describe('composeAuditBundle — consents section (primitive #12)', () => {
  it('omits consents when input.consents is undefined', () => {
    expect(composeAuditBundle(baseInput).consents).toBeUndefined();
  });

  it('omits consents when input.consents is an empty array', () => {
    expect(composeAuditBundle({ ...baseInput, consents: [] }).consents).toBeUndefined();
  });

  it('includes consents when supplied', () => {
    const b1 = composeAuditBundle({ ...baseInput, consents: [consentFixture] });
    expect(b1.consents).toHaveLength(1);
    expect(b1.consents?.[0]?.id).toBe('cn_test');
  });
});

describe('composeAuditBundle — lineages section (primitive #13)', () => {
  it('omits lineages when input.lineages is undefined', () => {
    expect(composeAuditBundle(baseInput).lineages).toBeUndefined();
  });

  it('omits lineages when input.lineages is an empty array', () => {
    expect(composeAuditBundle({ ...baseInput, lineages: [] }).lineages).toBeUndefined();
  });

  it('includes lineages when supplied', () => {
    const b1 = composeAuditBundle({ ...baseInput, lineages: [lineageFixture] });
    expect(b1.lineages).toHaveLength(1);
    expect(b1.lineages?.[0]?.id).toBe('ln_test');
  });
});

describe('composeAuditBundle — oversights section (primitive #14)', () => {
  it('omits oversights when input.oversights is undefined', () => {
    expect(composeAuditBundle(baseInput).oversights).toBeUndefined();
  });

  it('omits oversights when input.oversights is an empty array', () => {
    expect(composeAuditBundle({ ...baseInput, oversights: [] }).oversights).toBeUndefined();
  });

  it('includes oversights when supplied', () => {
    const b1 = composeAuditBundle({ ...baseInput, oversights: [oversightFixture] });
    expect(b1.oversights).toHaveLength(1);
    expect(b1.oversights?.[0]?.id).toBe('ov_test');
  });
});

describe('composeAuditBundle — all five sections populated', () => {
  const full = composeAuditBundle({
    ...baseInput,
    warrants: [warrantFixture],
    disclosures: [disclosureFixture],
    consents: [consentFixture],
    lineages: [lineageFixture],
    oversights: [oversightFixture],
  });

  it('renders all five primitive sections alongside events + chain proof', () => {
    expect(full.warrants).toHaveLength(1);
    expect(full.disclosures).toHaveLength(1);
    expect(full.consents).toHaveLength(1);
    expect(full.lineages).toHaveLength(1);
    expect(full.oversights).toHaveLength(1);
  });

  it('canonical JSON output is byte-stable with all five sections', () => {
    expect(canonicalJSON(full)).toBe(canonicalJSON(full));
  });

  it('canonical JSON keys are alphabetically sorted (RFC 8785)', () => {
    const json = canonicalJSON(full);
    // The five new section keys must appear in alphabetical order
    // when canonical-JSON-serialised: consents, disclosures, lineages,
    // oversights, warrants. Slice the substring of the bundle that
    // contains the keys; assert ordering by find-index.
    const idxConsents = json.indexOf('"consents"');
    const idxDisclosures = json.indexOf('"disclosures"');
    const idxLineages = json.indexOf('"lineages"');
    const idxOversights = json.indexOf('"oversights"');
    const idxWarrants = json.indexOf('"warrants"');
    expect(idxConsents).toBeLessThan(idxDisclosures);
    expect(idxDisclosures).toBeLessThan(idxLineages);
    expect(idxLineages).toBeLessThan(idxOversights);
    expect(idxOversights).toBeLessThan(idxWarrants);
  });

  it('bundleVersion is 0.1.0 (additive primitive sections vs 0.0.1)', () => {
    expect(full.bundleVersion).toBe('0.1.0');
  });
});
