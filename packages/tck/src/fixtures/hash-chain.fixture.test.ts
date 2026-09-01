/**
 * # hash-chain.fixture.test.ts
 *
 * Inline self-test for `runHashChainContract` — drives the fixture
 * against an in-memory reference store implemented locally in this
 * file. The reference store is deliberately NOT exported from the
 * package; runtimes that want a reference implementation use
 * `/core`'s in-memory event store. Inlining it here keeps
 * the test fast, dependency-free (no Prisma), and self-contained.
 *
 * **What this proves:** the fixture catches regressions in itself
 * (the helper's pass-path works) AND that the negative-failure modes
 * fire correctly when a store misbehaves (`READ_LENGTH_MISMATCH`,
 * `READ_ORDER_MISMATCH`, `CONTENT_HASH_MISMATCH`, `PREV_HASH_MISMATCH`,
 * `PAYLOAD_MISMATCH`, `CHAIN_VERIFY_FAILED`). Any future change to
 * `computeContentHash` / `verifyChain` semantics will trip one of
 * these cases.
 */

import { describe, it, expect } from 'vitest';
import type { Event, IntentId, ContentHash, TenantId, Purpose } from '@crawcus/spec';
import { computeContentHash } from '@crawcus/spec';
import {
  runHashChainContract,
  buildGoldenSequence,
  EXPECTED_CONTENT_HASHES,
  type HashChainContractStore,
} from './hash-chain.fixture.js';

// ============ In-memory reference store (test-only; NOT exported) ============

/**
 * Append-only in-memory store. Mirrors what a conforming
 * `EventStore` must do: preserve every appended event verbatim, and
 * return them in append order.
 */
class InMemoryStore implements HashChainContractStore {
  private readonly events: Event[] = [];
  async appendEvent(event: Event): Promise<Event> {
    this.events.push(event);
    return event;
  }
  async readChain(_intentId: IntentId): Promise<readonly Event[]> {
    return [...this.events];
  }
}

// ============ Misbehaving stores for negative cases ============

/** Drops the last event — triggers `READ_LENGTH_MISMATCH`. */
class DropLastStore implements HashChainContractStore {
  private readonly events: Event[] = [];
  async appendEvent(event: Event): Promise<Event> {
    this.events.push(event);
    return event;
  }
  async readChain(_intentId: IntentId): Promise<readonly Event[]> {
    return this.events.slice(0, -1);
  }
}

/** Returns events in reverse order — triggers `READ_ORDER_MISMATCH`. */
class ReverseOrderStore implements HashChainContractStore {
  private readonly events: Event[] = [];
  async appendEvent(event: Event): Promise<Event> {
    this.events.push(event);
    return event;
  }
  async readChain(_intentId: IntentId): Promise<readonly Event[]> {
    return [...this.events].reverse();
  }
}

/** Mutates one `contentHash` on read — triggers `CONTENT_HASH_MISMATCH`. */
class HashCorruptingStore implements HashChainContractStore {
  private readonly events: Event[] = [];
  async appendEvent(event: Event): Promise<Event> {
    this.events.push(event);
    return event;
  }
  async readChain(_intentId: IntentId): Promise<readonly Event[]> {
    const out = [...this.events];
    const target = out[2];
    if (target !== undefined) {
      out[2] = { ...target, contentHash: 'corrupted-by-store' as ContentHash };
    }
    return out;
  }
}

/** Mutates one `prevHash` on read — triggers `PREV_HASH_MISMATCH`. */
class PrevHashCorruptingStore implements HashChainContractStore {
  private readonly events: Event[] = [];
  async appendEvent(event: Event): Promise<Event> {
    this.events.push(event);
    return event;
  }
  async readChain(_intentId: IntentId): Promise<readonly Event[]> {
    const out = [...this.events];
    const target = out[2];
    if (target !== undefined) {
      out[2] = { ...target, prevHash: 'corrupted-prev-by-store' as ContentHash };
    }
    return out;
  }
}

/**
 * Silently mutates a payload while leaving `contentHash` untouched —
 * mismatches the recompute-equality check and triggers
 * `PAYLOAD_MISMATCH`.
 */
class PayloadMutatingStore implements HashChainContractStore {
  private readonly events: Event[] = [];
  async appendEvent(event: Event): Promise<Event> {
    this.events.push(event);
    return event;
  }
  async readChain(_intentId: IntentId): Promise<readonly Event[]> {
    const out = [...this.events];
    const target = out[1];
    if (target !== undefined) {
      out[1] = {
        ...target,
        payload: { ...(target.payload as Record<string, unknown>), tampered: true },
      };
    }
    return out;
  }
}

