import { bench, describe } from 'vitest';
import { computeContentHash, verifyChain } from '../../src/event/hash-chain.js';
import type { Event } from '../../src/types/event.js';
import type { ContentHash } from '../../src/types/ids.js';

/**
 * Bench tests for the load-bearing hash-chain primitives.
 *
 * NFR mapping (see docs/notebook/07-engineering/nfrs.md):
 *   P3  Hash-chain verification per-event ≤1ms (target),
 *       ≤0.5ms (Y7 target)
 *
 * The numbers here are not assertions — vitest bench produces a
 * per-iteration time. NFR enforcement happens via CI snapshot of the
 * bench output + manual review on regressions (ratchet #11 perf budget).
 */

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

function makeBaseEvent(version: number): Omit<Event, 'id' | 'contentHash'> {
  return {
    tenantId: b<string, 'TenantId'>('tnt_bench') as never,
    intentId: b<string, 'IntentId'>('int_bench') as never,
    kind: 'CapturedTurn',
    version,
    timestamp: new Date('2026-05-21T00:00:00.000Z'),
    actor: { id: b<string, 'ActorId'>('act_bench') as never, kind: 'system' },
    lawfulBasis: 'contract',
    purpose: b<string, 'Purpose'>('bench') as never,
    dataSubjectIds: [],
    prevHash: null,
    payload: { v: version, msg: 'small payload' },
  };
}

function makeChain(length: number): Event[] {
  const chain: Event[] = [];
  let prevHash: ContentHash | null = null;
  for (let i = 0; i < length; i++) {
    const base = { ...makeBaseEvent(i), prevHash };
    const contentHash = computeContentHash(base);
    chain.push({
      ...base,
      id: `00000000-0000-7000-0000-${String(i).padStart(12, '0')}` as never,
      contentHash,
    });
    prevHash = contentHash;
  }
  return chain;
}

describe('hash-chain bench', () => {
  bench('computeContentHash — single event (NFR P3 target ≤1ms)', () => {
    computeContentHash(makeBaseEvent(0));
  });

  bench('verifyChain — 10 events', () => {
    const chain = makeChain(10);
    verifyChain(chain);
  });

  bench('verifyChain — 100 events', () => {
    const chain = makeChain(100);
    verifyChain(chain);
  });

  bench('verifyChain — 1000 events', () => {
    const chain = makeChain(1000);
    verifyChain(chain);
  });
});
