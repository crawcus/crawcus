import { describe, it, expect } from 'vitest';
import { checkProvOIntegrity, evaluateLineage } from '../../src/lineage/evaluate.js';
import { PROV_JSONLD_CONTEXT_URL } from '../../src/lineage/types.js';
import type {
  Lineage,
  LineageCtx,
  LineageInput,
  LineageRequirement,
  ModelRef,
  ProvOSerialization,
} from '../../src/lineage/types.js';
import type { Iri } from '../../src/types/ids.js';

// ============ Fixtures ============

const modelIri = 'urn:crawcus:tn_demo:model:claude-sonnet-4-6' as Iri;
const activityIri = 'urn:crawcus:tn_demo:activity:run_001' as Iri;
const promptIri = 'urn:crawcus:tn_demo:plan:tpl_customer_summary_v3' as Iri;
const userMsgIri = 'urn:crawcus:tn_demo:entity:msg_user_42' as Iri;
const outputIri = 'urn:crawcus:tn_demo:entity:out_001' as Iri;

function makeModelRef(): ModelRef {
  return {
    id: modelIri,
    provider: 'anthropic',
    name: 'claude-sonnet-4-6',
    version: '1.0',
  };
}

function makeProvO(overrides: Partial<ProvOSerialization> = {}): ProvOSerialization {
  return {
    '@context': PROV_JSONLD_CONTEXT_URL,
    '@graph': [
      { '@id': modelIri, '@type': ['Agent', 'SoftwareAgent'] as const, 'prov:label': 'claude' },
      { '@id': promptIri, '@type': ['Entity', 'Plan'] as const, 'prov:type': 'PromptTemplate' },
      { '@id': userMsgIri, '@type': 'Entity' as const, 'prov:type': 'UserMessage' },
      {
        '@id': activityIri,
        '@type': 'Activity' as const,
        used: [promptIri, userMsgIri],
        wasAssociatedWith: modelIri,
      },
      {
        '@id': outputIri,
        '@type': 'Entity' as const,
        wasGeneratedBy: activityIri,
        wasAttributedTo: modelIri,
      },
    ],
    ...overrides,
  };
}

function makeLineage(overrides: Partial<Lineage> = {}): Lineage {
  const inputs: LineageInput[] = [
    { id: promptIri, kind: 'event' },
    { id: userMsgIri, kind: 'user-message' },
  ];
  return {
    id: 'ln_001' as Lineage['id'],
    tenantId: 'tn_demo' as Lineage['tenantId'],
    outputEventId: 'evt_001' as Lineage['outputEventId'],
    affectedSubjects: ['sub_alice' as Lineage['affectedSubjects'][0]],
    inputs,
    model: makeModelRef(),
    promptTemplate: null,
    recordedAt: '2026-05-22T14:00:00.000Z' as Lineage['recordedAt'],
    provO: makeProvO(),
    ...overrides,
  };
}

function makeCtx(now: Date, hasAIProvenance = true): LineageCtx {
  return {
    intent: {
      id: 'i_demo' as LineageCtx['intent']['id'],
      key: 'CreateCourse' as LineageCtx['intent']['key'],
      tenantId: 'tn_demo' as LineageCtx['intent']['tenantId'],
      actorId: 'ac_alice' as LineageCtx['intent']['actorId'],
      classification: undefined,
    } as LineageCtx['intent'],
    spec: {
      key: 'CreateCourse' as LineageCtx['spec']['key'],
      version: 1,
      fields: [],
      readiness: () => true,
    } as unknown as LineageCtx['spec'],
    tenant: {
      id: 'tn_demo' as LineageCtx['tenant']['id'],
      region: 'eu-west-1' as LineageCtx['tenant']['region'],
    } as LineageCtx['tenant'],
    events: [],
    hasAIProvenance,
    now,
  };
}

const req: LineageRequirement = { required: true };
const reqMinTwo: LineageRequirement = { required: true, minInputs: 2 };

// ============ Happy paths ============

describe('evaluateLineage — happy path', () => {
  it("returns 'valid' for a well-formed Lineage record with sufficient inputs", () => {
    const ln = makeLineage();
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    const result = evaluateLineage(req, [ln], ctx);
    expect(result.status).toBe('valid');
    expect(result.checkpoint).toBe('pre');
    expect(result.evaluatedAt).toMatch(/^2026-05-22T/);
    expect('reason' in result).toBe(false);
  });

  it('respects the checkpoint argument', () => {
    const ln = makeLineage();
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    expect(evaluateLineage(req, [ln], ctx, 'post').checkpoint).toBe('post');
    expect(evaluateLineage(req, [ln], ctx, 'inv').checkpoint).toBe('inv');
  });

  it("returns 'valid' when ctx.hasAIProvenance is false (gate skipped)", () => {
    // Even with no Lineage records, a non-AI-mediated event passes.
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'), false);
    expect(evaluateLineage(req, [], ctx).status).toBe('valid');
  });

  it('uses the most recent Lineage record when multiple exist', () => {
    const older = makeLineage({
      id: 'ln_old' as Lineage['id'],
      recordedAt: '2026-05-22T12:00:00.000Z' as Lineage['recordedAt'],
      inputs: [{ id: promptIri, kind: 'event' }], // only 1 input
    });
    const newer = makeLineage({
      id: 'ln_new' as Lineage['id'],
      recordedAt: '2026-05-22T14:00:00.000Z' as Lineage['recordedAt'],
    });
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    // Older has only 1 input; newer has 2 — minInputs=2 would fail on
    // older but pass on newer. Evaluator must pick newer.
    expect(evaluateLineage(reqMinTwo, [older, newer], ctx).status).toBe('valid');
  });
});

