import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeContentHash,
  computeJsonHash,
  verifyChain,
  GENESIS_PREV_HASH,
} from '../../src/event/hash-chain.js';
import type { Event } from '../../src/types/event.js';
import type {
  ActorId,
  ContentHash,
  EventId,
  IntentId,
  Purpose,
  SubjectId,
  TenantId,
} from '../../src/types/ids.js';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

/**
 * Build an Event for testing. Caller may override any field; `prevHash`
 * defaults to genesis; `contentHash` is computed.
 */
function makeEvent(opts: Partial<Event> & { intentId: IntentId; version: number }): Event {
  const base: Omit<Event, 'id' | 'contentHash'> = {
    tenantId: b<string, 'TenantId'>('tnt_test') as TenantId,
    intentId: opts.intentId,
    kind: opts.kind ?? 'CapturedTurn',
    version: opts.version,
    timestamp: opts.timestamp ?? new Date('2026-05-20T00:00:00.000Z'),
    actor: opts.actor ?? {
      id: b<string, 'ActorId'>('act_test') as ActorId,
      kind: 'system',
    },
    lawfulBasis: opts.lawfulBasis ?? 'contract',
    purpose: opts.purpose ?? (b<string, 'Purpose'>('course-setup') as Purpose),
    dataSubjectIds:
      opts.dataSubjectIds ?? ([b<string, 'SubjectId'>('subj_1') as SubjectId] as const),
    prevHash: opts.prevHash ?? GENESIS_PREV_HASH,
    payload: opts.payload ?? { value: opts.version },
  };
  const contentHash = computeContentHash(base);
  return {
    ...base,
    id: opts.id ?? (b<string, 'EventId'>(`evt_${opts.version}`) as EventId),
    contentHash,
  };
}

function makeChain(intentId: IntentId, length: number): Event[] {
  const events: Event[] = [];
  let prevHash: ContentHash | null = GENESIS_PREV_HASH;
  for (let i = 0; i < length; i++) {
    const event = makeEvent({ intentId, version: i, prevHash });
    events.push(event);
    prevHash = event.contentHash;
  }
  return events;
}

describe('computeContentHash — determinism + sensitivity', () => {
  it('produces identical hashes for identical input', () => {
    const intentId = b<string, 'IntentId'>('int_a') as IntentId;
    const a = makeEvent({ intentId, version: 0 });
    const b1 = makeEvent({ intentId, version: 0 });
    expect(a.contentHash).toBe(b1.contentHash);
  });

  it('produces different hashes for different version', () => {
    const intentId = b<string, 'IntentId'>('int_a') as IntentId;
    const a = makeEvent({ intentId, version: 0 });
    const b1 = makeEvent({ intentId, version: 1 });
    expect(a.contentHash).not.toBe(b1.contentHash);
  });

  it('produces different hashes for different payload', () => {
    const intentId = b<string, 'IntentId'>('int_a') as IntentId;
    const a = makeEvent({ intentId, version: 0, payload: { x: 1 } });
    const b1 = makeEvent({ intentId, version: 0, payload: { x: 2 } });
    expect(a.contentHash).not.toBe(b1.contentHash);
  });

  it('hash is 64-char hex (SHA-256)', () => {
    const intentId = b<string, 'IntentId'>('int_a') as IntentId;
    const event = makeEvent({ intentId, version: 0 });
    expect(event.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifyChain — happy path', () => {
  it('verifies an empty chain as valid', () => {
    const result = verifyChain([]);
    expect(result).toEqual({ valid: true, brokenAt: null });
  });

  it('verifies a single-event chain (genesis)', () => {
    const intentId = b<string, 'IntentId'>('int_a') as IntentId;
    const chain = makeChain(intentId, 1);
    const result = verifyChain(chain);
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBe(null);
  });

  it('verifies a 10-event chain', () => {
    const intentId = b<string, 'IntentId'>('int_a') as IntentId;
    const chain = makeChain(intentId, 10);
    const result = verifyChain(chain);
    expect(result.valid).toBe(true);
  });

  it('property: any well-formed chain of length N verifies', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (n) => {
        const intentId = b<string, 'IntentId'>(`int_${n}`) as IntentId;
        const chain = makeChain(intentId, n);
        return verifyChain(chain).valid === true;
      }),
      { numRuns: 30 },
    );
  });
});

