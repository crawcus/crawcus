import { describe, it, expect } from 'vitest';
import { evaluateDisclosure, isWithinRecurrenceWindow } from '../../src/disclosure/evaluate.js';
import type {
  Disclosure,
  DisclosureCtx,
  DisclosureRequirement,
} from '../../src/disclosure/types.js';

// ============ Fixtures ============

const SUBJECT_A = 'sub_alice' as Disclosure['subject'];
const SUBJECT_B = 'sub_bob' as Disclosure['subject'];
const REQ_AI_INTERACTION = 'ai-act-art-50-ai-interaction' as DisclosureRequirement['id'];
const REQ_FERPA_ANNUAL = 'ferpa-§99.7-annual-notification' as DisclosureRequirement['id'];

function makeRequirement(overrides: Partial<DisclosureRequirement> = {}): DisclosureRequirement {
  return {
    id: REQ_AI_INTERACTION,
    regulation: {
      framework: 'eu-ai-act',
      article: 'Art. 50',
      version: 'eu-ai-act@2026-Q2' as DisclosureRequirement['regulation']['version'],
    },
    mustAcknowledge: false,
    recurrence: 'once-per-subject',
    ...overrides,
  };
}

function makeDisclosure(overrides: Partial<Disclosure> = {}): Disclosure {
  return {
    id: 'disc_001' as Disclosure['id'],
    tenantId: 'tn_demo' as Disclosure['tenantId'],
    subject: SUBJECT_A,
    requirementId: REQ_AI_INTERACTION,
    content: {
      text: 'You are interacting with an AI system.',
      format: 'text',
      locale: 'en',
    },
    contentHash: 'h_abc' as Disclosure['contentHash'],
    deliveredAt: '2026-05-01T00:00:00.000Z' as Disclosure['deliveredAt'],
    deliveryMethod: 'in-app',
    acknowledgedAt: null,
    retractedAt: null,
    ...overrides,
  };
}

function makeCtx(now: Date, overrides: Partial<DisclosureCtx> = {}): DisclosureCtx {
  return {
    intent: {
      id: 'i_demo' as DisclosureCtx['intent']['id'],
      key: 'CreateCourse' as DisclosureCtx['intent']['key'],
      tenantId: 'tn_demo' as DisclosureCtx['intent']['tenantId'],
      actorId: 'ac_alice' as DisclosureCtx['intent']['actorId'],
      classification: undefined,
    } as DisclosureCtx['intent'],
    spec: {
      key: 'CreateCourse' as DisclosureCtx['spec']['key'],
      version: 1,
      fields: [],
      readiness: () => true,
    } as unknown as DisclosureCtx['spec'],
    tenant: {
      id: 'tn_demo' as DisclosureCtx['tenant']['id'],
      region: 'eu-west-1' as DisclosureCtx['tenant']['region'],
    } as DisclosureCtx['tenant'],
    events: [],
    dataSubjectIds: [SUBJECT_A],
    now,
    ...overrides,
  };
}

// ============ Happy paths ============

describe('evaluateDisclosure — happy path', () => {
  it("returns 'valid' for a delivered, in-window, no-ack-required disclosure", () => {
    const req = makeRequirement();
    const disc = makeDisclosure();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateDisclosure(req, SUBJECT_A, [disc], ctx);
    expect(result.status).toBe('valid');
    expect(result.subject).toBe(SUBJECT_A);
    expect(result.requirementId).toBe(REQ_AI_INTERACTION);
    expect(result.checkpoint).toBe('pre');
    expect(result.evaluatedAt).toMatch(/^2026-06-01T/);
    expect('reason' in result).toBe(false);
  });

  it('respects the checkpoint argument', () => {
    const req = makeRequirement();
    const disc = makeDisclosure();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [disc], ctx, 'post').checkpoint).toBe('post');
    expect(evaluateDisclosure(req, SUBJECT_A, [disc], ctx, 'inv').checkpoint).toBe('inv');
  });

  it('uses the most recent delivery when multiple exist for a (subject, requirement) pair', () => {
    const req = makeRequirement({ recurrence: 'annual' });
    const old = makeDisclosure({
      id: 'disc_old' as Disclosure['id'],
      deliveredAt: '2024-01-01T00:00:00.000Z' as Disclosure['deliveredAt'],
    });
    const recent = makeDisclosure({
      id: 'disc_recent' as Disclosure['id'],
      deliveredAt: '2026-05-01T00:00:00.000Z' as Disclosure['deliveredAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    // Older delivery is outside the annual window; newer is within. The
    // evaluator must use the newer one → valid.
    expect(evaluateDisclosure(req, SUBJECT_A, [old, recent], ctx).status).toBe('valid');
  });
});

// ============ Undelivered ============

describe('evaluateDisclosure — undelivered', () => {
  it("returns 'undelivered' when no disclosures exist for the subject + requirement", () => {
    const req = makeRequirement();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateDisclosure(req, SUBJECT_A, [], ctx);
    expect(result.status).toBe('undelivered');
    expect(result.reason).toMatch(/No Disclosure delivered/);
    expect(result.reason).toMatch(SUBJECT_A);
    expect(result.reason).toMatch(REQ_AI_INTERACTION);
  });

  it("returns 'undelivered' when disclosures exist for a different subject", () => {
    const req = makeRequirement();
    const discForOther = makeDisclosure({ subject: SUBJECT_B });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [discForOther], ctx).status).toBe('undelivered');
  });

  it("returns 'undelivered' when disclosures exist for a different requirement", () => {
    const req = makeRequirement();
    const discForOther = makeDisclosure({ requirementId: REQ_FERPA_ANNUAL });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [discForOther], ctx).status).toBe('undelivered');
  });
});