// ============ Missing ============

describe('evaluateLineage — missing', () => {
  it("returns 'missing' when no Lineage records exist for an AI-mediated event", () => {
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    const result = evaluateLineage(req, [], ctx);
    expect(result.status).toBe('missing');
    expect(result.reason).toMatch(/No Lineage record exists/);
  });
});

// ============ Insufficient inputs ============

describe('evaluateLineage — insufficient inputs', () => {
  it("returns 'insufficient-inputs' when inputs.length < minInputs", () => {
    const oneInput = makeLineage({ inputs: [{ id: promptIri, kind: 'event' }] });
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    const result = evaluateLineage(reqMinTwo, [oneInput], ctx);
    expect(result.status).toBe('insufficient-inputs');
    expect(result.reason).toMatch(/has 1 inputs/);
    expect(result.reason).toMatch(/minInputs is 2/);
  });

  it('defaults minInputs to 1 when unset', () => {
    const noInputs = makeLineage({ inputs: [] });
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    expect(evaluateLineage(req, [noInputs], ctx).status).toBe('insufficient-inputs');
  });

  it("returns 'valid' when minInputs=1 and inputs has exactly 1", () => {
    const oneInput = makeLineage({ inputs: [{ id: promptIri, kind: 'event' }] });
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    expect(evaluateLineage(req, [oneInput], ctx).status).toBe('valid');
  });
});

// ============ PROV-O integrity ============

describe('evaluateLineage — PROV-O integrity', () => {
  it("returns 'blank-node-forbidden' when any node lacks explicit @id", () => {
    const bad = makeLineage({
      provO: {
        '@context': PROV_JSONLD_CONTEXT_URL,
        '@graph': [
          // @id is empty string — invalid per federation discipline
          { '@id': '' as Iri, '@type': 'Entity' },
        ],
      } as ProvOSerialization,
    });
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    const result = evaluateLineage(req, [bad], ctx);
    expect(result.status).toBe('blank-node-forbidden');
    expect(result.reason).toMatch(/blank node forbidden/);
  });

  it("returns 'malformed-prov-o' when @context is missing", () => {
    const bad = makeLineage({
      provO: {
        '@graph': [{ '@id': outputIri, '@type': 'Entity' }],
      } as unknown as ProvOSerialization,
    });
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    const result = evaluateLineage(req, [bad], ctx);
    expect(result.status).toBe('malformed-prov-o');
    expect(result.reason).toMatch(/missing @context/);
  });

  it("returns 'malformed-prov-o' when @graph is empty", () => {
    const bad = makeLineage({
      provO: { '@context': PROV_JSONLD_CONTEXT_URL, '@graph': [] },
    });
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    const result = evaluateLineage(req, [bad], ctx);
    expect(result.status).toBe('malformed-prov-o');
    expect(result.reason).toMatch(/@graph is empty/);
  });
});

// ============ checkProvOIntegrity (public helper) ============

describe('checkProvOIntegrity', () => {
  it('returns ok for a well-formed PROV-O document', () => {
    expect(checkProvOIntegrity(makeProvO()).status).toBe('ok');
  });

  it('catches blank nodes', () => {
    const r = checkProvOIntegrity({
      '@context': PROV_JSONLD_CONTEXT_URL,
      '@graph': [{ '@id': '' as Iri, '@type': 'Entity' }],
    });
    expect(r.status).toBe('blank-node-forbidden');
  });

  it('catches missing context', () => {
    const r = checkProvOIntegrity({
      '@graph': [{ '@id': outputIri, '@type': 'Entity' }],
    } as unknown as ProvOSerialization);
    expect(r.status).toBe('malformed-prov-o');
  });

  it('catches non-array @graph', () => {
    const r = checkProvOIntegrity({
      '@context': PROV_JSONLD_CONTEXT_URL,
      '@graph': 'not-an-array',
    } as unknown as ProvOSerialization);
    expect(r.status).toBe('malformed-prov-o');
  });
});

// ============ Order precedence ============

describe('evaluateLineage — order precedence', () => {
  it("reports 'missing' (not 'malformed-prov-o') when no records at all", () => {
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    expect(evaluateLineage(req, [], ctx).status).toBe('missing');
  });

  it("reports 'insufficient-inputs' (not 'malformed-prov-o') when both fail", () => {
    // Record has 0 inputs AND malformed PROV-O — insufficient-inputs
    // is the certain failure, so it's reported first.
    const bad = makeLineage({
      inputs: [],
      provO: { '@context': PROV_JSONLD_CONTEXT_URL, '@graph': [] },
    });
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'));
    expect(evaluateLineage(req, [bad], ctx).status).toBe('insufficient-inputs');
  });

  it("reports 'valid' first when no AI provenance, ignoring even malformed records", () => {
    const bad = makeLineage({
      provO: { '@context': PROV_JSONLD_CONTEXT_URL, '@graph': [] },
    });
    const ctx = makeCtx(new Date('2026-05-22T15:00:00.000Z'), false);
    expect(evaluateLineage(req, [bad], ctx).status).toBe('valid');
  });
});
