/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  solelyAutomatedDecision,
  contractNecessityException,
  explicitConsentException,
  humanInterventionSafeguards,
  specialCategoryProhibition,
} from '../src/art22.js';
import { evaluateContracts, defineCrawcusSpec, field } from '@crawcus/core';
import type { Event, Intent, OversightRequirement, Tenant } from '@crawcus/core';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const tenant: Tenant = {
  id: b<string, 'TenantId'>('tnt') as never,
  region: b<string, 'Region'>('eu-west-2') as never,
};

const makeIntent = (snapshot: Record<string, unknown>): Intent => ({
  id: b<string, 'IntentId'>('int_t') as never,
  tenantId: tenant.id,
  key: b<string, 'IntentKey'>('CreditDecision') as never,
  specVersion: 1,
  state: 'open',
  createdAt: new Date(),
  updatedAt: new Date(),
  snapshot,
});

const makeConsentEvent = (purpose: string): Event => ({
  id: b<string, 'EventId'>('evt_c') as never,
  tenantId: tenant.id,
  intentId: b<string, 'IntentId'>('int_t') as never,
  kind: 'ConsentGranted',
  version: 0,
  timestamp: new Date(),
  actor: { id: b<string, 'ActorId'>('act') as never, kind: 'human' },
  lawfulBasis: 'consent',
  purpose: b<string, 'Purpose'>(purpose) as never,
  dataSubjectIds: [],
  prevHash: null,
  contentHash: b<string, 'ContentHash'>('0'.repeat(64)) as never,
  payload: { purpose },
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
  purpose: b<string, 'Purpose'>('credit-decision') as never,
  dataSubjectIds: [],
  prevHash: null,
  contentHash: b<string, 'ContentHash'>('0'.repeat(64)) as never,
  payload: {},
});

// ============ Art. 22(1) — solelyAutomatedDecision ============

const solelySpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('CreditDecision') as never,
  projection: b<string, 'ProjectionName'>('CreditDecision') as never,
  version: 1,
  fields: {
    isSolelyAutomated: field.boolean().optional(),
    art22ExceptionClaimed: field.string().optional(),
  },
  readiness: () => true,
  contracts: {
    invariants: [
      solelyAutomatedDecision({
        solelyAutomatedField: 'isSolelyAutomated',
        exceptionField: 'art22ExceptionClaimed',
        permittedExceptions: [
          'contract-necessity',
          'union-or-member-state-law',
          'explicit-consent',
        ],
      }),
    ],
  },
});

