import { describe, it, expect } from 'vitest';
import { dispatchReducer } from '../../src/reducer/dispatcher.js';
import { assertReducerDeterminism } from '../../src/reducer/determinism.js';
import type { Event } from '@crawcus/spec';
import type { ProjectionAdapter, ReducerCtx } from '../../src/config/types.js';
import type {
  ActorId,
  ContentHash,
  EventId,
  IntentId,
  IntentKey,
  Purpose,
  Region,
  TenantId,
} from '@crawcus/spec';
import type { TxContext } from '../../src/ports/tx-context.js';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const tenant = {
  id: b<string, 'TenantId'>('tnt') as TenantId,
  region: b<string, 'Region'>('local') as Region,
};
const tx: TxContext = { __tx: {}, tenant, startedAt: new Date() };
const intentId = b<string, 'IntentId'>('int_d') as IntentId;
const intentKey = b<string, 'IntentKey'>('TestIntent') as IntentKey;
const ctx: ReducerCtx = { tx, intentId };

const event: Event = {
  id: b<string, 'EventId'>('evt_x') as EventId,
  tenantId: tenant.id,
  intentId,
  kind: 'ProjectionCommit',
  version: 0,
  timestamp: new Date('2026-05-20T00:00:00.000Z'),
  actor: { id: b<string, 'ActorId'>('act') as ActorId, kind: 'system' },
  lawfulBasis: 'contract',
  purpose: b<string, 'Purpose'>('test') as Purpose,
  dataSubjectIds: [],
  prevHash: null,
  contentHash: b<string, 'ContentHash'>('0'.repeat(64)) as ContentHash,
  payload: { name: 'x' },
};

describe('dispatchReducer', () => {
  it('routes event to the registered reducer for its IntentKey', async () => {
    const seen: Event[] = [];
    const adapter: ProjectionAdapter = {
      [intentKey as string]: {
        apply: async (e) => {
          seen.push(e);
          return { projection: 'Test', id: 'p1', intentId, version: 1 };
        },
        current: async () => null,
        rebuild: async () => null,
      },
    };
    const out = await dispatchReducer(event, intentKey, adapter, ctx);
    expect(seen).toHaveLength(1);
    expect(out).toBeDefined();
  });

  it('silently no-ops when no reducer is registered for the IntentKey', async () => {
    const adapter: ProjectionAdapter = {};
    const out = await dispatchReducer(event, intentKey, adapter, ctx);
    expect(out).toBeUndefined();
  });
});

describe('assertReducerDeterminism (ratchet #3 + NFR D3)', () => {
  it('passes for a deterministic reducer', async () => {
    const adapter: ProjectionAdapter = {
      [intentKey as string]: {
        apply: async (e) => ({ name: (e.payload as { name: string }).name, count: 1 }),
        current: async () => null,
        rebuild: async () => null,
      },
    };
    const result = await assertReducerDeterminism({ event, intentKey, adapter, ctx });
    expect(result.ok).toBe(true);
  });

  it('detects non-deterministic reducer (e.g., uses Date.now)', async () => {
    let call = 0;
    const adapter: ProjectionAdapter = {
      [intentKey as string]: {
        apply: async () => {
          call += 1;
          return { runAt: call };
        },
        current: async () => null,
        rebuild: async () => null,
      },
    };
    const result = await assertReducerDeterminism({ event, intentKey, adapter, ctx });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.outputHashes[0]).not.toBe(result.outputHashes[1]);
    }
  });
});
