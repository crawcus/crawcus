import { describe, it, expect } from 'vitest';
import { humanOversight } from '../src/art14.js';
import { evaluateContracts, defineCrawcusSpec, field } from '@crawcus/core';
import type { Event, Intent, Tenant } from '@crawcus/core';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const tenant: Tenant = {
  id: b<string, 'TenantId'>('tnt') as never,
  region: b<string, 'Region'>('eu-west-2') as never,
};

const makeIntent = (): Intent => ({
  id: b<string, 'IntentId'>('int_t') as never,
  tenantId: tenant.id,
  key: b<string, 'IntentKey'>('HiringScreen') as never,
  specVersion: 1,
  state: 'open',
  createdAt: new Date(),
  updatedAt: new Date(),
  snapshot: {},
});

const makeSuggestionEvent = (
  kind: 'SuggestionAccepted' | 'SuggestionEdited' | 'SuggestionRejected',
): Event => ({
  id: b<string, 'EventId'>('evt_s') as never,
  tenantId: tenant.id,
  intentId: b<string, 'IntentId'>('int_t') as never,
  kind,
  version: 0,
  timestamp: new Date(),
  actor: { id: b<string, 'ActorId'>('act') as never, kind: 'human' },
  lawfulBasis: 'contract',
  purpose: b<string, 'Purpose'>('screening') as never,
  dataSubjectIds: [],
  prevHash: null,
  contentHash: b<string, 'ContentHash'>('0'.repeat(64)) as never,
  payload: {},
});

const highRiskSpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('HiringScreen') as never,
  projection: b<string, 'ProjectionName'>('Candidate') as never,
  version: 1,
  classification: 'high-risk',
  fields: { decision: field.string().required() },
  readiness: () => true,
  contracts: { post: [humanOversight()] },
});

const standardSpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('Memo') as never,
  projection: b<string, 'ProjectionName'>('Memo') as never,
  version: 1,
  classification: 'standard',
  fields: { body: field.string().required() },
  readiness: () => true,
  contracts: { post: [humanOversight()] },
});

describe('eu-ai-act.art14.humanOversight', () => {
  it('passes for standard classification (Art. 14 not applicable)', () => {
    const results = evaluateContracts({
      spec: standardSpec,
      intent: makeIntent(),
      tenant,
      events: [],
      checkpoint: 'post',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails for high-risk when no Suggestion lifecycle event present', () => {
    const results = evaluateContracts({
      spec: highRiskSpec,
      intent: makeIntent(),
      tenant,
      events: [],
      checkpoint: 'post',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('passes for high-risk when SuggestionAccepted event present', () => {
    const results = evaluateContracts({
      spec: highRiskSpec,
      intent: makeIntent(),
      tenant,
      events: [makeSuggestionEvent('SuggestionAccepted')],
      checkpoint: 'post',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when human rejected (also human oversight)', () => {
    const results = evaluateContracts({
      spec: highRiskSpec,
      intent: makeIntent(),
      tenant,
      events: [makeSuggestionEvent('SuggestionRejected')],
      checkpoint: 'post',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when human edited (also human oversight)', () => {
    const results = evaluateContracts({
      spec: highRiskSpec,
      intent: makeIntent(),
      tenant,
      events: [makeSuggestionEvent('SuggestionEdited')],
      checkpoint: 'post',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('carries eu-ai-act citation', () => {
    const c = humanOversight();
    expect(c.citation?.regulation).toBe('eu-ai-act@2026-Q2');
    expect(c.citation?.article).toBe('Art. 14');
  });
});
