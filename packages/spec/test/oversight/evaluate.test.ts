import { describe, it, expect } from 'vitest';
import { evaluateOversight } from '../../src/oversight/evaluate.js';
import type {
  HumanOversight,
  OversightCtx,
  OverseerRef,
  OversightRequirement,
} from '../../src/oversight/types.js';

// ============ Fixtures ============

const REQ_AI_ART14 = 'ai-act-art-14-periodic' as OversightRequirement['id'];
const REQ_OTHER = 'iso-42001-monitoring' as OversightRequirement['id'];

const GDPR_ART_7: HumanOversight['regulation'] = {
  regulation: 'eu-ai-act@2026-Q2' as HumanOversight['regulation']['regulation'],
  article: 'Art. 14',
};

function makeRequirement(overrides: Partial<OversightRequirement> = {}): OversightRequirement {
  return {
    id: REQ_AI_ART14,
    regulation: GDPR_ART_7,
    acceptedRoles: ['individual', 'committee'],
    mode: 'on-loop',
    maxGapDays: 90,
    ...overrides,
  };
}

function makeOverseer(overrides: Partial<OverseerRef> = {}): OverseerRef {
  return {
    id: 'ac_chair' as OverseerRef['id'],
    role: 'individual',
    orgId: 'org_dpo' as OverseerRef['orgId'],
    name: 'Dr. DPO Chair',
    ...overrides,
  };
}

function makeOversight(overrides: Partial<HumanOversight> = {}): HumanOversight {
  return {
    id: 'ov_001' as HumanOversight['id'],
    tenantId: 'tn_demo' as HumanOversight['tenantId'],
    requirementId: REQ_AI_ART14,
    overseer: makeOverseer(),
    scope: {
      kind: 'period',
      from: '2026-04-01T00:00:00.000Z' as HumanOversight['conductedAt'],
      to: '2026-05-01T00:00:00.000Z' as HumanOversight['conductedAt'],
    },
    mode: 'on-loop',
    conductedAt: '2026-05-01T00:00:00.000Z' as HumanOversight['conductedAt'],
    outcome: 'signed-off',
    findings: [],
    regulation: GDPR_ART_7,
    ...overrides,
  };
}

function makeCtx(now: Date): OversightCtx {
  return {
    intent: {
      id: 'i_demo' as OversightCtx['intent']['id'],
      key: 'CreateCourse' as OversightCtx['intent']['key'],
      tenantId: 'tn_demo' as OversightCtx['intent']['tenantId'],
      actorId: 'ac_alice' as OversightCtx['intent']['actorId'],
      classification: undefined,
    } as OversightCtx['intent'],
    spec: {
      key: 'CreateCourse' as OversightCtx['spec']['key'],
      version: 1,
      fields: [],
      readiness: () => true,
    } as unknown as OversightCtx['spec'],
    tenant: {
      id: 'tn_demo' as OversightCtx['tenant']['id'],
      region: 'eu-west-1' as OversightCtx['tenant']['region'],
    } as OversightCtx['tenant'],
    events: [],
    now,
  };
}

// ============ Happy paths ============

