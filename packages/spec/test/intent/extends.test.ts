import { describe, it, expect } from 'vitest';
import { composeIntent, IntentCompositionError } from '../../src/intent/extends.js';
import { field } from '../../src/intent/field.js';
import { defineCrawcusSpec } from '../../src/intent/define-crawcus-spec.js';
import type { IntentKey, ProjectionName } from '../../src/types/ids.js';

const intentKey = (s: string): IntentKey => s as IntentKey;
const projectionName = (s: string): ProjectionName => s as ProjectionName;

const baseParent = (
  overrides: { contracts?: Parameters<typeof defineCrawcusSpec>[0]['contracts'] } = {},
) =>
  defineCrawcusSpec({
    key: intentKey('Parent'),
    projection: projectionName('Proj'),
    version: 1,
    fields: { a: field.string().required() },
    readiness: ({ has }: { has: (...k: string[]) => boolean }) => has('a'),
    ...(overrides.contracts ? { contracts: overrides.contracts } : {}),
  });

const baseChild = (
  overrides: {
    contracts?: Parameters<typeof defineCrawcusSpec>[0]['contracts'];
    classification?: 'standard' | 'high-risk' | 'prohibited';
    fields?: Parameters<typeof defineCrawcusSpec>[0]['fields'];
  } = {},
) =>
  defineCrawcusSpec({
    key: intentKey('Child'),
    projection: projectionName('Proj'),
    version: 1,
    classification: overrides.classification ?? 'standard',
    fields: overrides.fields ?? { b: field.string().required() },
    readiness: ({ has }: { has: (...k: string[]) => boolean }) => has('b'),
    ...(overrides.contracts ? { contracts: overrides.contracts } : {}),
  });

describe('composeIntent — merging', () => {
  it('merges fields from parent + child', () => {
    const composed = composeIntent(baseParent(), baseChild());
    expect(Object.keys(composed.fields).sort()).toEqual(['a', 'b']);
  });

  it('child fields override parent on key collision', () => {
    const parent = baseParent();
    const child = baseChild({
      fields: { a: field.number().required() },
    });
    const composed = composeIntent(parent, child);
    expect(composed.fields.a?.base).toBe('number');
  });

  it('readiness composes as parent AND child', () => {
    const composed = composeIntent(baseParent(), baseChild());
    const ready = composed.readiness({
      has: (...k: string[]) => k.every((x) => x === 'a' || x === 'b'),
    });
    expect(ready).toBe(true);

    const notReady = composed.readiness({ has: (...k: string[]) => k.every((x) => x === 'a') });
    expect(notReady).toBe(false);
  });

  it('accumulates contracts from parent + child in each slot', () => {
    const parent = baseParent({
      contracts: {
        invariants: [{ id: 'p1', description: { en: 'p1' }, predicate: () => true }],
      },
    });
    const child = baseChild({
      contracts: {
        invariants: [{ id: 'c1', description: { en: 'c1' }, predicate: () => true }],
      },
    });
    const composed = composeIntent(parent, child);
    expect(composed.contracts?.invariants?.map((c) => c.id)).toEqual(['p1', 'c1']);
  });
});

describe('composeIntent — classification monotonicity', () => {
  it('child can match parent classification', () => {
    const parent = defineCrawcusSpec({ ...baseParent(), classification: 'high-risk' });
    const child = baseChild({ classification: 'high-risk' });
    expect(() => composeIntent(parent, child)).not.toThrow();
  });

  it('child can elevate classification (standard -> high-risk)', () => {
    const parent = baseParent();
    const child = baseChild({ classification: 'high-risk' });
    const composed = composeIntent(parent, child);
    expect(composed.classification).toBe('high-risk');
  });

  it('child CANNOT downgrade classification (high-risk -> standard)', () => {
    const parent = defineCrawcusSpec({ ...baseParent(), classification: 'high-risk' });
    const child = baseChild({ classification: 'standard' });
    expect(() => composeIntent(parent, child)).toThrow(IntentCompositionError);
  });

  it('child CANNOT downgrade prohibited -> high-risk', () => {
    const parent = defineCrawcusSpec({ ...baseParent(), classification: 'prohibited' });
    const child = baseChild({ classification: 'high-risk' });
    expect(() => composeIntent(parent, child)).toThrow(IntentCompositionError);
  });

  it('thrown IntentCompositionError has correct name + message text', () => {
    const parent = defineCrawcusSpec({ ...baseParent(), classification: 'high-risk' });
    const child = baseChild({ classification: 'standard' });
    try {
      composeIntent(parent, child);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(IntentCompositionError);
      expect((e as Error).name).toBe('IntentCompositionError');
      expect((e as Error).message).toMatch(/'standard' cannot downgrade/);
      expect((e as Error).message).toMatch(/'high-risk'/);
    }
  });

  it("treats absent classification as 'standard' (default fallback on line 35)", () => {
    // Parent + child both omit `classification`. The fallback `?? 'standard'`
    // means both are read as 'standard' → child can compose (same level).
    const parent = baseParent();
    const child = baseChild();
    const composed = composeIntent(parent, child);
    expect(composed.classification).toBe('standard');
  });
});

describe('composeIntent — tags handling (line 87 ConditionalExpression + LogicalOperator)', () => {
  it('merges tags from both parent and child when both have tags', () => {
    const parent = defineCrawcusSpec({ ...baseParent(), tags: ['p1', 'p2'] });
    const child = defineCrawcusSpec({ ...baseChild(), tags: ['c1'] });
    const composed = composeIntent(parent, child);
    expect(composed.tags).toEqual(['p1', 'p2', 'c1']);
  });

  it('passes through parent tags when child has no tags', () => {
    const parent = defineCrawcusSpec({ ...baseParent(), tags: ['parent-only'] });
    const child = baseChild();
    const composed = composeIntent(parent, child);
    expect(composed.tags).toEqual(['parent-only']);
  });

  it('passes through child tags when parent has no tags', () => {
    const parent = baseParent();
    const child = defineCrawcusSpec({ ...baseChild(), tags: ['child-only'] });
    const composed = composeIntent(parent, child);
    expect(composed.tags).toEqual(['child-only']);
  });

  it('omits tags entirely when neither parent nor child has tags', () => {
    const parent = baseParent();
    const child = baseChild();
    const composed = composeIntent(parent, child);
    expect('tags' in composed).toBe(false);
  });
});