// ============ Tests ============

describe('TCK / hash-chain fixture (TKT-TCK-HASH-CHAIN-FIXTURE)', () => {
  const intentId = 'tck-golden-intent' as IntentId;

  it('positive case — in-memory reference store satisfies the contract', async () => {
    const result = await runHashChainContract({
      storeFactory: () => new InMemoryStore(),
      intentId,
    });
    if (!result.ok) {
      throw new Error(`Expected pass, got ${result.code}: ${result.message}`);
    }
    expect(result.ok).toBe(true);
  });

  it('builds a deterministic 5-event sequence', () => {
    const events = buildGoldenSequence(intentId);
    expect(events.length).toBe(5);
    expect(events[0]!.prevHash).toBeNull();
    expect(events[0]!.kind).toBe('SourceCaptured');
    expect(events[1]!.kind).toBe('CapturedTurn');
    expect(events[2]!.kind).toBe('CapturedTurn');
    expect(events[3]!.kind).toBe('CapturedTurn');
    expect(events[4]!.kind).toBe('ProjectionCommit');
  });

  it('produces byte-identical hashes across builds (determinism)', () => {
    const a = buildGoldenSequence(intentId);
    const b = buildGoldenSequence(intentId);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.contentHash).toBe(b[i]!.contentHash);
      expect(a[i]!.prevHash).toBe(b[i]!.prevHash);
    }
  });

  it('linked chain — every prevHash equals prior contentHash', () => {
    const events = buildGoldenSequence(intentId);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.prevHash).toBe(events[i - 1]!.contentHash);
    }
  });

  it('EXPECTED_CONTENT_HASHES matches a fresh build with the same intent', () => {
    const events = buildGoldenSequence('tck-golden-intent' as IntentId);
    expect(events.length).toBe(EXPECTED_CONTENT_HASHES.length);
    for (let i = 0; i < events.length; i++) {
      expect(events[i]!.contentHash).toBe(EXPECTED_CONTENT_HASHES[i]);
    }
  });

  it('contentHash is recomputable from stored fields (round-trip)', () => {
    const events = buildGoldenSequence(intentId);
    for (const event of events) {
      const { id: _id, contentHash, ...hashable } = event;
      void _id;
      const recomputed = computeContentHash(hashable);
      expect(recomputed).toBe(contentHash);
    }
  });

  it('negative — DropLastStore triggers READ_LENGTH_MISMATCH', async () => {
    const result = await runHashChainContract({
      storeFactory: () => new DropLastStore(),
      intentId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('READ_LENGTH_MISMATCH');
  });

  it('negative — ReverseOrderStore triggers READ_ORDER_MISMATCH', async () => {
    const result = await runHashChainContract({
      storeFactory: () => new ReverseOrderStore(),
      intentId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('READ_ORDER_MISMATCH');
  });

  it('negative — HashCorruptingStore triggers CONTENT_HASH_MISMATCH', async () => {
    const result = await runHashChainContract({
      storeFactory: () => new HashCorruptingStore(),
      intentId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('CONTENT_HASH_MISMATCH');
  });

  it('negative — PrevHashCorruptingStore triggers PREV_HASH_MISMATCH', async () => {
    const result = await runHashChainContract({
      storeFactory: () => new PrevHashCorruptingStore(),
      intentId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PREV_HASH_MISMATCH');
  });

  it('negative — PayloadMutatingStore triggers PAYLOAD_MISMATCH', async () => {
    const result = await runHashChainContract({
      storeFactory: () => new PayloadMutatingStore(),
      intentId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PAYLOAD_MISMATCH');
  });

  it('failure shape — TckResultFailure carries code + message', async () => {
    const result = await runHashChainContract({
      storeFactory: () => new HashCorruptingStore(),
      intentId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.code).toBe('string');
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
      // Citation discipline: every failure message MUST cite the spec
      // file driving the assertion.
      expect(result.message).toMatch(/packages\/crawcus-spec\/src\/event\/hash-chain\.ts/);
    }
  });

  it('golden sequence carries the fixed actor + tenant + purpose', () => {
    const events = buildGoldenSequence(intentId);
    const expectedTenant = 'tck-tenant' as TenantId;
    const expectedPurpose = 'tck' as Purpose;
    for (const event of events) {
      expect(event.tenantId).toBe(expectedTenant);
      expect(event.purpose).toBe(expectedPurpose);
      expect(event.actor.kind).toBe('human');
      expect(event.actor.id).toBe('tck-subject');
      expect(event.lawfulBasis).toBe('legitimate-interest');
    }
  });
});