describe('evaluateOversight — happy path', () => {
  it("returns 'valid' for a signed-off, in-window, role-accepted oversight", () => {
    const req = makeRequirement();
    const ov = makeOversight();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateOversight(req, [ov], ctx);
    expect(result.status).toBe('valid');
    expect(result.checkpoint).toBe('pre');
    expect(result.evaluatedAt).toMatch(/^2026-06-01T/);
    expect('reason' in result).toBe(false);
  });

  it('respects the checkpoint argument', () => {
    const req = makeRequirement();
    const ov = makeOversight();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateOversight(req, [ov], ctx, 'post').checkpoint).toBe('post');
    expect(evaluateOversight(req, [ov], ctx, 'inv').checkpoint).toBe('inv');
  });

  it('uses the most recent record when multiple exist', () => {
    const req = makeRequirement();
    const old = makeOversight({
      id: 'ov_old' as HumanOversight['id'],
      conductedAt: '2026-01-01T00:00:00.000Z' as HumanOversight['conductedAt'],
      outcome: 'escalated', // would fail
    });
    const recent = makeOversight({
      id: 'ov_new' as HumanOversight['id'],
      conductedAt: '2026-05-01T00:00:00.000Z' as HumanOversight['conductedAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateOversight(req, [old, recent], ctx).status).toBe('valid');
  });
});

// ============ Missing ============

describe('evaluateOversight — missing', () => {
  it("returns 'missing' when no records exist for the requirement", () => {
    const req = makeRequirement();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateOversight(req, [], ctx);
    expect(result.status).toBe('missing');
    expect(result.reason).toMatch(/No HumanOversight record exists/);
  });

  it("returns 'missing' when records exist for a different requirement", () => {
    const req = makeRequirement();
    const ovForOther = makeOversight({ requirementId: REQ_OTHER });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateOversight(req, [ovForOther], ctx).status).toBe('missing');
  });
});

// ============ Escalated ============

describe('evaluateOversight — escalated', () => {
  it("returns 'escalated' when most-recent outcome is escalated", () => {
    const req = makeRequirement();
    const ov = makeOversight({ outcome: 'escalated' });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateOversight(req, [ov], ctx);
    expect(result.status).toBe('escalated');
    expect(result.reason).toMatch(/remediation required/);
  });
});

// ============ Role not accepted ============

describe('evaluateOversight — role not accepted (Q-CR8 Role+Org abstraction)', () => {
  it("returns 'role-not-accepted' when overseer.role is not in requirement.acceptedRoles", () => {
    const req = makeRequirement({ acceptedRoles: ['committee'] });
    const ov = makeOversight({ overseer: makeOverseer({ role: 'individual' }) });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateOversight(req, [ov], ctx);
    expect(result.status).toBe('role-not-accepted');
    expect(result.reason).toMatch(/individual/);
  });

  it('accepts committee role when in acceptedRoles', () => {
    const req = makeRequirement({ acceptedRoles: ['committee'] });
    const ov = makeOversight({
      overseer: makeOverseer({
        role: 'committee',
        committeeMembers: [
          'ac_member1' as OverseerRef['committeeMembers'] extends readonly (infer T)[] ? T : never,
          'ac_member2' as OverseerRef['committeeMembers'] extends readonly (infer T)[] ? T : never,
        ] as never,
      }),
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateOversight(req, [ov], ctx).status).toBe('valid');
  });

  it('accepts notified-body role for Y2 federation pattern', () => {
    const req = makeRequirement({ acceptedRoles: ['notified-body'] });
    const ov = makeOversight({ overseer: makeOverseer({ role: 'notified-body' }) });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateOversight(req, [ov], ctx).status).toBe('valid');
  });
});

// ============ Expired gap ============

describe('evaluateOversight — expired gap', () => {
  it("returns 'expired-gap' when conductedAt is older than maxGapDays", () => {
    const req = makeRequirement({ maxGapDays: 30 });
    const ov = makeOversight({
      conductedAt: '2026-01-01T00:00:00.000Z' as HumanOversight['conductedAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateOversight(req, [ov], ctx);
    expect(result.status).toBe('expired-gap');
    expect(result.reason).toMatch(/more than 30 days old/);
  });

  it("returns 'valid' when within the gap window", () => {
    const req = makeRequirement({ maxGapDays: 90 });
    const ov = makeOversight({
      conductedAt: '2026-05-01T00:00:00.000Z' as HumanOversight['conductedAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateOversight(req, [ov], ctx).status).toBe('valid');
  });
});

// ============ Order precedence ============

describe('evaluateOversight — order precedence', () => {
  it("reports 'missing' (not 'escalated') when no records", () => {
    const req = makeRequirement();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateOversight(req, [], ctx).status).toBe('missing');
  });

  it("reports 'escalated' (not 'expired-gap') when most-recent is both", () => {
    const req = makeRequirement({ maxGapDays: 30 });
    const ov = makeOversight({
      outcome: 'escalated',
      conductedAt: '2026-01-01T00:00:00.000Z' as HumanOversight['conductedAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateOversight(req, [ov], ctx).status).toBe('escalated');
  });

  it("reports 'role-not-accepted' (not 'expired-gap') when both fail", () => {
    const req = makeRequirement({ acceptedRoles: ['committee'], maxGapDays: 30 });
    const ov = makeOversight({
      overseer: makeOverseer({ role: 'individual' }),
      conductedAt: '2026-01-01T00:00:00.000Z' as HumanOversight['conductedAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateOversight(req, [ov], ctx).status).toBe('role-not-accepted');
  });
});
