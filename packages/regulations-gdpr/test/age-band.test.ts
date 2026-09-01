import { describe, it, expect } from 'vitest';
import {
  ageBand,
  ageBandField,
  AGE_BAND_VALUES,
  isMinorBand,
  type AgeBandValue,
} from '../src/age-band.js';
import { defineCrawcusSpec, evaluateContracts, field } from '@crawcus/core';
import type { Intent, Tenant } from '@crawcus/core';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const tenant: Tenant = {
  id: b<string, 'TenantId'>('tnt') as never,
  region: b<string, 'Region'>('eu-west-2') as never,
};

const makeIntent = (snapshot: Record<string, unknown>): Intent => ({
  id: b<string, 'IntentId'>('int_t') as never,
  tenantId: tenant.id,
  key: b<string, 'IntentKey'>('EnrolLearner') as never,
  specVersion: 1,
  state: 'open',
  createdAt: new Date(),
  updatedAt: new Date(),
  snapshot,
});

// ============ Enum + helpers ============

describe('AgeBandValue + AGE_BAND_VALUES + isMinorBand', () => {
  it('exposes all eight canonical bands', () => {
    expect(AGE_BAND_VALUES).toHaveLength(8);
    expect(AGE_BAND_VALUES).toEqual([
      'under-18',
      '18-24',
      '25-34',
      '35-44',
      '45-54',
      '55-64',
      '65-plus',
      'prefer-not-to-say',
    ]);
  });

  it('freezes the band tuple (no accidental mutation)', () => {
    expect(Object.isFrozen(AGE_BAND_VALUES)).toBe(true);
  });

  it('classifies under-18 as minor band', () => {
    expect(isMinorBand('under-18')).toBe(true);
  });

  it('classifies non-under-18 bands as non-minor', () => {
    const nonMinor: AgeBandValue[] = [
      '18-24',
      '25-34',
      '35-44',
      '45-54',
      '55-64',
      '65-plus',
      'prefer-not-to-say',
    ];
    for (const band of nonMinor) {
      expect(isMinorBand(band)).toBe(false);
    }
  });
});

describe('ageBandField()', () => {
  it('returns a FieldBuilder pinned to the AgeBandValue enum', () => {
    const builder = ageBandField();
    expect(builder.__field).toBe(true);
    expect(builder.base).toBe('enum');
    expect(builder.metadata.options).toEqual(AGE_BAND_VALUES);
  });

  it('chains via .required() like any other field builder', () => {
    const builder = ageBandField().required();
    expect(builder.metadata.required).toBe(true);
  });
});

// ============ Mode 1: adultOnly ============

describe('ageBand.adultOnly', () => {
  const spec = defineCrawcusSpec({
    key: b<string, 'IntentKey'>('EnrolAdult') as never,
    projection: b<string, 'ProjectionName'>('Enrolment') as never,
    version: 1,
    fields: {
      ageBand: ageBandField().required(),
    },
    readiness: () => true,
    contracts: {
      invariants: [...ageBand.adultOnly({ ageBandField: 'ageBand' })],
    },
  });

  it('passes when band is unknown (defer to data-quality)', () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when band is 18-24 (adult)', () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ ageBand: '18-24' satisfies AgeBandValue }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it("passes when band is 'prefer-not-to-say' (allowed by default — assume adult)", () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ ageBand: 'prefer-not-to-say' satisfies AgeBandValue }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it("fails with severity 'block' when band is 'under-18'", () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ ageBand: 'under-18' satisfies AgeBandValue }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
    if (results[0]?.result === 'fail') {
      expect(results[0].severity).toBe('block');
    }
  });

  it('carries the gdpr Art-8 citation', () => {
    const [contract] = ageBand.adultOnly({ ageBandField: 'ageBand' });
    expect(contract?.id).toBe('gdpr.ageBand.adultOnly');
    expect(contract?.citation?.regulation).toBe('gdpr@2025-Q1');
    expect(contract?.citation?.article).toBe('Art. 8');
  });

  it("emits a 'block' severity Contract (drives ContractViolation event on rejection)", () => {
    // The runtime translates result:'fail' + severity:'block' into a
    // ContractViolation event + ContractViolationError throw. The
    // factory's responsibility is to set severity:'block'.
    const [contract] = ageBand.adultOnly({ ageBandField: 'ageBand' });
    expect(contract?.severity).toBe('block');
  });
});

