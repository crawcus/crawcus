import { describe, it, expect } from 'vitest';
import { validateManifest } from '../../src/compliance/validate.js';
import { defineCompliance } from '../../src/compliance/define-compliance.js';
import { defineCrawcusSpec } from '../../src/intent/define-crawcus-spec.js';
import { field } from '../../src/intent/field.js';
import type { ComplianceManifest } from '../../src/types/compliance.js';
import type {
  IntentKey,
  ISO8601Duration,
  ProjectionName,
  RegulationVersion,
  Purpose,
} from '../../src/types/ids.js';

const intentKey = (s: string): IntentKey => s as IntentKey;
const projectionName = (s: string): ProjectionName => s as ProjectionName;
const reg = (s: string): RegulationVersion => s as RegulationVersion;
const dur = (s: string): ISO8601Duration => s as ISO8601Duration;
const pur = (s: string): Purpose => s as Purpose;

function makeManifest(overrides: Partial<ComplianceManifest> = {}): ComplianceManifest {
  return defineCompliance({
    regulations: [reg('gdpr@2025-Q1')],
    fields: {
      'Course.title': { pii: 'none' },
      'Course.learnerAge': { pii: 'personal', retention: dur('P7Y') },
      'Course.medicalNotes': {
        pii: 'special-art-9',
        retention: dur('P6Y'),
        requireBAA: true,
      },
    },
    retention: {
      default: dur('P7Y'),
      events: dur('P10Y'),
      pii: { personal: dur('P7Y'), sensitive: dur('P3Y'), special: dur('P1Y') },
    },
    residency: {
      region: 'eu-west-2' as never,
      eventStore: 'eu-west-2' as never,
      piiVault: 'eu-west-2' as never,
      aiProvider: { provider: 'anthropic', endpoint: 'eu-west-1' },
      crossBorderTransfers: 'forbid',
    },
    ai: {
      allowedModels: ['claude-sonnet-4-6'],
      promptTemplateVersion: 'v1',
      costCeilingPerIntent: { currency: 'usd', amount: 0.5 },
    },
    lawfulBasis: {
      default: 'contract',
      perPurpose: { 'course-setup': 'contract' },
    },
    ...overrides,
  });
}

