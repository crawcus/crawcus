/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { defineCrawcusSpec } from '../../src/intent/define-crawcus-spec.js';
import { field } from '../../src/intent/field.js';
import type { IntentKey, ProjectionName } from '../../src/types/ids.js';

const intentKey = (s: string): IntentKey => s as IntentKey;
const projectionName = (s: string): ProjectionName => s as ProjectionName;

describe('defineCrawcusSpec', () => {
  it('returns the spec unchanged (identity function)', () => {
    const spec = defineCrawcusSpec({
      key: intentKey('CreateCourse'),
      projection: projectionName('Course'),
      version: 1,
      fields: {
        title: field.string().required(),
      },
      readiness: ({ has }: { has: (...k: string[]) => boolean }) => has('title'),
    });
    expect(spec.key).toBe('CreateCourse');
    expect(spec.projection).toBe('Course');
    expect(spec.version).toBe(1);
    expect(Object.keys(spec.fields)).toEqual(['title']);
    expect(typeof spec.readiness).toBe('function');
  });

  it('preserves optional fields when present', () => {
    const spec = defineCrawcusSpec({
      key: intentKey('HighRiskIntent'),
      projection: projectionName('SomeProj'),
      version: 2,
      classification: 'high-risk',
      i18nDefault: 'en' as never,
      tags: ['edu', 'minor'],
      fields: { x: field.string().required() },
      readiness: () => true,
    });
    expect(spec.classification).toBe('high-risk');
    expect(spec.i18nDefault).toBe('en');
    expect(spec.tags).toEqual(['edu', 'minor']);
  });

  it('accepts v0.2 contracts shape', () => {
    const spec = defineCrawcusSpec({
      key: intentKey('WithContracts'),
      projection: projectionName('Proj'),
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: {
        invariants: [
          {
            id: 'c1',
            description: { en: 'invariant 1' },
            predicate: () => true,
          },
        ],
      },
    });
    expect(spec.contracts?.invariants?.[0]?.id).toBe('c1');
  });
});
