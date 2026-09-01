import { describe, it, expect } from 'vitest';
import { evaluateConsent } from '../../src/consent/evaluate.js';
import type {
  Consent,
  ConsentCtx,
  ConsentReceipt,
  ConsentRequirement,
} from '../../src/consent/types.js';

// ============ Fixtures ============

const SUBJECT_A = 'sub_alice' as Consent['subject'];
const SUBJECT_B = 'sub_bob' as Consent['subject'];
const GRANTOR_A = 'sub_alice' as Consent['grantor'];
const REQ_AI_TRAINING = 'gdpr-art-7-ai-training' as ConsentRequirement['id'];
const REQ_AD_TARGETING = 'gdpr-art-7-ad-targeting' as ConsentRequirement['id'];
const PURPOSE_AI = 'ai-training' as ConsentCtx['processingPurpose'];
const PURPOSE_AD = 'ad-targeting' as ConsentCtx['processingPurpose'];

const GDPR_ART_7: ConsentRequirement['regulation'] = {
  regulation: 'gdpr@2025-Q1' as ConsentRequirement['regulation']['regulation'],
  article: 'Art. 7',
};

const FERPA_99_30: ConsentRequirement['regulation'] = {
  regulation: 'ferpa@2024' as ConsentRequirement['regulation']['regulation'],
  article: '§ 99.30',
};

const receipt: ConsentReceipt = {
  version: '1.1',
  jurisdiction: 'EU',
  consentStatement: 'I authorize the use of my data for AI training.',
  locale: 'en',
  contentHash: 'h_receipt' as ConsentReceipt['contentHash'],
};

function makeRequirement(overrides: Partial<ConsentRequirement> = {}): ConsentRequirement {
  return {
    id: REQ_AI_TRAINING,
    regulation: GDPR_ART_7,
    purposes: [PURPOSE_AI],
    mustBeActive: true,
    ...overrides,
  };
}

function makeConsent(overrides: Partial<Consent> = {}): Consent {
  return {
    id: 'cs_001' as Consent['id'],
    tenantId: 'tn_demo' as Consent['tenantId'],
    subject: SUBJECT_A,
    grantor: GRANTOR_A,
    requirementId: REQ_AI_TRAINING,
    purposes: [PURPOSE_AI],
    regulation: GDPR_ART_7,
    grantedAt: '2026-05-01T00:00:00.000Z' as Consent['grantedAt'],
    withdrawnAt: null,
    withdrawalMethod: null,
    receipt,
    ...overrides,
  };
}

function makeCtx(now: Date, overrides: Partial<ConsentCtx> = {}): ConsentCtx {
  return {
    intent: {
      id: 'i_demo' as ConsentCtx['intent']['id'],
      key: 'CreateCourse' as ConsentCtx['intent']['key'],
      tenantId: 'tn_demo' as ConsentCtx['intent']['tenantId'],
      actorId: 'ac_alice' as ConsentCtx['intent']['actorId'],
      classification: undefined,
    } as ConsentCtx['intent'],
    spec: {
      key: 'CreateCourse' as ConsentCtx['spec']['key'],
      version: 1,
      fields: [],
      readiness: () => true,
    } as unknown as ConsentCtx['spec'],
    tenant: {
      id: 'tn_demo' as ConsentCtx['tenant']['id'],
      region: 'eu-west-1' as ConsentCtx['tenant']['region'],
    } as ConsentCtx['tenant'],
    events: [],
    dataSubjectIds: [SUBJECT_A],
    processingPurpose: PURPOSE_AI,
    now,
    ...overrides,
  };
}

// ============ Happy paths ============

describe('evaluateConsent — happy path', () => {
  it("returns 'valid' for a granted, in-scope, regulation-matching, non-withdrawn consent", () => {
    const req = makeRequirement();
    const cs = makeConsent();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateConsent(req, SUBJECT_A, [cs], ctx);
    expect(result.status).toBe('valid');
    expect(result.subject).toBe(SUBJECT_A);
    expect(result.requirementId).toBe(REQ_AI_TRAINING);
    expect(result.checkpoint).toBe('pre');
    expect(result.evaluatedAt).toMatch(/^2026-06-01T/);
    expect('reason' in result).toBe(false);
  });

  it('respects the checkpoint argument', () => {
    const req = makeRequirement();
    const cs = makeConsent();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateConsent(req, SUBJECT_A, [cs], ctx, 'post').checkpoint).toBe('post');
    expect(evaluateConsent(req, SUBJECT_A, [cs], ctx, 'inv').checkpoint).toBe('inv');
  });

  it('uses the most recent grant when multiple exist for a (subject, requirement) pair', () => {
    const req = makeRequirement();
    const old = makeConsent({
      id: 'cs_old' as Consent['id'],
      grantedAt: '2024-01-01T00:00:00.000Z' as Consent['grantedAt'],
      withdrawnAt: '2024-06-01T00:00:00.000Z' as Consent['withdrawnAt'],
      withdrawalMethod: 'email',
    });
    const recent = makeConsent({
      id: 'cs_recent' as Consent['id'],
      grantedAt: '2026-05-01T00:00:00.000Z' as Consent['grantedAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    // Older grant is withdrawn; newer is active. Evaluator uses newer.
    expect(evaluateConsent(req, SUBJECT_A, [old, recent], ctx).status).toBe('valid');
  });
});

// ============ Missing ============

describe('evaluateConsent — missing', () => {
  it("returns 'missing' when no consents exist for subject + requirement", () => {
    const req = makeRequirement();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateConsent(req, SUBJECT_A, [], ctx);
    expect(result.status).toBe('missing');
    expect(result.reason).toMatch(/No Consent granted/);
    expect(result.reason).toMatch(SUBJECT_A);
    expect(result.reason).toMatch(REQ_AI_TRAINING);
  });

  it("returns 'missing' when consents exist for a different subject", () => {
    const req = makeRequirement();
    const csForOther = makeConsent({ subject: SUBJECT_B });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateConsent(req, SUBJECT_A, [csForOther], ctx).status).toBe('missing');
  });

  it("returns 'missing' when consents exist for a different requirement", () => {
    const req = makeRequirement();
    const csForOther = makeConsent({ requirementId: REQ_AD_TARGETING });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateConsent(req, SUBJECT_A, [csForOther], ctx).status).toBe('missing');
  });
});