// ============ Mode 2: minorAware ============

describe('ageBand.minorAware', () => {
  const spec = defineCrawcusSpec({
    key: b<string, 'IntentKey'>('EnrolLearner') as never,
    projection: b<string, 'ProjectionName'>('Enrolment') as never,
    version: 1,
    fields: {
      ageBand: ageBandField().required(),
      parentalConsentEventId: field.string().optional(),
    },
    readiness: () => true,
    contracts: {
      invariants: [
        ...ageBand.minorAware({
          ageBandField: 'ageBand',
          consentField: 'parentalConsentEventId',
        }),
      ],
    },
  });

  it('passes when band is unknown (defer to data-quality)', () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({}),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('passes when band is 25-34 (adult — no consent needed)', () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ ageBand: '25-34' satisfies AgeBandValue }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it("passes when band is 'prefer-not-to-say' (treated as adult — fall through)", () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ ageBand: 'prefer-not-to-say' satisfies AgeBandValue }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it("passes when band is 'under-18' AND parental consent reference is present", () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({
        ageBand: 'under-18' satisfies AgeBandValue,
        parentalConsentEventId: 'evt_consent',
      }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it("fails when band is 'under-18' AND parental consent is missing", () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ ageBand: 'under-18' satisfies AgeBandValue }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('fail');
    if (results[0]?.result === 'fail') {
      expect(results[0].severity).toBe('block');
    }
  });

  it('wires the citation to the same Art-8 jurisprudence as minorConsent (DRY)', () => {
    const [contract] = ageBand.minorAware({
      ageBandField: 'ageBand',
      consentField: 'parentalConsentEventId',
    });
    expect(contract?.citation?.regulation).toBe('gdpr@2025-Q1');
    expect(contract?.citation?.article).toBe('Art. 8');
    expect(contract?.citation?.url).toBe('https://gdpr-info.eu/art-8-gdpr/');
  });

  it('emits a block-severity Contract', () => {
    const [contract] = ageBand.minorAware({
      ageBandField: 'ageBand',
      consentField: 'parentalConsentEventId',
    });
    expect(contract?.severity).toBe('block');
  });
});

// ============ Mode 3: passthrough ============

describe('ageBand.passthrough', () => {
  const spec = defineCrawcusSpec({
    key: b<string, 'IntentKey'>('EnrolAnalytics') as never,
    projection: b<string, 'ProjectionName'>('Enrolment') as never,
    version: 1,
    fields: {
      ageBand: ageBandField().required(),
    },
    readiness: () => true,
    contracts: {
      invariants: [...ageBand.passthrough({ ageBandField: 'ageBand' })],
    },
  });

  it("passes 'under-18' without policy", () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ ageBand: 'under-18' satisfies AgeBandValue }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it("passes '35-44' without policy", () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ ageBand: '35-44' satisfies AgeBandValue }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it("passes 'prefer-not-to-say' without policy", () => {
    const results = evaluateContracts({
      spec,
      intent: makeIntent({ ageBand: 'prefer-not-to-say' satisfies AgeBandValue }),
      tenant,
      events: [],
      checkpoint: 'invariants',
    });
    expect(results[0]?.result).toBe('pass');
  });

  it('is a warn-severity Contract (pure data capture)', () => {
    const [contract] = ageBand.passthrough({ ageBandField: 'ageBand' });
    expect(contract?.severity).toBe('warn');
  });
});
