/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { minorConsent } from '../src/art8.js';
import { evaluateContracts } from '@crawcus/core';
import { defineCrawcusSpec } from '@crawcus/core';
import { field } from '@crawcus/core';
import type { Intent } from '@crawcus/core';
import type { Tenant } from '@crawcus/core';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const tenant: Tenant = {
  id: b<string, 'TenantId'>('tnt') as never,
  region: b<string, 'Region'>('eu-west-2') as never,
};

const makeIntent = (snapshot: Record<string, unknown>): Intent => ({
  id: b<string, 'IntentId'>('int_t') as never,
  tenantId: tenant.id,
  key: b<string, 'IntentKey'>('CreateCourse') as never,
  specVersion: 1,
  state: 'open',
  createdAt: new Date(),
  updatedAt: new Date(),
  snapshot,
});

const spec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('CreateCourse') as never,
  projection: b<string, 'ProjectionName'>('Course') as never,
  version: 1,
  fields: {
    learnerAge: field.number().optional(),
    parentalConsentEventId: field.string().optional(),
  },
  readiness: () => true,
  contracts: {
    invariants: [
      minorConsent({
        ageField: 'learnerAge',
        consentField: 'parentalConsentEventId',
        minorAge: 16,
      }),
    ],
  },
});

describe('gdpr.art8.minorConsent', () => {
  it('passes when age is unknown (defer to data-quality)', () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when learner is at or above minorAge', () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ learnerAge: 16 }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when learner is under minorAge AND parental consent present', () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ learnerAge: 12, parentalConsentEventId: 'evt_consent' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when learner is under minorAge AND parental consent missing', () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ learnerAge: 12 }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
    if (results[0]?.result === 'fail') {
      expect(results[0].severity).toBe('block');
    }
  });

  it('respects custom minorAge (UK = 13)', () => {
    const ukSpec = defineCrawcusSpec({
      ...spec,
      contracts: {
        invariants: [
          minorConsent({
            ageField: 'learnerAge',
            consentField: 'parentalConsentEventId',
            minorAge: 13,
          }),
        ],
      },
    });
    // 14-year-old in UK: passes without parental consent
    const results = evaluateContracts({
      spec: ukSpec,
      intent: makeIntent({ learnerAge: 14 }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('carries the gdpr citation', () => {
    const c = minorConsent({
      ageField: 'age',
      consentField: 'consent',
    });
    expect(c.citation?.regulation).toBe('gdpr@2025-Q1');
    expect(c.citation?.article).toBe('Art. 8');
  });
});
