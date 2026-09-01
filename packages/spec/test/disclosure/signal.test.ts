import { describe, it, expect } from 'vitest';
import {
  disclosureHasOpportunityToBeRead,
  lintDisclosureSignalPredicateName,
  SIGNAL_NOT_GATE_FORBIDDEN_TOKENS,
  SIGNAL_NOT_GATE_REQUIRED_TOKENS,
} from '../../src/disclosure/signal.js';
import type {
  DisclosureDeliveredPayload,
  DisclosureSignalPayload,
} from '../../src/disclosure/types.js';
import type { Event } from '../../src/types/event.js';
import type {
  ContentHash,
  DisclosureId,
  DisclosureRequirementId,
  EventId,
  IntentId,
  SubjectId,
  TenantId,
} from '../../src/types/ids.js';
import type { Actor } from '../../src/types/tenant.js';

// ============ Fixtures ============

const SUBJECT_A = 'sub_alice' as SubjectId;
const SUBJECT_B = 'sub_bob' as SubjectId;
const REQ_GDPR_ART_13 = 'gdpr.art13.notice' as DisclosureRequirementId;
const REQ_FERPA_ANNUAL = 'ferpa-§99.7-annual-notification' as DisclosureRequirementId;
const HASH_FRESH = 'h_fresh_abc' as ContentHash;
const HASH_STALE = 'h_stale_xyz' as ContentHash;

const ACTOR_USER: Actor = { kind: 'human', id: 'ac_alice' as Actor['id'] };

function eventOf<TPayload>(
  overrides: Partial<Event<TPayload>> & {
    id: string;
    kind: Event['kind'];
    payload: TPayload;
    timestamp: Date;
  },
): Event<TPayload> {
  return {
    id: overrides.id as EventId,
    tenantId: 'tn_demo' as TenantId,
    intentId: 'i_demo' as IntentId,
    kind: overrides.kind,
    version: 1,
    timestamp: overrides.timestamp,
    actor: ACTOR_USER,
    lawfulBasis: 'consent',
    purpose: 'demo' as Event['purpose'],
    dataSubjectIds: [],
    prevHash: null,
    contentHash: 'h_envelope' as ContentHash,
    payload: overrides.payload,
  };
}

function deliveredFor(
  subject: SubjectId,
  requirementId: DisclosureRequirementId,
  contentHash: ContentHash,
  timestamp: Date,
  id: string,
): Event<DisclosureDeliveredPayload> {
  return eventOf<DisclosureDeliveredPayload>({
    id,
    kind: 'DisclosureDelivered',
    timestamp,
    payload: {
      disclosureId: `disc_${id}` as DisclosureId,
      subject,
      requirementId,
      contentHash,
      deliveryMethod: 'in-app',
      locale: 'en',
    },
  });
}

function signalFor(
  requirementId: DisclosureRequirementId,
  contentHash: ContentHash,
  signalType: DisclosureSignalPayload['signalType'],
  timestamp: Date,
  id: string,
  viewMs?: number,
): Event<DisclosureSignalPayload> {
  const payload: DisclosureSignalPayload =
    viewMs === undefined
      ? {
          disclosureId: `disc_${id}` as DisclosureId,
          requirementId,
          contentHash,
          signalType,
          observedAt: timestamp.toISOString() as DisclosureSignalPayload['observedAt'],
        }
      : {
          disclosureId: `disc_${id}` as DisclosureId,
          requirementId,
          contentHash,
          signalType,
          observedAt: timestamp.toISOString() as DisclosureSignalPayload['observedAt'],
          viewMs,
        };
  return eventOf<DisclosureSignalPayload>({
    id,
    kind: 'DisclosureSignal',
    timestamp,
    payload,
  });
}

// ============ Positive predicate cases ============

describe('disclosureHasOpportunityToBeRead — positive cases', () => {
  it('returns true when a delivered Disclosure + a matching read signal exist', () => {
    const events = [
      deliveredFor(SUBJECT_A, REQ_GDPR_ART_13, HASH_FRESH, new Date('2026-05-01T00:00:00Z'), 'd1'),
      signalFor(REQ_GDPR_ART_13, HASH_FRESH, 'read', new Date('2026-05-01T00:00:02Z'), 's1', 1800),
    ];
    expect(
      disclosureHasOpportunityToBeRead(events, SUBJECT_A, {
        requirementId: REQ_GDPR_ART_13,
        acceptedSignals: ['read'],
        requireHashMatch: true,
      }),
    ).toBe(true);
  });

  it('defaults to acceptedSignals: ["read"] and requireHashMatch: true when omitted', () => {
    const events = [
      deliveredFor(SUBJECT_A, REQ_GDPR_ART_13, HASH_FRESH, new Date('2026-05-01T00:00:00Z'), 'd1'),
      signalFor(REQ_GDPR_ART_13, HASH_FRESH, 'read', new Date('2026-05-01T00:00:02Z'), 's1'),
    ];
    expect(
      disclosureHasOpportunityToBeRead(events, SUBJECT_A, { requirementId: REQ_GDPR_ART_13 }),
    ).toBe(true);
  });

  it('accepts a click signal when acceptedSignals widens to include click', () => {
    const events = [
      deliveredFor(SUBJECT_A, REQ_GDPR_ART_13, HASH_FRESH, new Date('2026-05-01T00:00:00Z'), 'd1'),
      signalFor(REQ_GDPR_ART_13, HASH_FRESH, 'click', new Date('2026-05-01T00:00:02Z'), 's1'),
    ];
    expect(
      disclosureHasOpportunityToBeRead(events, SUBJECT_A, {
        requirementId: REQ_GDPR_ART_13,
        acceptedSignals: ['read', 'click'],
      }),
    ).toBe(true);
  });
});

