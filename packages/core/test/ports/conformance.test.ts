import { describe, it, expect } from 'vitest';
import type {
  AIPort,
  AIRequest,
  AIResponse,
  EventStorePort,
  IdentityPort,
  PIIPort,
  ProjectionPort,
  StoragePort,
  TaskPort,
  TenantCtx,
  TxContext,
  Event,
  HashChainProof,
} from '../../src/index.js';
import type {
  ActorId,
  ContentHash,
  EventId,
  IntentId,
  ProjectionId,
  ProjectionName,
  Purpose,
  Region,
  SubjectId,
  TaskId,
  TenantId,
  Token,
} from '@crawcus/spec';

/**
 * Port-conformance tests.
 *
 * These tests verify that minimal in-memory reference implementations
 * of every port satisfy the port interface (TS compile-time check) AND
 * exhibit the contractually-required behaviour at runtime. They do NOT
 * exercise real adapters (Prisma, Postgres, Anthropic) — that's the
 * job of each adapter package's own test suite.
 *
 * Per NFR Port5 — adapter-swap effort is a one-line config change. If
 * a real adapter ever fails these conformance tests, swap-effort
 * exceeds one line and the contract is broken.
 */

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

// ---------- ProjectionPort ----------

class InMemoryProjection implements ProjectionPort<{ count: number }> {
  private store = new Map<IntentId, { count: number }>();

  async apply(event: Event, _ctx: TxContext): Promise<{ count: number }> {
    const cur = this.store.get(event.intentId) ?? { count: 0 };
    const next = { count: cur.count + 1 };
    this.store.set(event.intentId, next);
    return next;
  }

  async current(intentId: IntentId): Promise<{ count: number } | null> {
    return this.store.get(intentId) ?? null;
  }

  async rebuild(intentId: IntentId): Promise<{ count: number }> {
    // In a real adapter, rebuild replays the chain; here we just clear + return zero.
    const fresh = { count: 0 };
    this.store.set(intentId, fresh);
    return fresh;
  }
}

// ---------- EventStorePort ----------

class InMemoryEventStore implements EventStorePort {
  private log = new Map<IntentId, Event[]>();

  async append(event: Event, _ctx: TxContext): Promise<void> {
    const arr = this.log.get(event.intentId) ?? [];
    arr.push(event);
    this.log.set(event.intentId, arr);
  }

  async *read(intentId: IntentId): AsyncIterable<Event> {
    for (const e of this.log.get(intentId) ?? []) yield e;
  }

  async chain(intentId: IntentId): Promise<HashChainProof> {
    const events = this.log.get(intentId) ?? [];
    if (events.length === 0) {
      throw new Error('cannot produce chain for empty intent');
    }
    const first = events[0]!;
    const last = events[events.length - 1]!;
    return {
      intentId,
      fromEventId: first.id,
      toEventId: last.id,
      rootHash: last.contentHash,
      hashes: events.map((e) => ({
        id: e.id,
        prevHash: e.prevHash,
        contentHash: e.contentHash,
      })),
    };
  }

  async begin<T>(
    tenant: { readonly id: TenantId; readonly region: Region },
    fn: (tx: TxContext) => Promise<T>,
  ): Promise<T> {
    const tx: TxContext = {
      __tx: {},
      tenant,
      startedAt: new Date(),
    };
    return fn(tx);
  }
}

// ---------- AIPort ----------

class StubAIPort implements AIPort {
  async call(req: AIRequest, _ctx: TenantCtx): Promise<AIResponse> {
    return {
      text: `stub-response-for-${req.purpose}`,
      model: req.model,
      inputHash: b<string, 'ContentHash'>('0'.repeat(64)) as ContentHash,
      outputHash: b<string, 'ContentHash'>('1'.repeat(64)) as ContentHash,
      latencyMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    };
  }
}

// ---------- IdentityPort ----------

class StubIdentityPort implements IdentityPort {
  async resolveActor() {
    return {
      id: b<string, 'ActorId'>('act_stub') as ActorId,
      kind: 'system' as const,
    };
  }
  async resolveTenant() {
    return {
      id: b<string, 'TenantId'>('tnt_stub') as TenantId,
      region: b<string, 'Region'>('local') as Region,
    };
  }
  async resolveSubjects(): Promise<readonly SubjectId[]> {
    return [];
  }
}

// ---------- PIIPort ----------

class StubPIIPort implements PIIPort {
  async detect() {
    return [];
  }
  async tokenize(text: string) {
    return { text, tokens: [] as readonly { token: Token; kind: 'other' }[] };
  }
  async detokenize(text: string) {
    return text;
  }
}

// ---------- TaskPort ----------