describe('validateManifest — happy path', () => {
  it('passes a well-formed (manifest, spec) pair', () => {
    const manifest = makeManifest();
    const spec = defineCrawcusSpec({
      key: intentKey('CreateCourse'),
      projection: projectionName('Course'),
      version: 1,
      fields: {
        title: field.string().required(),
        learnerAge: field.number().optional(),
      },
      readiness: ({ has }: { has: (...k: string[]) => boolean }) => has('title'),
    });
    const result = validateManifest(manifest, [spec]);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('validateManifest — failure modes', () => {
  it('field-missing-in-manifest fires when spec references undeclared field', () => {
    const manifest = makeManifest();
    const spec = defineCrawcusSpec({
      key: intentKey('CreateCourse'),
      projection: projectionName('Course'),
      version: 1,
      fields: {
        nonExistent: field.string().required(),
      },
      readiness: () => true,
    });
    const result = validateManifest(manifest, [spec]);
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.code === 'field-missing-in-manifest');
    expect(err).toBeDefined();
    // Strong assertion: message text + location object content
    expect(err!.message).toMatch(/Course\.nonExistent/);
    expect(err!.message).toMatch(/CreateCourse/);
    expect(err!.message).toMatch(/missing from compliance manifest/);
    expect(err!.location).toEqual({ intentKey: 'CreateCourse', fieldKey: 'nonExistent' });
  });

  it('special-category-without-consent-gate fires when special-art-9 field has no dependsOn', () => {
    const manifest = makeManifest();
    const spec = defineCrawcusSpec({
      key: intentKey('CreateCourse'),
      projection: projectionName('Course'),
      version: 1,
      fields: {
        title: field.string().required(),
        medicalNotes: field.string().required(), // special-art-9 in manifest but no dependsOn
      },
      readiness: () => true,
    });
    const result = validateManifest(manifest, [spec]);
    const err = result.errors.find((e) => e.code === 'special-category-without-consent-gate');
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/Course\.medicalNotes/);
    expect(err!.message).toMatch(/special-art-9/);
    expect(err!.message).toMatch(/does not gate it on a consent event via dependsOn/);
    expect(err!.location).toEqual({ intentKey: 'CreateCourse', fieldKey: 'medicalNotes' });
  });

  it('special-category passes when gated via dependsOn', () => {
    const manifest = makeManifest();
    const spec = defineCrawcusSpec({
      key: intentKey('CreateCourse'),
      projection: projectionName('Course'),
      version: 1,
      fields: {
        title: field.string().required(),
        medicalNotes: field
          .string()
          .required()
          .dependsOn({ when: () => true }),
      },
      readiness: () => true,
    });
    const result = validateManifest(manifest, [spec]);
    expect(result.errors.some((e) => e.code === 'special-category-without-consent-gate')).toBe(
      false,
    );
  });

  it('pii-field-with-disallowed-purpose fires when purpose is in forbiddenFor', () => {
    const manifest = makeManifest({
      fields: {
        'Course.title': { pii: 'none' },
        'Course.learnerAge': {
          pii: 'personal',
          forbiddenFor: [pur('ai-summarisation')],
        },
      },
    });
    const spec = defineCrawcusSpec({
      key: intentKey('Summarise'),
      projection: projectionName('Course'),
      version: 1,
      fields: { learnerAge: field.number().required() },
      readiness: () => true,
    });
    const result = validateManifest(manifest, [spec], {
      intentPurposes: { Summarise: 'ai-summarisation' },
    });
    const err = result.errors.find((e) => e.code === 'pii-field-with-disallowed-purpose');
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/Course\.learnerAge/);
    expect(err!.message).toMatch(/forbidden for purpose 'ai-summarisation'/);
    expect(err!.message).toMatch(/Summarise/);
    expect(err!.location).toEqual({ intentKey: 'Summarise', fieldKey: 'learnerAge' });
  });

  it('does NOT fire pii-field-with-disallowed-purpose when intentPurposes is unset (purpose check skipped)', () => {
    const manifest = makeManifest({
      fields: {
        'Course.learnerAge': {
          pii: 'personal',
          forbiddenFor: [pur('ai-summarisation')],
        },
      },
    });
    const spec = defineCrawcusSpec({
      key: intentKey('Summarise'),
      projection: projectionName('Course'),
      version: 1,
      fields: { learnerAge: field.number().required() },
      readiness: () => true,
    });
    // No intentPurposes opt → the purpose && fc.forbiddenFor short-circuit
    // fails on `purpose` being undefined; no error fires.
    const result = validateManifest(manifest, [spec]);
    expect(result.errors.some((e) => e.code === 'pii-field-with-disallowed-purpose')).toBe(false);
  });

  it('does NOT fire pii-field-with-disallowed-purpose when forbiddenFor is empty', () => {
    const manifest = makeManifest({
      fields: {
        'Course.learnerAge': { pii: 'personal', forbiddenFor: [] },
      },
    });
    const spec = defineCrawcusSpec({
      key: intentKey('Summarise'),
      projection: projectionName('Course'),
      version: 1,
      fields: { learnerAge: field.number().required() },
      readiness: () => true,
    });
    const result = validateManifest(manifest, [spec], {
      intentPurposes: { Summarise: 'ai-summarisation' },
    });
    expect(result.errors.some((e) => e.code === 'pii-field-with-disallowed-purpose')).toBe(false);
  });

  it('does NOT fire pii-field-with-disallowed-purpose when forbiddenFor is undefined', () => {
    const manifest = makeManifest({
      fields: {
        'Course.learnerAge': { pii: 'personal' },
      },
    });
    const spec = defineCrawcusSpec({
      key: intentKey('Summarise'),
      projection: projectionName('Course'),
      version: 1,
      fields: { learnerAge: field.number().required() },
      readiness: () => true,
    });
    const result = validateManifest(manifest, [spec], {
      intentPurposes: { Summarise: 'ai-summarisation' },
    });
    expect(result.errors.some((e) => e.code === 'pii-field-with-disallowed-purpose')).toBe(false);
  });

  it('duplicate-intent-key fires when same key appears twice', () => {
    const manifest = makeManifest();
    const spec1 = defineCrawcusSpec({
      key: intentKey('Same'),
      projection: projectionName('Course'),
      version: 1,
      fields: { title: field.string().required() },
      readiness: () => true,
    });
    const spec2 = defineCrawcusSpec({
      key: intentKey('Same'),
      projection: projectionName('Course'),
      version: 2,
      fields: { title: field.string().required() },
      readiness: () => true,
    });
    const result = validateManifest(manifest, [spec1, spec2]);
    const err = result.errors.find((e) => e.code === 'duplicate-intent-key');
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/'Same' is declared more than once/);
    expect(err!.location).toEqual({ intentKey: 'Same' });
  });

  it('predicate-size-limit-exceeded fires for >4KB predicates', () => {
    const manifest = makeManifest();
    const hugePredicate = new Function(
      'ctx',
      `return ${JSON.stringify('x'.repeat(5000))} === 'y';`,
    ) as () => boolean;
    const spec = defineCrawcusSpec({
      key: intentKey('Big'),
      projection: projectionName('Course'),
      version: 1,
      fields: { title: field.string().required() },
      readiness: () => true,
      contracts: {
        invariants: [
          {
            id: 'huge',
            description: { en: 'huge' },
            predicate: hugePredicate as never,
          },
        ],
      },
    });
    const result = validateManifest(manifest, [spec]);
    const err = result.errors.find((e) => e.code === 'predicate-size-limit-exceeded');
    expect(err).toBeDefined();
    expect(err!.message).toMatch(/contract 'huge' predicate source is \d+ bytes/);
    expect(err!.message).toMatch(/4096-byte limit/);
    expect(err!.message).toMatch(/Refactor into smaller named contracts/);
    expect(err!.location).toEqual({ intentKey: 'Big', contractId: 'huge' });
  });

  it('does NOT fire predicate-size-limit-exceeded for predicates within the limit', () => {
    // Sanity check killing the `if (!sourceCheck.ok)` mutant — when ok is
    // true, no error fires.
    const manifest = makeManifest();
    const spec = defineCrawcusSpec({
      key: intentKey('Small'),
      projection: projectionName('Course'),
      version: 1,
      fields: { title: field.string().required() },
      readiness: () => true,
      contracts: {
        invariants: [
          {
            id: 'tiny',
            description: { en: 'tiny' },
            predicate: () => true,
          },
        ],
      },
    });
    const result = validateManifest(manifest, [spec]);
    expect(result.errors.some((e) => e.code === 'predicate-size-limit-exceeded')).toBe(false);
  });

  // --- Composition path coverage (line 95: `spec.extends && opts.resolveParent`) ---

  it('skips composition validation when spec has no extends', () => {
    const manifest = makeManifest();
    const spec = defineCrawcusSpec({
      key: intentKey('NoExtends'),
      projection: projectionName('Course'),
      version: 1,
      fields: { title: field.string().required() },
      readiness: () => true,
    });
    let resolverCalled = false;
    const result = validateManifest(manifest, [spec], {
      resolveParent: () => {
        resolverCalled = true;
        return null;
      },
    });
    expect(resolverCalled).toBe(false); // short-circuit: no extends → no resolve
    expect(result.errors.some((e) => e.code === 'contract-monotonicity')).toBe(false);
  });

  it('skips composition validation when resolveParent is not provided', () => {
    const manifest = makeManifest();
    const spec = defineCrawcusSpec({
      key: intentKey('WithExtendsButNoResolver'),
      projection: projectionName('Course'),
      version: 1,
      extends: 'someParent',
      fields: { title: field.string().required() },
      readiness: () => true,
    });
    const result = validateManifest(manifest, [spec]); // no resolveParent opt
    // Should not throw and should not produce a composition-related error.
    expect(result.errors.some((e) => e.code === 'contract-monotonicity')).toBe(false);
  });

  it('skips composition validation when resolveParent returns null', () => {
    const manifest = makeManifest();
    const spec = defineCrawcusSpec({
      key: intentKey('Orphan'),
      projection: projectionName('Course'),
      version: 1,
      extends: 'nonExistent',
      fields: { title: field.string().required() },
      readiness: () => true,
    });
    const result = validateManifest(manifest, [spec], {
      resolveParent: () => null,
    });
    expect(result.errors.some((e) => e.code === 'contract-monotonicity')).toBe(false);
  });

  it('aggregates multiple errors (does not short-circuit)', () => {
    const manifest = makeManifest();
    const spec = defineCrawcusSpec({
      key: intentKey('Multi'),
      projection: projectionName('Course'),
      version: 1,
      fields: {
        nonExistent: field.string().required(),
        alsoNonExistent: field.string().required(),
        medicalNotes: field.string().required(),
      },
      readiness: () => true,
    });
    const result = validateManifest(manifest, [spec]);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});