// ============ Negative predicate cases ============

describe('disclosureHasOpportunityToBeRead — negative cases', () => {
  it('returns false when no delivered Disclosure exists for the subject', () => {
    const events = [
      signalFor(REQ_GDPR_ART_13, HASH_FRESH, 'read', new Date('2026-05-01T00:00:02Z'), 's1'),
    ];
    expect(
      disclosureHasOpportunityToBeRead(events, SUBJECT_A, { requirementId: REQ_GDPR_ART_13 }),
    ).toBe(false);
  });

  it('returns false when the delivered Disclosure is for a different subject', () => {
    const events = [
      deliveredFor(SUBJECT_B, REQ_GDPR_ART_13, HASH_FRESH, new Date('2026-05-01T00:00:00Z'), 'd1'),
      signalFor(REQ_GDPR_ART_13, HASH_FRESH, 'read', new Date('2026-05-01T00:00:02Z'), 's1'),
    ];
    expect(
      disclosureHasOpportunityToBeRead(events, SUBJECT_A, { requirementId: REQ_GDPR_ART_13 }),
    ).toBe(false);
  });

  it('returns false when no signal of an accepted type exists', () => {
    const events = [
      deliveredFor(SUBJECT_A, REQ_GDPR_ART_13, HASH_FRESH, new Date('2026-05-01T00:00:00Z'), 'd1'),
      signalFor(REQ_GDPR_ART_13, HASH_FRESH, 'click', new Date('2026-05-01T00:00:02Z'), 's1'),
    ];
    expect(
      disclosureHasOpportunityToBeRead(events, SUBJECT_A, {
        requirementId: REQ_GDPR_ART_13,
        acceptedSignals: ['read'],
      }),
    ).toBe(false);
  });

  it('returns false when requireHashMatch is true and signal hash is stale', () => {
    const events = [
      deliveredFor(SUBJECT_A, REQ_GDPR_ART_13, HASH_FRESH, new Date('2026-05-01T00:00:00Z'), 'd1'),
      signalFor(REQ_GDPR_ART_13, HASH_STALE, 'read', new Date('2026-05-01T00:00:02Z'), 's1'),
    ];
    expect(
      disclosureHasOpportunityToBeRead(events, SUBJECT_A, {
        requirementId: REQ_GDPR_ART_13,
        requireHashMatch: true,
      }),
    ).toBe(false);
  });

  it('returns true when requireHashMatch is false even on stale hash (controllers must inform auditors)', () => {
    const events = [
      deliveredFor(SUBJECT_A, REQ_GDPR_ART_13, HASH_FRESH, new Date('2026-05-01T00:00:00Z'), 'd1'),
      signalFor(REQ_GDPR_ART_13, HASH_STALE, 'read', new Date('2026-05-01T00:00:02Z'), 's1'),
    ];
    expect(
      disclosureHasOpportunityToBeRead(events, SUBJECT_A, {
        requirementId: REQ_GDPR_ART_13,
        requireHashMatch: false,
      }),
    ).toBe(true);
  });

  it('returns false when signal is for a different requirementId', () => {
    const events = [
      deliveredFor(SUBJECT_A, REQ_GDPR_ART_13, HASH_FRESH, new Date('2026-05-01T00:00:00Z'), 'd1'),
      signalFor(REQ_FERPA_ANNUAL, HASH_FRESH, 'read', new Date('2026-05-01T00:00:02Z'), 's1'),
    ];
    expect(
      disclosureHasOpportunityToBeRead(events, SUBJECT_A, { requirementId: REQ_GDPR_ART_13 }),
    ).toBe(false);
  });
});

// ============ SIGNAL-not-gate predicate-name lint ============

describe('lintDisclosureSignalPredicateName — SIGNAL-not-gate discipline', () => {
  it('accepts a predicate whose name contains "opportunity"', () => {
    expect(lintDisclosureSignalPredicateName('disclosureHasOpportunityToBeRead').ok).toBe(true);
  });

  it('accepts a predicate whose name contains "signal"', () => {
    expect(lintDisclosureSignalPredicateName('readSignalRecorded').ok).toBe(true);
  });

  for (const forbidden of SIGNAL_NOT_GATE_FORBIDDEN_TOKENS) {
    it(`rejects a predicate whose name contains forbidden token "${forbidden}"`, () => {
      const result = lintDisclosureSignalPredicateName(`disclosure${forbidden}ByScroll`);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('FORBIDDEN_TOKEN');
        expect(result.token).toBe(forbidden);
        expect(result.message).toContain('crawcus-contracts.md §6.A');
      }
    });
  }

  it('rejects a name missing required tokens (no opportunity / no signal)', () => {
    const result = lintDisclosureSignalPredicateName('disclosureWasShown');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('MISSING_REQUIRED_TOKEN');
      expect(result.message).toContain('crawcus-contracts.md §6.A');
    }
  });

  it('matches forbidden tokens case-insensitively', () => {
    expect(lintDisclosureSignalPredicateName('userACKNOWLEDGEDByScroll').ok).toBe(false);
  });

  it('exports stable lists of forbidden + required tokens', () => {
    expect(SIGNAL_NOT_GATE_FORBIDDEN_TOKENS).toContain('acknowledged');
    expect(SIGNAL_NOT_GATE_FORBIDDEN_TOKENS).toContain('consented');
    expect(SIGNAL_NOT_GATE_FORBIDDEN_TOKENS).toContain('agreed');
    expect(SIGNAL_NOT_GATE_FORBIDDEN_TOKENS).toContain('confirmed');
    expect(SIGNAL_NOT_GATE_REQUIRED_TOKENS).toContain('opportunity');
    expect(SIGNAL_NOT_GATE_REQUIRED_TOKENS).toContain('signal');
  });
});