class StubTaskPort implements TaskPort {
  async enqueue(task: { kind: string }) {
    return {
      id: b<string, 'TaskId'>('tsk_stub') as TaskId,
      kind: task.kind,
      enqueuedAt: new Date(),
    };
  }
  async status() {
    return { state: 'queued' as const };
  }
  async cancel(): Promise<void> {
    /* no-op */
  }
}

// ---------- StoragePort ----------

class InMemoryStorage implements StoragePort {
  private store = new Map<string, Uint8Array>();
  async put(key: string, data: Uint8Array) {
    this.store.set(key, data);
    return {
      key,
      region: b<string, 'Region'>('local') as Region,
      contentHash: b<string, 'ContentHash'>('2'.repeat(64)) as ContentHash,
    };
  }
  async get(ref: { key: string }) {
    const v = this.store.get(ref.key);
    if (!v) throw new Error('not found');
    return v;
  }
  async delete(ref: { key: string }): Promise<void> {
    this.store.delete(ref.key);
  }
}

// ============== Tests ==============

describe('port conformance — type-level (compile-time)', () => {
  it('in-memory adapters implement every port interface', () => {
    const projection: ProjectionPort<{ count: number }> = new InMemoryProjection();
    const eventStore: EventStorePort = new InMemoryEventStore();
    const ai: AIPort = new StubAIPort();
    const identity: IdentityPort = new StubIdentityPort();
    const pii: PIIPort = new StubPIIPort();
    const tasks: TaskPort = new StubTaskPort();
    const storage: StoragePort = new InMemoryStorage();
    // Mere assignment to the port type is the compile-time conformance check.
    expect([projection, eventStore, ai, identity, pii, tasks, storage]).toHaveLength(7);
  });
});

describe('port conformance — runtime round-trip', () => {
  it('EventStorePort.append + read round-trips events in order', async () => {
    const store = new InMemoryEventStore();
    const tenant = {
      id: b<string, 'TenantId'>('tnt_test') as TenantId,
      region: b<string, 'Region'>('local') as Region,
    };
    const tx: TxContext = { __tx: {}, tenant, startedAt: new Date() };
    const intentId = b<string, 'IntentId'>('int_rr') as IntentId;
    const makeStubEvent = (version: number, prevHash: ContentHash | null): Event => ({
      id: b<string, 'EventId'>(`evt_${version}`) as EventId,
      tenantId: tenant.id,
      intentId,
      kind: 'CapturedTurn',
      version,
      timestamp: new Date('2026-05-20T00:00:00.000Z'),
      actor: { id: b<string, 'ActorId'>('act_x') as ActorId, kind: 'system' },
      lawfulBasis: 'contract',
      purpose: b<string, 'Purpose'>('test') as Purpose,
      dataSubjectIds: [],
      prevHash,
      contentHash: b<string, 'ContentHash'>(String(version).padStart(64, '0')) as ContentHash,
      payload: { version },
    });

    const e0 = makeStubEvent(0, null);
    const e1 = makeStubEvent(1, e0.contentHash);
    await store.append(e0, tx);
    await store.append(e1, tx);

    const read: Event[] = [];
    for await (const e of store.read(intentId)) read.push(e);
    expect(read).toHaveLength(2);
    expect(read[0]!.version).toBe(0);
    expect(read[1]!.version).toBe(1);
  });

  it('ProjectionPort.apply accumulates per intent', async () => {
    const projection = new InMemoryProjection();
    const tenant = {
      id: b<string, 'TenantId'>('tnt_test') as TenantId,
      region: b<string, 'Region'>('local') as Region,
    };
    const tx: TxContext = { __tx: {}, tenant, startedAt: new Date() };
    const intentId = b<string, 'IntentId'>('int_apply') as IntentId;
    const projectionId = b<string, 'ProjectionId'>('prj_apply') as ProjectionId;
    const projectionName = b<string, 'ProjectionName'>('Course') as ProjectionName;
    void projectionId;
    void projectionName;

    const makeStubEvent = (version: number): Event => ({
      id: b<string, 'EventId'>(`evt_${version}`) as EventId,
      tenantId: tenant.id,
      intentId,
      kind: 'CapturedTurn',
      version,
      timestamp: new Date('2026-05-20T00:00:00.000Z'),
      actor: { id: b<string, 'ActorId'>('act_x') as ActorId, kind: 'system' },
      lawfulBasis: 'contract',
      purpose: b<string, 'Purpose'>('test') as Purpose,
      dataSubjectIds: [],
      prevHash: null,
      contentHash: b<string, 'ContentHash'>(String(version).padStart(64, '0')) as ContentHash,
      payload: {},
    });

    await projection.apply(makeStubEvent(0), tx);
    await projection.apply(makeStubEvent(1), tx);
    const cur = await projection.current(intentId);
    expect(cur?.count).toBe(2);
  });
});
