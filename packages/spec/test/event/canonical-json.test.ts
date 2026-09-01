import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { canonicalJSON, isoDate, normaliseForCanonical } from '../../src/event/canonical-json.js';

describe('canonicalJSON — RFC 8785 conformance', () => {
  it('sorts object keys lexicographically by UTF-8 code-point', () => {
    const value = { z: 1, a: 2, m: 3 };
    expect(canonicalJSON(value)).toBe('{"a":2,"m":3,"z":1}');
  });

  it('sorts nested object keys recursively', () => {
    const value = { outer: { z: 1, a: 2 }, alpha: { y: 3, b: 4 } };
    expect(canonicalJSON(value)).toBe('{"alpha":{"b":4,"y":3},"outer":{"a":2,"z":1}}');
  });

  it('preserves array element order (arrays are ordered by spec)', () => {
    expect(canonicalJSON([3, 1, 2])).toBe('[3,1,2]');
  });

  it('emits no insignificant whitespace', () => {
    const out = canonicalJSON({ a: 1, b: [2, 3] });
    expect(out).not.toMatch(/\s/);
  });

  it('serialises integers without trailing zero', () => {
    expect(canonicalJSON({ n: 1 })).toBe('{"n":1}');
  });

  it('handles nested arrays + objects', () => {
    const value = {
      items: [
        { b: 2, a: 1 },
        { d: 4, c: 3 },
      ],
    };
    expect(canonicalJSON(value)).toBe('{"items":[{"a":1,"b":2},{"c":3,"d":4}]}');
  });

  it('serialises null + booleans', () => {
    expect(canonicalJSON({ x: null, y: true, z: false })).toBe('{"x":null,"y":true,"z":false}');
  });

  it('serialises UTF-8 strings (basic)', () => {
    expect(canonicalJSON({ s: 'hello' })).toBe('{"s":"hello"}');
  });

  it('determinism — same input produces same output across N runs', () => {
    const value = { c: 3, a: 1, b: { y: 2, x: 1 }, arr: [1, 2, 3] };
    const first = canonicalJSON(value);
    for (let i = 0; i < 100; i++) {
      expect(canonicalJSON(value)).toBe(first);
    }
  });

  it('determinism — input-order independence', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { z: 3, y: 2, x: 1 };
    expect(canonicalJSON(a)).toBe(canonicalJSON(b));
  });

  it('throws TypeError for non-serialisable values (function)', () => {
    expect(() => canonicalJSON(() => 1)).toThrow(TypeError);
  });

  it('throws TypeError for non-finite numbers — Infinity at top level', () => {
    expect(() => canonicalJSON(Infinity)).toThrow(TypeError);
  });

  it('throws TypeError for non-finite numbers — -Infinity nested in object', () => {
    expect(() => canonicalJSON({ x: -Infinity })).toThrow(TypeError);
  });

  it('throws TypeError for non-finite numbers — NaN nested in array', () => {
    expect(() => canonicalJSON([1, NaN, 3])).toThrow(TypeError);
  });

  it('throws TypeError for non-finite numbers — Infinity deeply nested', () => {
    expect(() => canonicalJSON({ a: { b: [{ c: Infinity }] } })).toThrow(TypeError);
  });

  it('property: any pair of objects with the same JSON content canonicalises identically', () => {
    // RFC 8785-valid JSON only: finite numbers, no NaN / Infinity. These
    // are excluded from the generator because canonicalJSON now rejects
    // them at the boundary (a fix for a real bug: JSON.stringify coerces
    // them to `null`, which would silently break hash equivalence across
    // TS / Go / Rust reference implementations).
    const finiteJson = fc.jsonValue({ maxDepth: 3 });
    fc.assert(
      fc.property(finiteJson, (json) => {
        const out1 = canonicalJSON(json);
        const reparsed: unknown = JSON.parse(out1);
        const out2 = canonicalJSON(reparsed);
        expect(out2).toBe(out1);
      }),
      { numRuns: 200 },
    );
  });
});

describe('isoDate — Z-terminated UTC ISO-8601', () => {
  it('produces Z-terminated UTC form', () => {
    const d = new Date('2026-05-20T12:34:56.789Z');
    expect(isoDate(d)).toBe('2026-05-20T12:34:56.789Z');
  });

  it('is deterministic for same input', () => {
    const d = new Date(0);
    expect(isoDate(d)).toBe(isoDate(d));
  });
});

describe('normaliseForCanonical — Date replacement', () => {
  it('replaces top-level Date with ISO string', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(normaliseForCanonical(d)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('replaces Dates nested in objects', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(normaliseForCanonical({ at: d, name: 'x' })).toEqual({
      at: '2026-01-01T00:00:00.000Z',
      name: 'x',
    });
  });

  it('replaces Dates nested in arrays', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    expect(normaliseForCanonical([d, d])).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);
  });

  it('leaves primitives untouched', () => {
    expect(normaliseForCanonical('hello')).toBe('hello');
    expect(normaliseForCanonical(42)).toBe(42);
    expect(normaliseForCanonical(true)).toBe(true);
    expect(normaliseForCanonical(null)).toBe(null);
  });

  it('handles deeply nested structures', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    const input = { a: { b: { c: [{ d }] } } };
    expect(normaliseForCanonical(input)).toEqual({
      a: { b: { c: [{ d: '2026-01-01T00:00:00.000Z' }] } },
    });
  });

  it('does not mutate the input', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    const input = { at: d };
    normaliseForCanonical(input);
    expect(input.at).toBe(d); // still the original Date
  });
});