// ============ Retracted ============

describe('evaluateDisclosure — retraction', () => {
  it("returns 'retracted' when the most recent delivery has a retractedAt timestamp", () => {
    const req = makeRequirement();
    const disc = makeDisclosure({
      retractedAt: '2026-05-15T00:00:00.000Z' as Disclosure['retractedAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateDisclosure(req, SUBJECT_A, [disc], ctx);
    expect(result.status).toBe('retracted');
    expect(result.reason).toMatch(/retracted at 2026-05-15/);
  });

  it('reports retracted even if an older non-retracted delivery exists (only the most-recent counts)', () => {
    const req = makeRequirement();
    const olderActive = makeDisclosure({
      id: 'disc_old' as Disclosure['id'],
      deliveredAt: '2026-01-01T00:00:00.000Z' as Disclosure['deliveredAt'],
    });
    const newerRetracted = makeDisclosure({
      id: 'disc_new' as Disclosure['id'],
      deliveredAt: '2026-04-01T00:00:00.000Z' as Disclosure['deliveredAt'],
      retractedAt: '2026-05-15T00:00:00.000Z' as Disclosure['retractedAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [olderActive, newerRetracted], ctx).status).toBe(
      'retracted',
    );
  });
});

// ============ Recurrence window ============

describe('evaluateDisclosure — recurrence', () => {
  it("'once-per-subject' allows any past delivery (no window check)", () => {
    const req = makeRequirement({ recurrence: 'once-per-subject' });
    const veryOld = makeDisclosure({
      deliveredAt: '2020-01-01T00:00:00.000Z' as Disclosure['deliveredAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [veryOld], ctx).status).toBe('valid');
  });

  it("'annual' returns valid when delivery is within 365 days", () => {
    const req = makeRequirement({ recurrence: 'annual' });
    const recent = makeDisclosure({
      deliveredAt: '2026-01-01T00:00:00.000Z' as Disclosure['deliveredAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [recent], ctx).status).toBe('valid');
  });

  it("'annual' returns 'expired-window' when delivery is >365 days old", () => {
    const req = makeRequirement({ recurrence: 'annual' });
    const old = makeDisclosure({
      deliveredAt: '2024-01-01T00:00:00.000Z' as Disclosure['deliveredAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateDisclosure(req, SUBJECT_A, [old], ctx);
    expect(result.status).toBe('expired-window');
    expect(result.reason).toMatch(/outside the 'annual' recurrence window/);
  });

  it("'per-event' always returns 'expired-window' for any prior delivery", () => {
    const req = makeRequirement({ recurrence: 'per-event' });
    const justDelivered = makeDisclosure({
      deliveredAt: '2026-06-01T00:00:00.000Z' as Disclosure['deliveredAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.001Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [justDelivered], ctx).status).toBe('expired-window');
  });

  it("'per-session' returns 'subject-missing-session' when sessionId is undefined", () => {
    const req = makeRequirement({ recurrence: 'per-session' });
    const disc = makeDisclosure();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z')); // no sessionId
    const result = evaluateDisclosure(req, SUBJECT_A, [disc], ctx);
    expect(result.status).toBe('subject-missing-session');
    expect(result.reason).toMatch(/sessionId is undefined/);
  });

  it("'per-session' returns 'valid' when sessionId is supplied + delivery exists", () => {
    const req = makeRequirement({ recurrence: 'per-session' });
    const disc = makeDisclosure();
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'), { sessionId: 'sess_42' });
    expect(evaluateDisclosure(req, SUBJECT_A, [disc], ctx).status).toBe('valid');
  });
});

// ============ Acknowledgment ============

describe('evaluateDisclosure — acknowledgment', () => {
  it("returns 'unacknowledged' when mustAcknowledge=true and the delivery has null acknowledgedAt", () => {
    const req = makeRequirement({ mustAcknowledge: true });
    const disc = makeDisclosure({ acknowledgedAt: null });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    const result = evaluateDisclosure(req, SUBJECT_A, [disc], ctx);
    expect(result.status).toBe('unacknowledged');
    expect(result.reason).toMatch(/requires acknowledgment/);
  });

  it("returns 'valid' when mustAcknowledge=true and the delivery has a non-null acknowledgedAt", () => {
    const req = makeRequirement({ mustAcknowledge: true });
    const disc = makeDisclosure({
      acknowledgedAt: '2026-05-15T00:00:00.000Z' as Disclosure['acknowledgedAt'],
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [disc], ctx).status).toBe('valid');
  });

  it("returns 'valid' when mustAcknowledge=false regardless of acknowledgedAt", () => {
    const req = makeRequirement({ mustAcknowledge: false });
    const disc = makeDisclosure({ acknowledgedAt: null });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [disc], ctx).status).toBe('valid');
  });
});

// ============ Order precedence ============

describe('evaluateDisclosure — order precedence', () => {
  it("reports 'undelivered' (not 'unacknowledged') when there are no deliveries at all", () => {
    // Even with mustAcknowledge=true, the certain failure is 'undelivered'.
    const req = makeRequirement({ mustAcknowledge: true });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [], ctx).status).toBe('undelivered');
  });

  it("reports 'retracted' (not 'unacknowledged') when most recent is retracted + unacknowledged", () => {
    const req = makeRequirement({ mustAcknowledge: true });
    const disc = makeDisclosure({
      retractedAt: '2026-05-15T00:00:00.000Z' as Disclosure['retractedAt'],
      acknowledgedAt: null,
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [disc], ctx).status).toBe('retracted');
  });

  it("reports 'expired-window' (not 'unacknowledged') when most recent is out-of-window + unacknowledged", () => {
    const req = makeRequirement({ recurrence: 'annual', mustAcknowledge: true });
    const old = makeDisclosure({
      deliveredAt: '2024-01-01T00:00:00.000Z' as Disclosure['deliveredAt'],
      acknowledgedAt: null,
    });
    const ctx = makeCtx(new Date('2026-06-01T00:00:00.000Z'));
    expect(evaluateDisclosure(req, SUBJECT_A, [old], ctx).status).toBe('expired-window');
  });
});

// ============ isWithinRecurrenceWindow (the public predicate helper) ============

describe('isWithinRecurrenceWindow', () => {
  it("'annual': true for delivery just under 365 days old", () => {
    const oneDayBeforeYear = new Date('2027-04-30T23:59:59.000Z');
    expect(
      isWithinRecurrenceWindow(
        'annual',
        '2026-05-01T00:00:00.000Z' as Disclosure['deliveredAt'],
        oneDayBeforeYear,
      ),
    ).toBe(true);
  });

  it("'annual': false at exactly 365 days", () => {
    const exactlyOneYear = new Date('2027-05-01T00:00:00.000Z');
    expect(
      isWithinRecurrenceWindow(
        'annual',
        '2026-05-01T00:00:00.000Z' as Disclosure['deliveredAt'],
        exactlyOneYear,
      ),
    ).toBe(false);
  });

  it("'per-event': always false", () => {
    expect(
      isWithinRecurrenceWindow(
        'per-event',
        '2026-06-01T00:00:00.000Z' as Disclosure['deliveredAt'],
        new Date('2026-06-01T00:00:00.001Z'),
      ),
    ).toBe(false);
  });

  it("'per-session': always true (sessionId enforcement happens upstream)", () => {
    expect(
      isWithinRecurrenceWindow(
        'per-session',
        '2026-06-01T00:00:00.000Z' as Disclosure['deliveredAt'],
        new Date('2099-01-01T00:00:00.000Z'),
      ),
    ).toBe(true);
  });
});
