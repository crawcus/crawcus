/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { evaluateContracts, hasBlockingFailure } from '../../src/contract/evaluate.js';
import { defineCrawcusSpec } from '../../src/intent/define-crawcus-spec.js';
import { field } from '../../src/intent/field.js';
import type { Event } from '../../src/types/event.js';
import type { Intent } from '../../src/types/intent.js';
import type { Tenant } from '../../src/types/tenant.js';
import type {
  ActorId,
  ContentHash,
  EventId,
  IntentId,
  IntentKey,
  ProjectionName,
  Purpose,
  Region,
  TenantId,
} from '../../src/types/ids.js';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const tenant: Tenant = {
  id: b<string, 'TenantId'>('tnt_t') as TenantId,
  region: b<string, 'Region'>('local') as Region,
};

const makeIntent = (snapshot: Record<string, unknown>): Intent => ({
  id: b<string, 'IntentId'>('int_t') as IntentId,
  tenantId: tenant.id,
  key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
  specVersion: 1,
  state: 'open',
  createdAt: new Date('2026-05-20T00:00:00Z'),
  updatedAt: new Date('2026-05-20T00:00:00Z'),
  snapshot,
});

const makeEvent = (kind: Event['kind'], payload: Record<string, unknown>): Event => ({
  id: b<string, 'EventId'>('evt_t') as EventId,
  tenantId: tenant.id,
  intentId: b<string, 'IntentId'>('int_t') as IntentId,
  kind,
  version: 0,
  timestamp: new Date('2026-05-20T00:00:00Z'),
  actor: { id: b<string, 'ActorId'>('act_t') as ActorId, kind: 'system' },
  lawfulBasis: 'contract',
  purpose: b<string, 'Purpose'>('test') as Purpose,
  dataSubjectIds: [],
  prevHash: null,
  contentHash: b<string, 'ContentHash'>('0'.repeat(64)) as ContentHash,
  payload,
});

describe('evaluateContracts — basic pass/fail', () => {
  it('returns empty array when slot has no contracts', () => {
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
    });
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results).toEqual([]);
  });

  it('passes contract that returns true', () => {
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: {
        invariants: [{ id: 'c1', description: { en: 'c1' }, predicate: () => true }],
      },
    });
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.result).toBe('pass');
  });

  it('fails contract that returns false; carries severity', () => {
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: {
        invariants: [
          { id: 'block-fail', description: { en: 'x' }, predicate: () => false, severity: 'block' },
          { id: 'warn-fail', description: { en: 'y' }, predicate: () => false, severity: 'warn' },
        ],
      },
    });
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results).toHaveLength(2);
    const blockFail = results[0];
    const warnFail = results[1];
    expect(blockFail?.result).toBe('fail');
    if (blockFail?.result === 'fail') expect(blockFail.severity).toBe('block');
    expect(warnFail?.result).toBe('fail');
    if (warnFail?.result === 'fail') expect(warnFail.severity).toBe('warn');
  });

  it('predicate that throws is treated as fail', () => {
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: {
        invariants: [
          {
            id: 'throws',
            description: { en: 't' },
            predicate: () => {
              throw new Error('boom');
            },
          },
        ],
      },
    });
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });
});

describe('evaluateContracts — declaration order (Q-T)', () => {
  it('evaluates contracts in declaration order', () => {
    const order: string[] = [];
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: {
        invariants: [
          {
            id: 'one',
            description: { en: '' },
            predicate: () => {
              order.push('one');
              return true;
            },
          },
          {
            id: 'two',
            description: { en: '' },
            predicate: () => {
              order.push('two');
              return true;
            },
          },
          {
            id: 'three',
            description: { en: '' },
            predicate: () => {
              order.push('three');
              return true;
            },
          },
        ],
      },
    });
    evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(order).toEqual(['one', 'two', 'three']);
  });
});

describe('evaluateContracts — context materialisation', () => {
  it('predicate can read snapshot via value()/has()', () => {
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { title: field.string().required() },
      readiness: () => true,
      contracts: {
        invariants: [
          {
            id: 'has-title',
            description: { en: 'has title' },
            predicate: ({ has }) => has('title'),
          },
        ],
      },
    });
    const ready = evaluateContracts({
      spec,
      intent: makeIntent({ title: 'Course 1' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(ready[0]?.result).toBe('pass');

    const notReady = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(notReady[0]?.result).toBe('fail');
  });

  it('consentFor returns true after ConsentGranted, false after ConsentRevoked', () => {
    const spec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: {
        invariants: [
          {
            id: 'consent-check',
            description: { en: 'c' },
            predicate: ({ consentFor }) =>
              consentFor(b<string, 'Purpose'>('course-setup') as Purpose),
          },
        ],
      },
    });

    const noConsent = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(noConsent[0]?.result).toBe('fail');

    const withConsent = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [makeEvent('ConsentGranted', { purpose: 'course-setup' })],
      checkpoint: 'invariants',
    });
    expect(withConsent[0]?.result).toBe('pass');

    const revoked = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [
        makeEvent('ConsentGranted', { purpose: 'course-setup' }),
        makeEvent('ConsentRevoked', { purpose: 'course-setup' }),
      ],
      checkpoint: 'invariants',
    });
    expect(revoked[0]?.result).toBe('fail');
  });
});

describe('hasBlockingFailure', () => {
  it('returns true when at least one block-severity fail exists', () => {
    const results = [
      { result: 'pass' as const, contract: { id: 'a' } as never, ctx: {} as never },
      {
        result: 'fail' as const,
        contract: { id: 'b' } as never,
        ctx: {} as never,
        severity: 'block' as const,
      },
    ];
    expect(hasBlockingFailure(results)).toBe(true);
  });

  it('returns false when only warn-severity fails exist', () => {
    const results = [
      {
        result: 'fail' as const,
        contract: { id: 'b' } as never,
        ctx: {} as never,
        severity: 'warn' as const,
      },
    ];
    expect(hasBlockingFailure(results)).toBe(false);
  });

  it('returns false when all pass', () => {
    const results = [{ result: 'pass' as const, contract: { id: 'a' } as never, ctx: {} as never }];
    expect(hasBlockingFailure(results)).toBe(false);
  });
});