describe('verifyChain — tamper detection (D2)', () => {
  it('detects genesis with non-null prevHash', () => {
    const intentId = b<string, 'IntentId'>('int_a') as IntentId;
    const chain = makeChain(intentId, 3);
    const tampered: Event[] = [
      { ...chain[0]!, prevHash: 'deadbeef'.repeat(8) as ContentHash },
      ...chain.slice(1),
    ];
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
    expect(result.reason).toContain('genesis');
  });

  it('detects modified contentHash', () => {
    const intentId = b<string, 'IntentId'>('int_a') as IntentId;
    const chain = makeChain(intentId, 3);
    const fake = 'a'.repeat(64) as ContentHash;
    const tampered: Event[] = [chain[0]!, { ...chain[1]!, contentHash: fake }, chain[2]!];
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toContain('contentHash mismatch');
  });

  it('detects modified payload (recomputed hash diverges)', () => {
    const intentId = b<string, 'IntentId'>('int_a') as IntentId;
    const chain = makeChain(intentId, 3);
    const tampered: Event[] = [
      chain[0]!,
      { ...chain[1]!, payload: { value: 999 } }, // contentHash unchanged but payload mutated
      chain[2]!,
    ];
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toContain('contentHash mismatch');
  });

  it('detects broken prevHash link', () => {
    const intentId = b<string, 'IntentId'>('int_a') as IntentId;
    const chain = makeChain(intentId, 3);
    const wrong = 'b'.repeat(64) as ContentHash;
    const tampered: Event[] = [
      chain[0]!,
      {
        ...chain[1]!,
        prevHash: wrong,
        contentHash: computeContentHash({ ...chain[1]!, prevHash: wrong }),
      },
      chain[2]!,
    ];
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(1);
    expect(result.reason).toContain('prevHash mismatch');
  });

  it('detects event deletion mid-chain', () => {
    const intentId = b<string, 'IntentId'>('int_a') as IntentId;
    const chain = makeChain(intentId, 5);
    const truncated = [chain[0]!, chain[1]!, chain[3]!, chain[4]!]; // skip index 2
    const result = verifyChain(truncated);
    expect(result.valid).toBe(false);
    // Skip propagates: chain[3]'s prevHash refers to chain[2], not chain[1]
    expect(result.brokenAt).toBe(2);
  });

  it('property: modifying any field of any event in a chain breaks verification', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 0, max: 9 }),
        (n, mutateAtRaw) => {
          const mutateAt = mutateAtRaw % n;
          const intentId = b<string, 'IntentId'>(`int_p_${n}`) as IntentId;
          const chain = makeChain(intentId, n);
          const tampered = chain.map((e, i) =>
            i === mutateAt ? { ...e, payload: { tampered: true } } : e,
          );
          const result = verifyChain(tampered);
          return result.valid === false;
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('computeJsonHash', () => {
  it('returns a 64-character lowercase hex SHA-256', () => {
    const hash = computeJsonHash({ courseName: 'IELTS Prep' });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same input → same hash', () => {
    const value = { name: 'demo', flags: [true, false], n: 42 };
    expect(computeJsonHash(value)).toBe(computeJsonHash(value));
  });

  it('is key-order-invariant via canonical JSON', () => {
    const a = { foo: 1, bar: 'x', zed: [1, 2] };
    const b = { zed: [1, 2], bar: 'x', foo: 1 };
    expect(computeJsonHash(a)).toBe(computeJsonHash(b));
  });

  it('different values yield different hashes', () => {
    expect(computeJsonHash({ x: 1 })).not.toBe(computeJsonHash({ x: 2 }));
  });

  it('null vs missing key yield different hashes', () => {
    expect(computeJsonHash({ x: null })).not.toBe(computeJsonHash({}));
  });

  it('handles nested structures', () => {
    const hash = computeJsonHash({
      user: { name: 'a', roles: ['admin', 'editor'] },
      meta: { createdAt: '2026-06-03T10:00:00Z' },
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalises Date instances to ISO strings (matches computeContentHash behaviour)', () => {
    const d = new Date('2026-06-03T10:00:00.000Z');
    const fromDate = computeJsonHash({ at: d });
    const fromIso = computeJsonHash({ at: '2026-06-03T10:00:00.000Z' });
    expect(fromDate).toBe(fromIso);
  });

  it('rejects non-finite numbers per RFC 8785', () => {
    expect(() => computeJsonHash({ x: NaN })).toThrow(TypeError);
    expect(() => computeJsonHash({ x: Infinity })).toThrow(TypeError);
  });
});
