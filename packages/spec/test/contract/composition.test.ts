import { describe, it, expect } from 'vitest';
import { validateComposition } from '../../src/contract/composition.js';
import { defineCrawcusSpec } from '../../src/intent/define-crawcus-spec.js';
import { field } from '../../src/intent/field.js';
import type { Contract } from '../../src/contract/types.js';
import type { IntentKey, ProjectionName, RegulationVersion } from '../../src/types/ids.js';

const intentKey = (s: string): IntentKey => s as IntentKey;
const projectionName = (s: string): ProjectionName => s as ProjectionName;
const reg = (s: string): RegulationVersion => s as RegulationVersion;

const c = (id: string, severity?: 'block' | 'warn'): Contract => ({
  id,
  description: { en: id },
  predicate: () => true,
  ...(severity ? { severity } : {}),
});

const baseSpec = (overrides: Parameters<typeof defineCrawcusSpec>[0]) =>
  defineCrawcusSpec({
    projection: projectionName('P'),
    version: 1,
    fields: { x: field.string().required() },
    readiness: () => true,
    ...overrides,
  });

describe('validateComposition — monotonicity (Q-P + Q-AA)', () => {
  it('passes when child adds new contracts to parent (additive)', () => {
    const parent = baseSpec({
      key: intentKey('Parent'),
      contracts: { invariants: [c('p1')] },
    });
    const child = baseSpec({
      key: intentKey('Child'),
      contracts: { invariants: [c('p1'), c('c1')] },
    });
    expect(validateComposition(parent, child)).toEqual([]);
  });

  it('fails when child removes parent contract without derogation', () => {
    const parent = baseSpec({
      key: intentKey('Parent'),
      contracts: { invariants: [c('p1'), c('p2')] },
    });
    const child = baseSpec({
      key: intentKey('Child'),
      contracts: { invariants: [c('p1')] }, // p2 missing
    });
    const violations = validateComposition(parent, child);
    expect(violations.length).toBe(1);
    expect(violations[0]?.code).toBe('contract-removed');
    expect(violations[0]?.contractId).toBe('p2');
  });

  it('passes when child lowers severity-block parent contract via explicit derogation', () => {
    const parent = baseSpec({
      key: intentKey('Parent'),
      contracts: { invariants: [c('p1', 'block')] },
    });
    const child = baseSpec({
      key: intentKey('Child'),
      contracts: { invariants: [] }, // p1 removed
      derogations: [
        {
          contractId: 'p1',
          basis: {
            regulation: reg('gdpr@2025-Q1'),
            article: 'Art. 89',
            paragraph: '§(1)',
          },
          justification: 'IRB-waived research protocol; subjects de-identified.',
        },
      ],
    });
    expect(validateComposition(parent, child)).toEqual([]);
  });

  it('fails when child silently lowers severity (block -> warn) without derogation', () => {
    const parent = baseSpec({
      key: intentKey('Parent'),
      contracts: { invariants: [c('p1', 'block')] },
    });
    const child = baseSpec({
      key: intentKey('Child'),
      contracts: { invariants: [c('p1', 'warn')] },
    });
    const violations = validateComposition(parent, child);
    expect(violations.some((v) => v.code === 'severity-lowered')).toBe(true);
  });

  it('passes when child elevates severity (warn -> block)', () => {
    const parent = baseSpec({
      key: intentKey('Parent'),
      contracts: { invariants: [c('p1', 'warn')] },
    });
    const child = baseSpec({
      key: intentKey('Child'),
      contracts: { invariants: [c('p1', 'block')] },
    });
    expect(validateComposition(parent, child)).toEqual([]);
  });
});

describe('validateComposition — derogation completeness', () => {
  it('fails when derogation references nonexistent parent contract', () => {
    const parent = baseSpec({
      key: intentKey('Parent'),
      contracts: { invariants: [c('p1')] },
    });
    const child = baseSpec({
      key: intentKey('Child'),
      contracts: { invariants: [c('p1')] },
      derogations: [
        {
          contractId: 'nonexistent',
          basis: { regulation: reg('gdpr@2025-Q1'), article: 'Art. 89' },
          justification: 'reason',
        },
      ],
    });
    const violations = validateComposition(parent, child);
    expect(violations.some((v) => v.code === 'derogation-references-nonexistent-contract')).toBe(
      true,
    );
  });

  it('fails when derogation lacks justification', () => {
    const parent = baseSpec({
      key: intentKey('Parent'),
      contracts: { invariants: [c('p1')] },
    });
    const child = baseSpec({
      key: intentKey('Child'),
      contracts: { invariants: [] },
      derogations: [
        {
          contractId: 'p1',
          basis: { regulation: reg('gdpr@2025-Q1'), article: 'Art. 89' },
          justification: '   ', // whitespace
        },
      ],
    });
    const violations = validateComposition(parent, child);
    expect(violations.some((v) => v.code === 'derogation-without-justification')).toBe(true);
  });

  it('fails when derogation basis is incomplete (no article)', () => {
    const parent = baseSpec({
      key: intentKey('Parent'),
      contracts: { invariants: [c('p1')] },
    });
    const child = baseSpec({
      key: intentKey('Child'),
      contracts: { invariants: [] },
      derogations: [
        {
          contractId: 'p1',
          basis: { regulation: reg('gdpr@2025-Q1'), article: '' },
          justification: 'reason',
        },
      ],
    });
    const violations = validateComposition(parent, child);
    expect(violations.some((v) => v.code === 'derogation-without-basis')).toBe(true);
  });
});
