/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { checkReadiness } from '../../src/readiness/check.js';
import { evaluateGraph } from '../../src/graph/evaluate.js';
import { defineCrawcusSpec } from '../../src/intent/define-crawcus-spec.js';
import { field } from '../../src/intent/field.js';
import type { Intent } from '../../src/types/intent.js';
import type { IntentId, IntentKey, ProjectionName, TenantId } from '../../src/types/ids.js';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const makeIntent = (snapshot: Record<string, unknown>): Intent => ({
  id: b<string, 'IntentId'>('int_r') as IntentId,
  tenantId: b<string, 'TenantId'>('tnt_r') as TenantId,
  key: b<string, 'IntentKey'>('K') as IntentKey,
  specVersion: 1,
  state: 'open',
  createdAt: new Date('2026-05-20T00:00:00Z'),
  updatedAt: new Date('2026-05-20T00:00:00Z'),
  snapshot,
});

const spec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('K') as IntentKey,
  projection: b<string, 'ProjectionName'>('P') as ProjectionName,
  version: 1,
  fields: {
    title: field.string().required(),
    subject: field.string().required(),
    optionalNote: field.string().optional(),
    learnerAge: field
      .number()
      .required()
      .dependsOn({ when: () => false }),
  },
  readiness: ({ has }: { has: (...k: string[]) => boolean }) => has('title', 'subject'),
});

describe('checkReadiness — Layer 3 atomic guard', () => {
  it('returns ready when readiness predicate satisfied', () => {
    const intent = makeIntent({ title: 'Course 1', subject: 'math' });
    const r = checkReadiness(intent, spec, []);
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('returns not-ready + lists missing required fields', () => {
    const intent = makeIntent({ title: 'Course 1' }); // missing subject
    const r = checkReadiness(intent, spec, []);
    expect(r.ready).toBe(false);
    expect(r.missing).toContain('subject');
  });

  it('does not report optional fields as missing', () => {
    const intent = makeIntent({ title: 'Course 1' });
    const r = checkReadiness(intent, spec, []);
    expect(r.missing).not.toContain('optionalNote');
  });
});

describe('evaluateGraph — bucket pass', () => {
  it('buckets satisfied / pending / blocked correctly', () => {
    const intent = makeIntent({ title: 'Course 1' });
    const g = evaluateGraph(intent, spec, []);
    expect(g.satisfied.has('title')).toBe(true);
    expect(g.pending.map((p) => p.key).sort()).toEqual(['subject']);
    expect(g.blocked.map((p) => p.key)).toEqual(['learnerAge']);
  });

  it('respects askWhen priority ordering', () => {
    const orderedSpec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('K') as IntentKey,
      projection: b<string, 'ProjectionName'>('P') as ProjectionName,
      version: 1,
      fields: {
        late: field.string().required().askWhen({ priority: 'late' }),
        early: field.string().required().askWhen({ priority: 'early' }),
        normal: field.string().required(),
      },
      readiness: () => true,
    });
    const intent = makeIntent({});
    const g = evaluateGraph(intent, orderedSpec, []);
    expect(g.pending.map((p) => p.key)).toEqual(['early', 'normal', 'late']);
  });
});