// ============ Withdrawn ============

describe('evaluateConsent — withdrawal', () => {
  it("returns 'withdrawn' when most-recent consent has a withdrawnAt timestamp (GDPR Art 7(3))", () => {
    const req = makeRequirement();
    const withdrawn = makeConsent({
      withdrawnAt: '2026-05-15T00:00:00.000Z' as Consent['withdrawnAt'],
      withdrawalMethod: 'data-subject-portal',
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateConsent(req, SUBJECT_A, [withdrawn], ctx);
    expect(result.status).toBe('withdrawn');
    expect(result.reason).toMatch(/withdrawn at 2026-05-15/);
  });

  it('reports withdrawn even when an older non-withdrawn grant exists (only the most-recent counts)', () => {
    const req = makeRequirement();
    const olderActive = makeConsent({
      id: 'cs_old' as Consent['id'],
      grantedAt: '2026-01-01T00:00:00.000Z' as Consent['grantedAt'],
    });
    const newerWithdrawn = makeConsent({
      id: 'cs_new' as Consent['id'],
      grantedAt: '2026-04-01T00:00:00.000Z' as Consent['grantedAt'],
      withdrawnAt: '2026-05-15T00:00:00.000Z' as Consent['withdrawnAt'],
      withdrawalMethod: 'email',
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateConsent(req, SUBJECT_A, [olderActive, newerWithdrawn], ctx).status).toBe(
      'withdrawn',
    );
  });
});

// ============ Regulation mismatch ============

describe('evaluateConsent — regulation mismatch', () => {
  it("returns 'regulation-mismatch' when the active consent cites a different regulation", () => {
    const req = makeRequirement(); // GDPR Art 7
    const csUnderFerpa = makeConsent({ regulation: FERPA_99_30 });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateConsent(req, SUBJECT_A, [csUnderFerpa], ctx);
    expect(result.status).toBe('regulation-mismatch');
    expect(result.reason).toMatch(/does not match requirement/);
  });

  it("returns 'regulation-mismatch' when the article differs (same regulation family)", () => {
    const req = makeRequirement({
      regulation: {
        ...GDPR_ART_7,
        article: 'Art. 9',
      },
    });
    const csUnderArt7 = makeConsent({ regulation: GDPR_ART_7 });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateConsent(req, SUBJECT_A, [csUnderArt7], ctx).status).toBe('regulation-mismatch');
  });
});

// ============ Purpose out-of-scope ============

describe('evaluateConsent — purpose out-of-scope', () => {
  it("returns 'purpose-out-of-scope' when ctx.processingPurpose is not in consent.purposes", () => {
    const req = makeRequirement({ purposes: [PURPOSE_AI, PURPOSE_AD] });
    const csNarrow = makeConsent({ purposes: [PURPOSE_AI] }); // only AI training
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'), {
      processingPurpose: PURPOSE_AD, // event wants ad-targeting
    });
    const result = evaluateConsent(req, SUBJECT_A, [csNarrow], ctx);
    expect(result.status).toBe('purpose-out-of-scope');
    expect(result.reason).toMatch(/Processing purpose 'ad-targeting'/);
    expect(result.reason).toMatch(/is not in Consent.purposes/);
  });

  it("returns 'valid' when consent.purposes covers a superset of the event's purpose", () => {
    const req = makeRequirement({ purposes: [PURPOSE_AI] });
    const csBroad = makeConsent({ purposes: [PURPOSE_AI, PURPOSE_AD] });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateConsent(req, SUBJECT_A, [csBroad], ctx).status).toBe('valid');
  });
});

// ============ Order precedence ============

describe('evaluateConsent — order precedence', () => {
  it("reports 'missing' (not 'purpose-out-of-scope') when no consents at all", () => {
    const req = makeRequirement();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'), {
      processingPurpose: PURPOSE_AD,
    });
    expect(evaluateConsent(req, SUBJECT_A, [], ctx).status).toBe('missing');
  });

  it("reports 'withdrawn' (not 'regulation-mismatch') when most-recent is withdrawn even with wrong regulation", () => {
    const req = makeRequirement(); // GDPR Art 7
    const cs = makeConsent({
      regulation: FERPA_99_30, // wrong reg
      withdrawnAt: '2026-05-15T00:00:00.000Z' as Consent['withdrawnAt'],
      withdrawalMethod: 'email',
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateConsent(req, SUBJECT_A, [cs], ctx).status).toBe('withdrawn');
  });

  it("reports 'regulation-mismatch' (not 'purpose-out-of-scope') when both fail", () => {
    const req = makeRequirement({ purposes: [PURPOSE_AD] });
    const cs = makeConsent({
      regulation: FERPA_99_30,
      purposes: [PURPOSE_AI], // also wrong purpose
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'), {
      processingPurpose: PURPOSE_AD,
    });
    expect(evaluateConsent(req, SUBJECT_A, [cs], ctx).status).toBe('regulation-mismatch');
  });
});
