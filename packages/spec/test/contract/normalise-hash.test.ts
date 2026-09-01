import { describe, it, expect } from 'vitest';
import { normalisePredicateSource } from '../../src/contract/normalise.js';
import { hashPredicate, hashPredicateSource } from '../../src/contract/hash.js';
import {
  checkPredicateSize,
  checkPredicateSizeFromSource,
  PREDICATE_SIZE_LIMIT_BYTES,
} from '../../src/contract/size-limit.js';

describe('normalisePredicateSource', () => {
  it('strips line comments', () => {
    expect(normalisePredicateSource('(ctx) => true // comment')).toBe('(ctx) => true');
  });

  it('strips block comments', () => {
    expect(normalisePredicateSource('(ctx) => /* skip */ true')).toBe('(ctx) => true');
  });

  it('collapses whitespace runs to single space', () => {
    expect(normalisePredicateSource('(ctx)   =>\n\n   true')).toBe('(ctx) => true');
  });

  it('trims surrounding whitespace', () => {
    expect(normalisePredicateSource('   (ctx) => true   ')).toBe('(ctx) => true');
  });

  it('normalises double-quoted strings to single quotes', () => {
    expect(normalisePredicateSource('(c) => c.x === "hello"')).toBe("(c) => c.x === 'hello'");
  });

  it('idempotent — applying twice yields same result', () => {
    const once = normalisePredicateSource('  (c)\n=>\n true  // x');
    const twice = normalisePredicateSource(once);
    expect(twice).toBe(once);
  });

  it('deterministic across runs', () => {
    const input = '(ctx) => /* comment */  ctx.has("foo")  ';
    const first = normalisePredicateSource(input);
    for (let i = 0; i < 50; i++) {
      expect(normalisePredicateSource(input)).toBe(first);
    }
  });
});

describe('hashPredicate', () => {
  it('produces a 64-char hex SHA-256 hash', () => {
    const h = hashPredicate(() => true);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('identical predicates produce identical hashes', () => {
    const a = () => true;
    const b = () => true;
    expect(hashPredicate(a)).toBe(hashPredicate(b));
  });

  it('different predicates produce different hashes', () => {
    expect(hashPredicate(() => true)).not.toBe(hashPredicate(() => false));
  });

  it('predicates differing only in whitespace + comments hash identically', () => {
    const a = hashPredicateSource('(ctx) => ctx.has("foo")');
    const b = hashPredicateSource('(ctx) =>\n  ctx.has("foo") // a comment');
    const c = hashPredicateSource('  (ctx) => /* skip */ ctx.has("foo")  ');
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('hashPredicate + hashPredicateSource on .toString() agree', () => {
    const fn = (ctx: { has: (k: string) => boolean }) => ctx.has('foo');
    expect(hashPredicate(fn as never)).toBe(hashPredicateSource(fn.toString()));
  });
});

describe('checkPredicateSize', () => {
  it('passes a small predicate', () => {
    const r = checkPredicateSize(() => true);
    expect(r.ok).toBe(true);
    expect(r.sizeBytes).toBeLessThan(PREDICATE_SIZE_LIMIT_BYTES);
    expect(r.limitBytes).toBe(PREDICATE_SIZE_LIMIT_BYTES);
  });

  it('fails a synthetic 5KB predicate source', () => {
    const huge = '(ctx) => ' + 'true && '.repeat(700) + 'true';
    const r = checkPredicateSizeFromSource(huge);
    expect(r.ok).toBe(false);
    expect(r.sizeBytes).toBeGreaterThan(PREDICATE_SIZE_LIMIT_BYTES);
  });

  it('limit is exactly 4 KB per Q-S lock', () => {
    expect(PREDICATE_SIZE_LIMIT_BYTES).toBe(4 * 1024);
  });
});