describe('gdpr.art22.solelyAutomatedDecision', () => {
  it('passes when solely-automated flag is absent (Contract does not fire)', () => {
    const results = evaluateContracts({
      spec: solelySpec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when solely-automated AND a permitted exception is claimed', () => {
    const results = evaluateContracts({
      spec: solelySpec,
      intent: makeIntent({
        isSolelyAutomated: true,
        art22ExceptionClaimed: 'explicit-consent',
      }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when solely-automated AND human-oversight event present (Art. 22(3) bridge)', () => {
    const results = evaluateContracts({
      spec: solelySpec,
      intent: makeIntent({ isSolelyAutomated: true }),
      tenant,
      events: [makeSuggestionEvent('SuggestionAccepted')],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when solely-automated AND no exception AND no oversight event', () => {
    const results = evaluateContracts({
      spec: solelySpec,
      intent: makeIntent({ isSolelyAutomated: true }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
    if (results[0]?.result === 'fail') {
      expect(results[0].severity).toBe('block');
    }
  });

  it('fails when claimed exception is not in the permitted set', () => {
    const results = evaluateContracts({
      spec: solelySpec,
      intent: makeIntent({
        isSolelyAutomated: true,
        art22ExceptionClaimed: 'made-up-exception',
      }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('carries Art. 22(1) citation', () => {
    const c = solelyAutomatedDecision({
      solelyAutomatedField: 's',
      exceptionField: 'e',
      permittedExceptions: ['explicit-consent'],
    });
    expect(c.citation?.regulation).toBe('gdpr@2025-Q1');
    expect(c.citation?.article).toBe('Art. 22(1)');
  });
});

// ============ Art. 22(2)(a) — contractNecessityException ============

const contractNecessitySpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('CreditDecision') as never,
  projection: b<string, 'ProjectionName'>('CreditDecision') as never,
  version: 1,
  fields: {
    contractPurpose: field.string().optional(),
  },
  readiness: () => true,
  contracts: {
    invariants: [
      contractNecessityException({
        purposeField: 'contractPurpose',
        permittedContractPurposes: [
          'credit-application',
          'mortgage-pre-approval',
          'insurance-quote',
        ],
      }),
    ],
  },
});

describe('gdpr.art22.contractNecessityException', () => {
  it('passes when contract purpose is in the permitted set', () => {
    const results = evaluateContracts({
      spec: contractNecessitySpec,
      intent: makeIntent({ contractPurpose: 'credit-application' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when contract purpose is not in the permitted set', () => {
    const results = evaluateContracts({
      spec: contractNecessitySpec,
      intent: makeIntent({ contractPurpose: 'personal-curiosity' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('fails when contract purpose field is missing', () => {
    const results = evaluateContracts({
      spec: contractNecessitySpec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
    const r = results[0];
    expect(r?.result === 'fail' && r.contract.id).toBe('gdpr.art22.contractNecessityException');
  });

  it('carries Art. 22(2)(a) citation', () => {
    const c = contractNecessityException({
      purposeField: 'p',
      permittedContractPurposes: ['x'],
    });
    expect(c.citation?.regulation).toBe('gdpr@2025-Q1');
    expect(c.citation?.article).toBe('Art. 22(2)(a)');
  });
});

// ============ Art. 22(2)(c) — explicitConsentException ============

const explicitConsentSpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('CreditDecision') as never,
  projection: b<string, 'ProjectionName'>('CreditDecision') as never,
  version: 1,
  fields: {
    art22ConsentEventId: field.string().optional(),
  },
  readiness: () => true,
  contracts: {
    invariants: [
      explicitConsentException({
        consentField: 'art22ConsentEventId',
        consentPurpose: 'explicit-consent-art22-credit-decision',
      }),
    ],
  },
});

describe('gdpr.art22.explicitConsentException', () => {
  it('passes when consent event reference present in snapshot', () => {
    const results = evaluateContracts({
      spec: explicitConsentSpec,
      intent: makeIntent({ art22ConsentEventId: 'evt_consent' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when ConsentGranted event for purpose exists on the chain', () => {
    const results = evaluateContracts({
      spec: explicitConsentSpec,
      intent: makeIntent({}),
      tenant,
      events: [makeConsentEvent('explicit-consent-art22-credit-decision')],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when neither consent field nor matching consent event present', () => {
    const results = evaluateContracts({
      spec: explicitConsentSpec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('fails when consent event purpose does not match', () => {
    const results = evaluateContracts({
      spec: explicitConsentSpec,
      intent: makeIntent({}),
      tenant,
      events: [makeConsentEvent('some-other-purpose')],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('carries Art. 22(2)(c) citation', () => {
    const c = explicitConsentException({
      consentField: 'c',
      consentPurpose: 'x',
    });
    expect(c.citation?.regulation).toBe('gdpr@2025-Q1');
    expect(c.citation?.article).toBe('Art. 22(2)(c)');
  });
});

// ============ Art. 22(3) — humanInterventionSafeguards ============

const inLoopRequirement: OversightRequirement = {
  id: b<string, 'OversightRequirementId'>('art22-human-review') as never,
  regulation: {
    regulation: b<string, 'RegulationVersion'>('gdpr@2025-Q1') as never,
    article: 'Art. 22(3)',
  },
  acceptedRoles: ['individual', 'committee', 'compliance-officer'],
  mode: 'in-loop',
  maxGapDays: 1,
};

const retrospectiveRequirement: OversightRequirement = {
  id: b<string, 'OversightRequirementId'>('art22-after-the-fact') as never,
  regulation: {
    regulation: b<string, 'RegulationVersion'>('gdpr@2025-Q1') as never,
    article: 'Art. 22(3)',
  },
  acceptedRoles: ['individual'],
  mode: 'retrospective',
  maxGapDays: 30,
};

const safeguardsSpec = (reqs: readonly OversightRequirement[] | undefined) =>
  defineCrawcusSpec({
    key: b<string, 'IntentKey'>('CreditDecision') as never,
    projection: b<string, 'ProjectionName'>('CreditDecision') as never,
    version: 1,
    fields: { decision: field.string().required() },
    readiness: () => true,
    ...(reqs !== undefined ? { oversightRequirements: reqs } : {}),
    contracts: {
      pre: [humanInterventionSafeguards()],
    },
  });

describe('gdpr.art22.humanInterventionSafeguards', () => {
  it('passes when spec declares an in-loop oversight requirement', () => {
    const results = evaluateContracts({
      spec: safeguardsSpec([inLoopRequirement]),
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when spec declares only retrospective oversight (not Art. 22(3) conformant)', () => {
    const results = evaluateContracts({
      spec: safeguardsSpec([retrospectiveRequirement]),
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('fails when spec declares no oversight requirements at all', () => {
    const results = evaluateContracts({
      spec: safeguardsSpec(undefined),
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'pre',
    });
    expect(results[0]?.result).toBe('fail');
    const r = results[0];
    expect(r?.result === 'fail' && r.contract.id).toBe('gdpr.art22.humanInterventionSafeguards');
  });

  it('carries Art. 22(3) citation', () => {
    const c = humanInterventionSafeguards();
    expect(c.citation?.regulation).toBe('gdpr@2025-Q1');
    expect(c.citation?.article).toBe('Art. 22(3)');
  });
});

// ============ Art. 22(4) — specialCategoryProhibition ============

const specialCategorySpec = defineCrawcusSpec({
  key: b<string, 'IntentKey'>('HealthUnderwriting') as never,
  projection: b<string, 'ProjectionName'>('HealthUnderwriting') as never,
  version: 1,
  fields: {
    usesArt9Data: field.boolean().optional(),
    art9Exemption: field.string().optional(),
  },
  readiness: () => true,
  contracts: {
    invariants: [
      specialCategoryProhibition({
        processesSpecialCategoryField: 'usesArt9Data',
        art9ExemptionField: 'art9Exemption',
        permittedArt9Exemptions: ['art9-2-a', 'art9-2-g'],
      }),
    ],
  },
});

describe('gdpr.art22.specialCategoryProhibition', () => {
  it('passes when special-category flag is absent (Contract does not fire)', () => {
    const results = evaluateContracts({
      spec: specialCategorySpec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when special-category data is used AND a permitted Art. 9(2) exemption is claimed', () => {
    const results = evaluateContracts({
      spec: specialCategorySpec,
      intent: makeIntent({ usesArt9Data: true, art9Exemption: 'art9-2-a' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('fails when special-category data is used but exemption field is missing', () => {
    const results = evaluateContracts({
      spec: specialCategorySpec,
      intent: makeIntent({ usesArt9Data: true }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
    const r = results[0];
    expect(r?.result === 'fail' && r.contract.id).toBe('gdpr.art22.specialCategoryProhibition');
  });

  it('fails when claimed Art. 9(2) exemption is not in the permitted set', () => {
    const results = evaluateContracts({
      spec: specialCategorySpec,
      intent: makeIntent({ usesArt9Data: true, art9Exemption: 'art9-2-x' }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
  });

  it('carries Art. 22(4) citation', () => {
    const c = specialCategoryProhibition({
      processesSpecialCategoryField: 'p',
      art9ExemptionField: 'e',
      permittedArt9Exemptions: ['art9-2-a'],
    });
    expect(c.citation?.regulation).toBe('gdpr@2025-Q1');
    expect(c.citation?.article).toBe('Art. 22(4)');
  });
});
