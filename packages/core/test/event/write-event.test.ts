import { describe, it, expect, beforeEach } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import { writeEvent, unsafeAssertUntainted } from '../../src/event/write-event.js';
import { defineCompliance } from '@crawcus/spec';
import { defineCrawcusSpec } from '@crawcus/spec';
import { field } from '@crawcus/spec';
import { verifyChain } from '@crawcus/spec';
import { signWarrant, bytesToBase64 } from '@crawcus/spec';
import {
  ConsentInvalidError,
  ConsentRequiredError,
  ContractViolationError,
  DisclosureRequiredError,
  LawfulBasisMismatchError,
  LineageInvalidError,
  OversightInvalidError,
  WarrantViolationError,
} from '../../src/errors/index.js';
import type {
  TallysealConfig,
  TallysealConsentConfig,
  TallysealDisclosuresConfig,
  TallysealLineageConfig,
  TallysealOversightConfig,
  TallysealWarrantsConfig,
} from '../../src/config/types.js';
import type {
  Consent,
  ConsentRequirement,
  Disclosure,
  DisclosureRequirement,
  Event,
  HumanOversight,
  IssuerTrust,
  Lineage,
  LineageInput,
  OverseerRef,
  OversightRequirement,
  Warrant,
} from '@crawcus/spec';
import { PROV_JSONLD_CONTEXT_URL } from '@crawcus/spec';
import type { HashChainProof } from '@crawcus/spec';
import type { WarrantStorePort } from '../../src/warrant/store-port.js';
import type { DisclosureStorePort } from '../../src/disclosure/store-port.js';
import type { ConsentStorePort } from '../../src/consent/store-port.js';
import type { LineageStorePort } from '../../src/lineage/store-port.js';
import type { OversightStorePort } from '../../src/oversight/store-port.js';
import type { TxContext } from '../../src/ports/tx-context.js';
import type {
  ActorId,
  IntentId,
  IntentKey,
  Iri,
  OrgId,
  ProcessingPurpose,
  ProjectionName,
  Purpose,
  Region,
  SubjectId,
  TenantId,
  ISO8601Duration,
  RegulationVersion,
} from '@crawcus/spec';

const b = <T extends string, K extends string>(s: string): T & { readonly __brand: K } =>
  s as T & { readonly __brand: K };

const tenant = {
  id: b<string, 'TenantId'>('tnt') as TenantId,
  region: b<string, 'Region'>('local') as Region,
};
const actor = { id: b<string, 'ActorId'>('act') as ActorId, kind: 'system' as const };

// ---------- minimal in-memory adapters ----------

function makeInMemoryConfig(): {
  config: TallysealConfig;
  events: Map<IntentId, Event[]>;
} {
  const events = new Map<IntentId, Event[]>();

  const tx: TxContext = { __tx: {}, tenant, startedAt: new Date() };

  const config: TallysealConfig = {
    eventStore: {
      async append(event, _tx) {
        const arr = events.get(event.intentId) ?? [];
        arr.push(event);
        events.set(event.intentId, arr);
      },
      async *read(intentId) {
        for (const e of events.get(intentId) ?? []) yield e;
      },
      async chain(intentId): Promise<HashChainProof> {
        const arr = events.get(intentId) ?? [];
        const first = arr[0]!;
        const last = arr[arr.length - 1]!;
        return {
          intentId,
          fromEventId: first.id,
          toEventId: last.id,
          rootHash: last.contentHash,
          hashes: arr.map((e) => ({ id: e.id, prevHash: e.prevHash, contentHash: e.contentHash })),
        };
      },
      async begin(_tenant, fn) {
        return fn(tx);
      },
    },
    projection: {
      async apply(_event, _ctx) {
        return null;
      },
      async current(_id) {
        return null;
      },
      async rebuild(_id) {
        return null;
      },
    },
    ai: {
      async call(_req) {
        throw new Error('AI not wired in test');
      },
    },
    identity: {
      async resolveActor() {
        return actor;
      },
      async resolveTenant() {
        return tenant;
      },
      async resolveSubjects() {
        return [];
      },
    },
    pii: {
      async detect() {
        return [];
      },
      async tokenize(text) {
        return { text, tokens: [] };
      },
      async detokenize(text) {
        return text;
      },
    },
    tasks: {
      async enqueue() {
        throw new Error('tasks not wired');
      },
      async status() {
        throw new Error('tasks not wired');
      },
      async cancel() {
        throw new Error('tasks not wired');
      },
    },
    storage: {
      async put() {
        throw new Error('storage not wired');
      },
      async get() {
        throw new Error('storage not wired');
      },
      async delete() {
        throw new Error('storage not wired');
      },
    },
    compliance: defineCompliance({
      regulations: [b<string, 'RegulationVersion'>('gdpr@2025-Q1') as RegulationVersion],
      fields: { 'Test.x': { pii: 'none' } },
      retention: {
        default: b<string, 'ISO8601Duration'>('P7Y') as ISO8601Duration,
        events: b<string, 'ISO8601Duration'>('P10Y') as ISO8601Duration,
        pii: {
          personal: b<string, 'ISO8601Duration'>('P7Y') as ISO8601Duration,
          sensitive: b<string, 'ISO8601Duration'>('P3Y') as ISO8601Duration,
          special: b<string, 'ISO8601Duration'>('P1Y') as ISO8601Duration,
        },
      },
      residency: {
        region: 'local' as never,
        eventStore: 'local' as never,
        piiVault: 'local' as never,
        aiProvider: { provider: 'none', endpoint: 'none' },
        crossBorderTransfers: 'forbid',
      },
      ai: {
        allowedModels: [],
        promptTemplateVersion: 'v1',
        costCeilingPerIntent: { currency: 'usd', amount: 0 },
      },
      lawfulBasis: {
        default: 'contract',
        perPurpose: { test: 'contract' },
      },
    }),
  };

  return { config, events };
}

const intentId = b<string, 'IntentId'>('int_x') as IntentId;
const purpose = b<string, 'Purpose'>('test') as Purpose;

describe('writeEvent — invariants', () => {
  it('appends a well-formed event to a fresh chain', async () => {
    const { config, events } = makeInMemoryConfig();
    const result = await writeEvent(
      {
        intentId,
        kind: 'CapturedTurn',
        payload: unsafeAssertUntainted({ x: 'hello' }),
        lawfulBasis: 'contract',
        purpose,
        dataSubjectIds: [],
      },
      { tenant, actor, config },
    );
    expect(result.event.prevHash).toBe(null); // genesis
    expect(result.event.version).toBe(0);
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('assigns monotonic versions across writes', async () => {
    const { config, events } = makeInMemoryConfig();
    for (let i = 0; i < 5; i++) {
      await writeEvent(
        {
          intentId,
          kind: 'CapturedTurn',
          payload: unsafeAssertUntainted({ n: i }),
          lawfulBasis: 'contract',
          purpose,
          dataSubjectIds: [],
        },
        { tenant, actor, config },
      );
    }
    const chain = events.get(intentId)!;
    expect(chain.map((e) => e.version)).toEqual([0, 1, 2, 3, 4]);
  });

  it('produces an unbroken hash chain (verifyChain passes)', async () => {
    const { config, events } = makeInMemoryConfig();
    for (let i = 0; i < 5; i++) {
      await writeEvent(
        {
          intentId,
          kind: 'CapturedTurn',
          payload: unsafeAssertUntainted({ n: i }),
          lawfulBasis: 'contract',
          purpose,
          dataSubjectIds: [],
        },
        { tenant, actor, config },
      );
    }
    const result = verifyChain(events.get(intentId)!);
    expect(result.valid).toBe(true);
  });

  it('throws LawfulBasisMismatchError when basis does not match manifest', async () => {
    const { config } = makeInMemoryConfig();
    await expect(
      writeEvent(
        {
          intentId,
          kind: 'CapturedTurn',
          payload: unsafeAssertUntainted({}),
          lawfulBasis: 'consent', // manifest says 'contract'
          purpose,
          dataSubjectIds: [],
        },
        { tenant, actor, config },
      ),
    ).rejects.toBeInstanceOf(LawfulBasisMismatchError);
  });

  it('throws ConsentRequiredError when specialCategoryBasis set without consentEventId', async () => {
    const { config } = makeInMemoryConfig();
    await expect(
      writeEvent(
        {
          intentId,
          kind: 'CapturedTurn',
          payload: unsafeAssertUntainted({}),
          lawfulBasis: 'contract',
          purpose,
          dataSubjectIds: [],
          specialCategoryBasis: 'explicit-consent',
          // consentEventId missing
        },
        { tenant, actor, config },
      ),
    ).rejects.toBeInstanceOf(ConsentRequiredError);
  });
});

describe('writeEvent — Contract evaluation', () => {
  let config: TallysealConfig;
  beforeEach(() => {
    config = makeInMemoryConfig().config;
  });

  const specWithContract = defineCrawcusSpec({
    key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
    projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
    version: 1,
    fields: { x: field.string().required() },
    readiness: () => true,
    contracts: {
      invariants: [
        {
          id: 'always-passes',
          description: { en: 'pass' },
          predicate: () => true,
        },
      ],
    },
  });

  it('passes when contract returns true', async () => {
    const { event } = await writeEvent(
      {
        intentId,
        kind: 'CapturedTurn',
        payload: unsafeAssertUntainted({}),
        lawfulBasis: 'contract',
        purpose,
        dataSubjectIds: [],
      },
      { tenant, actor, config, spec: specWithContract },
    );
    expect(event.version).toBe(0);
  });

  it('throws ContractViolationError when a block-severity contract fails', async () => {
    const failingSpec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
      projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: {
        invariants: [
          {
            id: 'always-fails',
            description: { en: 'fail' },
            predicate: () => false,
            severity: 'block',
          },
        ],
      },
    });
    await expect(
      writeEvent(
        {
          intentId,
          kind: 'CapturedTurn',
          payload: unsafeAssertUntainted({}),
          lawfulBasis: 'contract',
          purpose,
          dataSubjectIds: [],
        },
        { tenant, actor, config, spec: failingSpec },
      ),
    ).rejects.toBeInstanceOf(ContractViolationError);
  });

  it('allows warn-severity contract failures to proceed', async () => {
    const warnSpec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
      projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      contracts: {
        invariants: [
          {
            id: 'warn-fail',
            description: { en: 'warn' },
            predicate: () => false,
            severity: 'warn',
          },
        ],
      },
    });
    const { event } = await writeEvent(
      {
        intentId,
        kind: 'CapturedTurn',
        payload: unsafeAssertUntainted({}),
        lawfulBasis: 'contract',
        purpose,
        dataSubjectIds: [],
      },
      { tenant, actor, config, spec: warnSpec },
    );
    expect(event.version).toBe(0); // proceeded despite warn-fail
  });
});

describe('writeEvent — EventId format', () => {
  it('assigns UUIDv7-shaped EventIds (Q-A lock)', async () => {
    const { config } = makeInMemoryConfig();
    const { event } = await writeEvent(
      {
        intentId,
        kind: 'CapturedTurn',
        payload: unsafeAssertUntainted({}),
        lawfulBasis: 'contract',
        purpose,
        dataSubjectIds: [],
      },
      { tenant, actor, config },
    );
    // UUIDv7 format: xxxxxxxx-xxxx-7xxx-xxxx-xxxxxxxxxxxx
    expect(event.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

// ============== Warrant primitive #10 — writeEvent integration ==============

describe('writeEvent — Warrant pre-check (primitive #10)', () => {
  const TEST_PRIV = new Uint8Array(32);
  for (let i = 0; i < 32; i++) TEST_PRIV[i] = i + 1;
  const TEST_PUB = bytesToBase64(ed25519.getPublicKey(TEST_PRIV));
  const ISSUER_ID = 'is_test' as Warrant['issuer']['id'];

  const specKey = b<string, 'IntentKey'>('TestIntent') as IntentKey;
  const warrantSpec = defineCrawcusSpec({
    key: specKey,
    projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
    version: 1,
    fields: { x: field.string().required() },
    readiness: () => true,
  });

  const makeTrust = (): IssuerTrust => ({
    roots: [
      {
        issuerId: ISSUER_ID,
        publicKey: TEST_PUB,
        kind: 'self',
        name: 'Test Issuer',
      },
    ],
    acceptUnknown: false,
  });

  const makeSignedWarrant = (overrides: Partial<Warrant> = {}): Warrant => {
    const stub: Omit<Warrant, 'issuerSignature'> = {
      id: 'wt_001' as Warrant['id'],
      tenantId: tenant.id as unknown as Warrant['tenantId'],
      subject: actor.id as unknown as Warrant['subject'],
      issuer: {
        id: ISSUER_ID,
        kind: 'self',
        name: 'Test Issuer',
        publicKey: TEST_PUB,
        publicKeyAlgorithm: 'ed25519',
      },
      authority: [],
      scope: { specs: [specKey as unknown as Warrant['scope']['specs'][0]] },
      issuedAt: '2026-05-01T00:00:00.000Z' as Warrant['issuedAt'],
      expiresAt: '2027-05-01T00:00:00.000Z' as Warrant['expiresAt'],
      revokedAt: null,
      revocationReason: null,
      renewal: null,
      ...overrides,
    };
    const sig = signWarrant(stub, TEST_PRIV);
    return { ...stub, issuerSignature: sig };
  };

  const makeStore = (warrants: readonly Warrant[]): WarrantStorePort => ({
    async byId(_tenantId, warrantId) {
      return warrants.find((w) => w.id === warrantId) ?? null;
    },
    async activeForSpec(_tenantId, _specKey, _now) {
      return warrants;
    },
  });

  const baseInput = {
    intentId,
    kind: 'CapturedTurn' as const,
    payload: unsafeAssertUntainted({ x: 'hello' }),
    lawfulBasis: 'contract' as const,
    purpose,
    dataSubjectIds: [],
  };

  it('succeeds when an active Warrant evaluates to valid', async () => {
    const { config, events } = makeInMemoryConfig();
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([makeSignedWarrant()]),
      trust: makeTrust(),
    };
    const { event } = await writeEvent(baseInput, {
      tenant,
      actor,
      config: { ...config, warrants },
      spec: warrantSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('succeeds when warrants are configured but the store returns none', async () => {
    const { config, events } = makeInMemoryConfig();
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([]),
      trust: makeTrust(),
    };
    const { event } = await writeEvent(baseInput, {
      tenant,
      actor,
      config: { ...config, warrants },
      spec: warrantSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('throws WarrantViolationError and emits WarrantViolation event when warrant is revoked', async () => {
    const { config, events } = makeInMemoryConfig();
    const revoked = makeSignedWarrant({
      revokedAt: '2026-05-15T00:00:00.000Z' as Warrant['revokedAt'],
      revocationReason: 'auditor concern',
    });
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([revoked]),
      trust: makeTrust(),
    };
    const err = await writeEvent(baseInput, {
      tenant,
      actor,
      config: { ...config, warrants },
      spec: warrantSpec,
    }).then(
      () => {
        throw new Error('expected throw did not happen');
      },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(WarrantViolationError);
    // Strong assertions on the error (kills the 'pre' string literal + the
    // error-message template mutants in preCheckWarrants):
    const wve = err as WarrantViolationError;
    expect(wve.checkpoint).toBe('pre');
    expect(wve.warrantId).toBe('wt_001');
    expect(wve.status).toBe('revoked');
    expect(wve.issuerId).toBe('is_test');
    expect(wve.message).toMatch(/Warrant 'wt_001'/);
    expect(wve.message).toMatch(/failed at checkpoint 'pre'/);
    expect(wve.message).toMatch(/status=revoked/);

    // The WarrantViolation event landed on the chain (in its own tx)
    // even though the main writeEvent flow threw + rolled back.
    const chain = events.get(intentId) ?? [];
    expect(chain).toHaveLength(1);
    expect(chain[0]!.kind).toBe('WarrantViolation');
    const payload = chain[0]!.payload as {
      warrantId: string;
      status: string;
      reason: string;
    };
    expect(payload.warrantId).toBe('wt_001');
    expect(payload.status).toBe('revoked');
    expect(payload.reason).toContain('auditor concern');
  });

  it('throws WarrantViolationError with status=untrusted-issuer when issuer is unknown', async () => {
    const { config } = makeInMemoryConfig();
    const warrant = makeSignedWarrant();
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([warrant]),
      // Trust roots empty + acceptUnknown=false → untrusted-issuer
      trust: { roots: [], acceptUnknown: false },
    };
    await expect(
      writeEvent(baseInput, {
        tenant,
        actor,
        config: { ...config, warrants },
        spec: warrantSpec,
      }),
    ).rejects.toMatchObject({
      code: 'warrant-violation',
      status: 'untrusted-issuer',
    });
  });

  it('does not consult warrants when ctx.config.warrants is absent (existing behaviour preserved)', async () => {
    const { config, events } = makeInMemoryConfig();
    // No warrants config at all — should behave exactly like prior writeEvent.
    const { event } = await writeEvent(baseInput, {
      tenant,
      actor,
      config,
      spec: warrantSpec,
    });
    expect(event.version).toBe(0);
    expect(events.get(intentId)).toHaveLength(1);
  });

  // --- Recursion guards: warrant-lifecycle kinds must NOT trigger the warrant check ---
  // (Otherwise emitting a WarrantViolation event would itself trigger another
  // warrant check and recurse. The guard reads `input.kind !==
  // 'WarrantViolation' && ... !== 'WarrantClaimed' && ... !== 'WarrantPresented'`.)

  it('skips warrant check for WarrantViolation events (recursion guard)', async () => {
    const { config, events } = makeInMemoryConfig();
    const revoked = makeSignedWarrant({
      revokedAt: '2026-05-15T00:00:00.000Z' as Warrant['revokedAt'],
    });
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([revoked]),
      trust: makeTrust(),
    };
    const { event } = await writeEvent(
      { ...baseInput, kind: 'WarrantViolation' as const, payload: unsafeAssertUntainted({}) },
      { tenant, actor, config: { ...config, warrants }, spec: warrantSpec },
    );
    expect(event.kind).toBe('WarrantViolation');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips warrant check for WarrantClaimed events (recursion guard)', async () => {
    const { config, events } = makeInMemoryConfig();
    const revoked = makeSignedWarrant({
      revokedAt: '2026-05-15T00:00:00.000Z' as Warrant['revokedAt'],
    });
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([revoked]),
      trust: makeTrust(),
    };
    const { event } = await writeEvent(
      { ...baseInput, kind: 'WarrantClaimed' as const, payload: unsafeAssertUntainted({}) },
      { tenant, actor, config: { ...config, warrants }, spec: warrantSpec },
    );
    expect(event.kind).toBe('WarrantClaimed');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips warrant check for WarrantPresented events (recursion guard)', async () => {
    const { config, events } = makeInMemoryConfig();
    const revoked = makeSignedWarrant({
      revokedAt: '2026-05-15T00:00:00.000Z' as Warrant['revokedAt'],
    });
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([revoked]),
      trust: makeTrust(),
    };
    const { event } = await writeEvent(
      { ...baseInput, kind: 'WarrantPresented' as const, payload: unsafeAssertUntainted({}) },
      { tenant, actor, config: { ...config, warrants }, spec: warrantSpec },
    );
    expect(event.kind).toBe('WarrantPresented');
    expect(events.get(intentId)).toHaveLength(1);
  });

  // --- Multi-warrant short-circuit + status variants ---

  it('short-circuits on the first failing warrant (does not evaluate the rest)', async () => {
    const { config, events } = makeInMemoryConfig();
    const revoked = makeSignedWarrant({
      id: 'wt_revoked' as Warrant['id'],
      revokedAt: '2026-05-15T00:00:00.000Z' as Warrant['revokedAt'],
    });
    const expired = makeSignedWarrant({
      id: 'wt_expired' as Warrant['id'],
      issuedAt: '2025-01-01T00:00:00.000Z' as Warrant['issuedAt'],
      expiresAt: '2025-06-01T00:00:00.000Z' as Warrant['expiresAt'],
    });
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([revoked, expired]),
      trust: makeTrust(),
    };
    await expect(
      writeEvent(baseInput, { tenant, actor, config: { ...config, warrants }, spec: warrantSpec }),
    ).rejects.toMatchObject({ warrantId: 'wt_revoked', status: 'revoked' });
    const chain = events.get(intentId) ?? [];
    expect(chain).toHaveLength(1);
    expect((chain[0]!.payload as { warrantId: string }).warrantId).toBe('wt_revoked');
  });

  it('continues past a valid warrant to evaluate the next (loop iteration)', async () => {
    const { config, events } = makeInMemoryConfig();
    const valid = makeSignedWarrant({ id: 'wt_ok' as Warrant['id'] });
    const revoked = makeSignedWarrant({
      id: 'wt_bad' as Warrant['id'],
      revokedAt: '2026-05-15T00:00:00.000Z' as Warrant['revokedAt'],
    });
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([valid, revoked]),
      trust: makeTrust(),
    };
    await expect(
      writeEvent(baseInput, { tenant, actor, config: { ...config, warrants }, spec: warrantSpec }),
    ).rejects.toMatchObject({ warrantId: 'wt_bad', status: 'revoked' });
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('reports status=expired when warrant is past its expiresAt', async () => {
    const { config } = makeInMemoryConfig();
    const expired = makeSignedWarrant({
      issuedAt: '2025-01-01T00:00:00.000Z' as Warrant['issuedAt'],
      expiresAt: '2025-06-01T00:00:00.000Z' as Warrant['expiresAt'],
    });
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([expired]),
      trust: makeTrust(),
    };
    await expect(
      writeEvent(baseInput, { tenant, actor, config: { ...config, warrants }, spec: warrantSpec }),
    ).rejects.toMatchObject({ code: 'warrant-violation', status: 'expired' });
  });

  it('reports status=out-of-scope when warrant scope does not cover the spec', async () => {
    const { config } = makeInMemoryConfig();
    const otherKey = b<string, 'IntentKey'>('OtherSpec') as IntentKey;
    const outOfScope = makeSignedWarrant({
      scope: { specs: [otherKey as unknown as Warrant['scope']['specs'][0]] },
    });
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([outOfScope]),
      trust: makeTrust(),
    };
    await expect(
      writeEvent(baseInput, { tenant, actor, config: { ...config, warrants }, spec: warrantSpec }),
    ).rejects.toMatchObject({ code: 'warrant-violation', status: 'out-of-scope' });
  });

  // --- WarrantViolation event structure (kills mutants in appendWarrantViolationEvent) ---

  it('WarrantViolation event has correct shape: kind, version, prevHash, payload fields', async () => {
    const { config, events } = makeInMemoryConfig();
    const revoked = makeSignedWarrant({
      revokedAt: '2026-05-15T00:00:00.000Z' as Warrant['revokedAt'],
      revocationReason: 'audit failed',
    });
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([revoked]),
      trust: makeTrust(),
    };
    await expect(
      writeEvent(baseInput, { tenant, actor, config: { ...config, warrants }, spec: warrantSpec }),
    ).rejects.toBeInstanceOf(WarrantViolationError);

    const chain = events.get(intentId) ?? [];
    const violation = chain[0]!;
    expect(violation.kind).toBe('WarrantViolation');
    expect(violation.version).toBe(0);
    expect(violation.prevHash).toBe(null);
    expect(violation.tenantId).toBe(tenant.id);
    expect(violation.intentId).toBe(intentId);
    expect(violation.lawfulBasis).toBe('contract');
    expect(violation.purpose).toBe(purpose);
    expect(violation.actor.id).toBe(actor.id);
    expect(violation.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(violation.contentHash).toMatch(/^[A-Za-z0-9_-]+$/);
    const payload = violation.payload as {
      issuerId: string;
      issuerKind: string;
      checkpoint: string;
    };
    expect(payload.issuerId).toBe('is_test');
    expect(payload.issuerKind).toBe('self');
    expect(payload.checkpoint).toBe('pre');
  });

  it('WarrantViolation event version increments correctly when chain is non-empty', async () => {
    const { config, events } = makeInMemoryConfig();
    await writeEvent(baseInput, { tenant, actor, config, spec: warrantSpec });
    const revoked = makeSignedWarrant({
      revokedAt: '2026-05-15T00:00:00.000Z' as Warrant['revokedAt'],
    });
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([revoked]),
      trust: makeTrust(),
    };
    await expect(
      writeEvent(baseInput, { tenant, actor, config: { ...config, warrants }, spec: warrantSpec }),
    ).rejects.toBeInstanceOf(WarrantViolationError);
    const chain = events.get(intentId)!;
    expect(chain).toHaveLength(2);
    expect(chain[1]!.kind).toBe('WarrantViolation');
    expect(chain[1]!.version).toBe(1);
    expect(chain[1]!.prevHash).toBe(chain[0]!.contentHash);
  });

  it('uses provided revocationReason as the WarrantViolation payload.reason (not the fallback)', async () => {
    const { config, events } = makeInMemoryConfig();
    const revoked = makeSignedWarrant({
      revokedAt: '2026-05-15T00:00:00.000Z' as Warrant['revokedAt'],
      revocationReason: 'specific custom reason',
    });
    const warrants: TallysealWarrantsConfig = {
      store: makeStore([revoked]),
      trust: makeTrust(),
    };
    await expect(
      writeEvent(baseInput, { tenant, actor, config: { ...config, warrants }, spec: warrantSpec }),
    ).rejects.toBeInstanceOf(WarrantViolationError);
    const violation = events.get(intentId)![0]!;
    const payload = violation.payload as { reason: string };
    expect(payload.reason).toBe('specific custom reason');
    expect(payload.reason).not.toMatch(/failed pre check with status/);
  });
});

// ============== Disclosure primitive #11 — writeEvent integration ==============

describe('writeEvent — Disclosure pre-check (primitive #11)', () => {
  // Re-import inside this describe to keep test-fixture concerns local
  // to the Disclosure suite (paralleling the Warrant block above).
  const SUBJECT_A = b<string, 'SubjectId'>('sub_alice') as Disclosure['subject'];
  const REQ_AI = b<string, 'DisclosureRequirementId'>(
    'ai-act-art-50-ai-interaction',
  ) as DisclosureRequirement['id'];

  const requirementOnce: DisclosureRequirement = {
    id: REQ_AI,
    regulation: {
      framework: 'eu-ai-act',
      article: 'Art. 50',
      version: b<string, 'RegulationVersion'>('eu-ai-act@2026-Q2') as RegulationVersion,
    },
    mustAcknowledge: false,
    recurrence: 'once-per-subject',
  };

  const requirementMustAck: DisclosureRequirement = {
    ...requirementOnce,
    mustAcknowledge: true,
  };

  const requirementAnnual: DisclosureRequirement = {
    ...requirementOnce,
    recurrence: 'annual',
  };

  const disclosureSpec = defineCrawcusSpec({
    key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
    projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
    version: 1,
    fields: { x: field.string().required() },
    readiness: () => true,
    disclosureRequirements: [requirementOnce],
  });

  const disclosureSpecMustAck = defineCrawcusSpec({
    key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
    projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
    version: 1,
    fields: { x: field.string().required() },
    readiness: () => true,
    disclosureRequirements: [requirementMustAck],
  });

  const disclosureSpecAnnual = defineCrawcusSpec({
    key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
    projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
    version: 1,
    fields: { x: field.string().required() },
    readiness: () => true,
    disclosureRequirements: [requirementAnnual],
  });

  const makeDisclosure = (overrides: Partial<Disclosure> = {}): Disclosure => ({
    id: b<string, 'DisclosureId'>('disc_001') as Disclosure['id'],
    tenantId: tenant.id as unknown as Disclosure['tenantId'],
    subject: SUBJECT_A,
    requirementId: REQ_AI,
    content: {
      text: 'You are interacting with an AI system.',
      format: 'text',
      locale: 'en',
    },
    contentHash: b<string, 'ContentHash'>('h_abc') as Disclosure['contentHash'],
    deliveredAt: b<string, 'Timestamp'>('2026-05-01T00:00:00.000Z') as Disclosure['deliveredAt'],
    deliveryMethod: 'in-app',
    acknowledgedAt: null,
    retractedAt: null,
    ...overrides,
  });

  const makeDisclosureStore = (disclosures: readonly Disclosure[]): DisclosureStorePort => ({
    async byId(_tenantId, disclosureId) {
      return disclosures.find((d) => d.id === disclosureId) ?? null;
    },
    async forSubjectAndRequirements(_tenantId, subject, requirementIds) {
      return disclosures.filter(
        (d) => d.subject === subject && requirementIds.includes(d.requirementId),
      );
    },
  });

  const baseDisclosureInput = {
    intentId,
    kind: 'CapturedTurn' as const,
    payload: unsafeAssertUntainted({ x: 'hello' }),
    lawfulBasis: 'contract' as const,
    purpose,
    dataSubjectIds: [SUBJECT_A] as readonly SubjectId[],
  };

  it('succeeds when a valid Disclosure exists for the subject + requirement', async () => {
    const { config, events } = makeInMemoryConfig();
    const disclosures: TallysealDisclosuresConfig = {
      store: makeDisclosureStore([makeDisclosure()]),
    };
    const { event } = await writeEvent(baseDisclosureInput, {
      tenant,
      actor,
      config: { ...config, disclosures },
      spec: disclosureSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('throws DisclosureRequiredError and emits DisclosureRequired event when no Disclosure exists', async () => {
    const { config, events } = makeInMemoryConfig();
    const disclosures: TallysealDisclosuresConfig = {
      store: makeDisclosureStore([]),
    };
    const err = await writeEvent(baseDisclosureInput, {
      tenant,
      actor,
      config: { ...config, disclosures },
      spec: disclosureSpec,
    }).then(
      () => {
        throw new Error('expected throw did not happen');
      },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DisclosureRequiredError);
    const dre = err as DisclosureRequiredError;
    expect(dre.checkpoint).toBe('pre');
    expect(dre.requirementId).toBe(REQ_AI);
    expect(dre.subject).toBe(SUBJECT_A);
    expect(dre.status).toBe('undelivered');
    expect(dre.message).toMatch(/failed at checkpoint 'pre'/);
    expect(dre.message).toMatch(/status=undelivered/);

    // The DisclosureRequired event landed on the chain (in its own tx)
    // even though the main writeEvent flow threw + rolled back.
    const chain = events.get(intentId) ?? [];
    expect(chain).toHaveLength(1);
    expect(chain[0]!.kind).toBe('DisclosureRequired');
    const payload = chain[0]!.payload as {
      requirementId: string;
      subject: string;
      status: string;
      specKey: string;
    };
    expect(payload.requirementId).toBe(REQ_AI);
    expect(payload.subject).toBe(SUBJECT_A);
    expect(payload.status).toBe('undelivered');
    expect(payload.specKey).toBe('TestIntent');
  });

  it('throws status=retracted when most-recent Disclosure was retracted', async () => {
    const { config } = makeInMemoryConfig();
    const disclosures: TallysealDisclosuresConfig = {
      store: makeDisclosureStore([
        makeDisclosure({
          retractedAt: b<string, 'Timestamp'>(
            '2026-05-15T00:00:00.000Z',
          ) as Disclosure['retractedAt'],
        }),
      ]),
    };
    await expect(
      writeEvent(baseDisclosureInput, {
        tenant,
        actor,
        config: { ...config, disclosures },
        spec: disclosureSpec,
      }),
    ).rejects.toMatchObject({ code: 'disclosure-required', status: 'retracted' });
  });

  it('throws status=unacknowledged when mustAcknowledge=true and delivery has null acknowledgedAt', async () => {
    const { config } = makeInMemoryConfig();
    const disclosures: TallysealDisclosuresConfig = {
      store: makeDisclosureStore([makeDisclosure()]), // acknowledgedAt: null
    };
    await expect(
      writeEvent(baseDisclosureInput, {
        tenant,
        actor,
        config: { ...config, disclosures },
        spec: disclosureSpecMustAck,
      }),
    ).rejects.toMatchObject({ code: 'disclosure-required', status: 'unacknowledged' });
  });

  it('throws status=expired-window when annual delivery is >365 days old', async () => {
    const { config } = makeInMemoryConfig();
    const disclosures: TallysealDisclosuresConfig = {
      store: makeDisclosureStore([
        makeDisclosure({
          deliveredAt: b<string, 'Timestamp'>(
            '2024-01-01T00:00:00.000Z',
          ) as Disclosure['deliveredAt'],
        }),
      ]),
    };
    await expect(
      writeEvent(baseDisclosureInput, {
        tenant,
        actor,
        config: { ...config, disclosures },
        spec: disclosureSpecAnnual,
      }),
    ).rejects.toMatchObject({ code: 'disclosure-required', status: 'expired-window' });
  });

  it('skips Disclosure check when spec has no disclosureRequirements', async () => {
    const { config, events } = makeInMemoryConfig();
    // Spec without disclosureRequirements — Disclosure store would
    // reject any event but the runtime short-circuits and proceeds.
    const noReqsSpec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
      projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
    });
    const disclosures: TallysealDisclosuresConfig = {
      store: makeDisclosureStore([]),
    };
    const { event } = await writeEvent(baseDisclosureInput, {
      tenant,
      actor,
      config: { ...config, disclosures },
      spec: noReqsSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Disclosure check when input has zero data subjects', async () => {
    const { config, events } = makeInMemoryConfig();
    const disclosures: TallysealDisclosuresConfig = {
      store: makeDisclosureStore([]), // would otherwise force undelivered
    };
    const { event } = await writeEvent(
      { ...baseDisclosureInput, dataSubjectIds: [] },
      {
        tenant,
        actor,
        config: { ...config, disclosures },
        spec: disclosureSpec,
      },
    );
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Disclosure check for DisclosureDelivered events (recursion guard)', async () => {
    const { config, events } = makeInMemoryConfig();
    const disclosures: TallysealDisclosuresConfig = {
      store: makeDisclosureStore([]),
    };
    const { event } = await writeEvent(
      { ...baseDisclosureInput, kind: 'DisclosureDelivered' as const },
      {
        tenant,
        actor,
        config: { ...config, disclosures },
        spec: disclosureSpec,
      },
    );
    expect(event.kind).toBe('DisclosureDelivered');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Disclosure check for DisclosureAcknowledged events (recursion guard)', async () => {
    const { config, events } = makeInMemoryConfig();
    const disclosures: TallysealDisclosuresConfig = {
      store: makeDisclosureStore([]),
    };
    const { event } = await writeEvent(
      { ...baseDisclosureInput, kind: 'DisclosureAcknowledged' as const },
      {
        tenant,
        actor,
        config: { ...config, disclosures },
        spec: disclosureSpec,
      },
    );
    expect(event.kind).toBe('DisclosureAcknowledged');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Disclosure check when ctx.config.disclosures is absent', async () => {
    const { config, events } = makeInMemoryConfig();
    // No disclosures config — runtime should behave exactly like
    // disclosure-free mode regardless of spec.disclosureRequirements.
    const { event } = await writeEvent(baseDisclosureInput, {
      tenant,
      actor,
      config,
      spec: disclosureSpec,
    });
    expect(event.version).toBe(0);
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('fails on the first subject when multiple subjects are missing disclosures (short-circuit)', async () => {
    const { config, events } = makeInMemoryConfig();
    const SUBJECT_B = b<string, 'SubjectId'>('sub_bob') as SubjectId;
    const disclosures: TallysealDisclosuresConfig = {
      store: makeDisclosureStore([]),
    };
    await expect(
      writeEvent(
        { ...baseDisclosureInput, dataSubjectIds: [SUBJECT_A, SUBJECT_B] },
        {
          tenant,
          actor,
          config: { ...config, disclosures },
          spec: disclosureSpec,
        },
      ),
    ).rejects.toMatchObject({ code: 'disclosure-required', subject: SUBJECT_A });
    // Only one violation event landed (for the first failing subject)
    const chain = events.get(intentId) ?? [];
    expect(chain).toHaveLength(1);
  });
});

// ============== Consent primitive #12 — writeEvent integration ==============

describe('writeEvent — Consent pre-check (primitive #12, Q-CR6 LOCKED)', () => {
  const SUBJECT_A = b<string, 'SubjectId'>('sub_alice') as Consent['subject'];
  const REQ_AI = b<string, 'ConsentRequirementId'>(
    'gdpr-art-7-ai-training',
  ) as ConsentRequirement['id'];
  const PURPOSE_AI = b<string, 'ProcessingPurpose'>('ai-training') as ProcessingPurpose;

  const GDPR_ART_7: ConsentRequirement['regulation'] = {
    regulation: b<string, 'RegulationVersion'>('gdpr@2025-Q1') as RegulationVersion,
    article: 'Art. 7',
  };

  const consentRequirement: ConsentRequirement = {
    id: REQ_AI,
    regulation: GDPR_ART_7,
    purposes: [PURPOSE_AI],
    mustBeActive: true,
  };

  const consentSpec = defineCrawcusSpec({
    key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
    projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
    version: 1,
    fields: { x: field.string().required() },
    readiness: () => true,
    consentRequirements: [consentRequirement],
  });

  const makeConsent = (overrides: Partial<Consent> = {}): Consent => ({
    id: b<string, 'ConsentId'>('cs_001') as Consent['id'],
    tenantId: tenant.id as unknown as Consent['tenantId'],
    subject: SUBJECT_A,
    grantor: SUBJECT_A as unknown as Consent['grantor'],
    requirementId: REQ_AI,
    purposes: [PURPOSE_AI],
    regulation: GDPR_ART_7,
    grantedAt: b<string, 'Timestamp'>('2026-05-01T00:00:00.000Z') as Consent['grantedAt'],
    withdrawnAt: null,
    withdrawalMethod: null,
    receipt: {
      version: '1.1',
      jurisdiction: 'EU',
      consentStatement: 'I authorize AI training use of my data.',
      locale: 'en',
      contentHash: b<string, 'ContentHash'>('h_receipt') as Consent['receipt']['contentHash'],
    },
    ...overrides,
  });

  const makeConsentStore = (consents: readonly Consent[]): ConsentStorePort => ({
    async byId(_tenantId, consentId) {
      return consents.find((c) => c.id === consentId) ?? null;
    },
    async forSubjectAndRequirements(_tenantId, subject, requirementIds) {
      return consents.filter(
        (c) => c.subject === subject && requirementIds.includes(c.requirementId),
      );
    },
  });

  // The test config maps the event 'test' purpose to ProcessingPurpose 'ai-training'.
  const consentConfig = (consents: readonly Consent[]): TallysealConsentConfig => ({
    store: makeConsentStore(consents),
    processingPurposeFor: new Map([[purpose as unknown as string, PURPOSE_AI]]),
  });

  const baseConsentInput = {
    intentId,
    kind: 'CapturedTurn' as const,
    payload: unsafeAssertUntainted({ x: 'hello' }),
    lawfulBasis: 'contract' as const,
    purpose,
    dataSubjectIds: [SUBJECT_A] as readonly SubjectId[],
  };

  it('succeeds when a valid active Consent covers the processing purpose', async () => {
    const { config, events } = makeInMemoryConfig();
    const consents = consentConfig([makeConsent()]);
    const { event } = await writeEvent(baseConsentInput, {
      tenant,
      actor,
      config: { ...config, consents },
      spec: consentSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('throws ConsentInvalidError + emits ConsentRequired event when no Consent exists', async () => {
    const { config, events } = makeInMemoryConfig();
    const consents = consentConfig([]);
    const err = await writeEvent(baseConsentInput, {
      tenant,
      actor,
      config: { ...config, consents },
      spec: consentSpec,
    }).then(
      () => {
        throw new Error('expected throw did not happen');
      },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ConsentInvalidError);
    const cie = err as ConsentInvalidError;
    expect(cie.code).toBe('consent-invalid');
    expect(cie.requirementId).toBe(REQ_AI);
    expect(cie.subject).toBe(SUBJECT_A);
    expect(cie.processingPurpose).toBe(PURPOSE_AI);
    expect(cie.status).toBe('missing');
    expect(cie.checkpoint).toBe('pre');
    expect(cie.message).toMatch(/failed at checkpoint 'pre'/);
    expect(cie.message).toMatch(/status=missing/);

    const chain = events.get(intentId) ?? [];
    expect(chain).toHaveLength(1);
    expect(chain[0]!.kind).toBe('ConsentRequired');
    const payload = chain[0]!.payload as {
      requirementId: string;
      subject: string;
      processingPurpose: string;
      status: string;
      specKey: string;
    };
    expect(payload.requirementId).toBe(REQ_AI);
    expect(payload.subject).toBe(SUBJECT_A);
    expect(payload.processingPurpose).toBe(PURPOSE_AI);
    expect(payload.status).toBe('missing');
    expect(payload.specKey).toBe('TestIntent');
  });

  it('throws status=withdrawn when most-recent Consent was withdrawn (GDPR Art 7(3))', async () => {
    const { config } = makeInMemoryConfig();
    const consents = consentConfig([
      makeConsent({
        withdrawnAt: b<string, 'Timestamp'>('2026-05-15T00:00:00.000Z') as Consent['withdrawnAt'],
        withdrawalMethod: 'data-subject-portal',
      }),
    ]);
    await expect(
      writeEvent(baseConsentInput, {
        tenant,
        actor,
        config: { ...config, consents },
        spec: consentSpec,
      }),
    ).rejects.toMatchObject({ code: 'consent-invalid', status: 'withdrawn' });
  });

  it('throws status=purpose-out-of-scope when Consent.purposes does not cover the event purpose', async () => {
    const { config } = makeInMemoryConfig();
    const OTHER = b<string, 'ProcessingPurpose'>('ad-targeting') as ProcessingPurpose;
    const consents: TallysealConsentConfig = {
      store: makeConsentStore([makeConsent({ purposes: [OTHER] })]),
      processingPurposeFor: new Map([[purpose as unknown as string, PURPOSE_AI]]),
    };
    await expect(
      writeEvent(baseConsentInput, {
        tenant,
        actor,
        config: { ...config, consents },
        spec: consentSpec,
      }),
    ).rejects.toMatchObject({ code: 'consent-invalid', status: 'purpose-out-of-scope' });
  });

  it('skips Consent check when spec has no consentRequirements', async () => {
    const { config, events } = makeInMemoryConfig();
    const noReqsSpec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
      projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
    });
    const consents = consentConfig([]);
    const { event } = await writeEvent(baseConsentInput, {
      tenant,
      actor,
      config: { ...config, consents },
      spec: noReqsSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Consent check when input has zero data subjects', async () => {
    const { config, events } = makeInMemoryConfig();
    const consents = consentConfig([]);
    const { event } = await writeEvent(
      { ...baseConsentInput, dataSubjectIds: [] },
      {
        tenant,
        actor,
        config: { ...config, consents },
        spec: consentSpec,
      },
    );
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Consent check for ConsentGranted events (recursion guard)', async () => {
    const { config, events } = makeInMemoryConfig();
    const consents = consentConfig([]);
    const { event } = await writeEvent(
      { ...baseConsentInput, kind: 'ConsentGranted' as const },
      {
        tenant,
        actor,
        config: { ...config, consents },
        spec: consentSpec,
      },
    );
    expect(event.kind).toBe('ConsentGranted');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Consent check for ConsentRevoked events (recursion guard)', async () => {
    const { config, events } = makeInMemoryConfig();
    const consents = consentConfig([]);
    const { event } = await writeEvent(
      { ...baseConsentInput, kind: 'ConsentRevoked' as const },
      {
        tenant,
        actor,
        config: { ...config, consents },
        spec: consentSpec,
      },
    );
    expect(event.kind).toBe('ConsentRevoked');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Consent check when ctx.config.consents is absent', async () => {
    const { config, events } = makeInMemoryConfig();
    // No consents config — runtime should behave like consent-free
    // mode regardless of spec.consentRequirements.
    const { event } = await writeEvent(baseConsentInput, {
      tenant,
      actor,
      config,
      spec: consentSpec,
    });
    expect(event.version).toBe(0);
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('uses processingPurposeFor map to resolve granular ProcessingPurpose', async () => {
    const { config } = makeInMemoryConfig();
    // Consent grants AI training; event purpose maps to AI training.
    // Without the map, input.purpose ('test') would be cast directly to
    // ProcessingPurpose and the consent would not cover it.
    const consents: TallysealConsentConfig = {
      store: makeConsentStore([makeConsent()]),
      processingPurposeFor: new Map([[purpose as unknown as string, PURPOSE_AI]]),
    };
    const { event } = await writeEvent(baseConsentInput, {
      tenant,
      actor,
      config: { ...config, consents },
      spec: consentSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
  });
});

// ============== Lineage primitive #13 — writeEvent integration ==============

describe('writeEvent — Lineage pre-check (primitive #13, Q-CR7 LOCKED)', () => {
  const modelIri = b<string, 'Iri'>('urn:crawcus:tn_demo:model:claude-sonnet-4-6') as Iri;
  const promptIri = b<string, 'Iri'>('urn:crawcus:tn_demo:plan:tpl_001') as Iri;
  const userMsgIri = b<string, 'Iri'>('urn:crawcus:tn_demo:entity:msg_42') as Iri;
  const outputIri = b<string, 'Iri'>('urn:crawcus:tn_demo:entity:out_001') as Iri;
  const activityIri = b<string, 'Iri'>('urn:crawcus:tn_demo:activity:run_001') as Iri;

  const lineageSpec = defineCrawcusSpec({
    key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
    projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
    version: 1,
    fields: { x: field.string().required() },
    readiness: () => true,
    lineageRequirement: { required: true },
  });

  const makeLineage = (overrides: Partial<Lineage> = {}): Lineage => {
    const inputs: LineageInput[] = [
      { id: promptIri, kind: 'event' },
      { id: userMsgIri, kind: 'user-message' },
    ];
    return {
      id: b<string, 'LineageId'>('ln_001') as Lineage['id'],
      tenantId: tenant.id as unknown as Lineage['tenantId'],
      outputEventId: 'evt_x' as Lineage['outputEventId'],
      affectedSubjects: ['sub_alice' as Lineage['affectedSubjects'][0]],
      inputs,
      model: {
        id: modelIri,
        provider: 'anthropic',
        name: 'claude-sonnet-4-6',
        version: '1.0',
      },
      promptTemplate: null,
      recordedAt: b<string, 'Timestamp'>('2026-05-22T14:00:00.000Z') as Lineage['recordedAt'],
      provO: {
        '@context': PROV_JSONLD_CONTEXT_URL,
        '@graph': [
          { '@id': modelIri, '@type': ['Agent', 'SoftwareAgent'] as const },
          { '@id': promptIri, '@type': ['Entity', 'Plan'] as const },
          { '@id': userMsgIri, '@type': 'Entity' as const },
          {
            '@id': activityIri,
            '@type': 'Activity' as const,
            used: [promptIri, userMsgIri],
            wasAssociatedWith: modelIri,
          },
          {
            '@id': outputIri,
            '@type': 'Entity' as const,
            wasGeneratedBy: activityIri,
          },
        ],
      },
      ...overrides,
    };
  };

  const makeLineageStore = (lineages: readonly Lineage[]): LineageStorePort => ({
    async byId(_tenantId, lineageId) {
      return lineages.find((l) => l.id === lineageId) ?? null;
    },
    async forIntent(_tenantId, _intentId) {
      return lineages;
    },
  });

  const baseAIInput = {
    intentId,
    kind: 'CapturedTurn' as const,
    payload: unsafeAssertUntainted({ x: 'hello' }),
    lawfulBasis: 'contract' as const,
    purpose,
    dataSubjectIds: [] as readonly SubjectId[],
    ai: {
      model: 'claude-sonnet-4-6',
      promptTemplateVersion: 'v1',
      inputHash: b<string, 'ContentHash'>('h_in') as never,
      outputHash: b<string, 'ContentHash'>('h_out') as never,
      latencyMs: 1200,
      tokensIn: 100,
      tokensOut: 50,
    } as never,
  };

  it('succeeds when a covering Lineage record exists for an AI-mediated event', async () => {
    const { config, events } = makeInMemoryConfig();
    const lineage: TallysealLineageConfig = {
      store: makeLineageStore([makeLineage()]),
    };
    const { event } = await writeEvent(baseAIInput, {
      tenant,
      actor,
      config: { ...config, lineage },
      spec: lineageSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('throws LineageInvalidError + emits LineageRequired event when no Lineage exists', async () => {
    const { config, events } = makeInMemoryConfig();
    const lineage: TallysealLineageConfig = {
      store: makeLineageStore([]),
    };
    const err = await writeEvent(baseAIInput, {
      tenant,
      actor,
      config: { ...config, lineage },
      spec: lineageSpec,
    }).then(
      () => {
        throw new Error('expected throw did not happen');
      },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(LineageInvalidError);
    const lie = err as LineageInvalidError;
    expect(lie.code).toBe('lineage-invalid');
    expect(lie.status).toBe('missing');
    expect(lie.checkpoint).toBe('pre');

    const chain = events.get(intentId) ?? [];
    expect(chain).toHaveLength(1);
    expect(chain[0]!.kind).toBe('LineageRequired');
    const payload = chain[0]!.payload as { status: string; specKey: string };
    expect(payload.status).toBe('missing');
    expect(payload.specKey).toBe('TestIntent');
  });

  it('skips Lineage check when event has no AI provenance', async () => {
    const { config, events } = makeInMemoryConfig();
    const lineage: TallysealLineageConfig = {
      store: makeLineageStore([]), // would otherwise force missing
    };
    // Strip ai from the input — non-AI event
    const nonAIInput = { ...baseAIInput };
    delete (nonAIInput as { ai?: unknown }).ai;
    const { event } = await writeEvent(nonAIInput, {
      tenant,
      actor,
      config: { ...config, lineage },
      spec: lineageSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Lineage check when spec has no lineageRequirement', async () => {
    const { config, events } = makeInMemoryConfig();
    const noReqsSpec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
      projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
    });
    const lineage: TallysealLineageConfig = {
      store: makeLineageStore([]),
    };
    const { event } = await writeEvent(baseAIInput, {
      tenant,
      actor,
      config: { ...config, lineage },
      spec: noReqsSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Lineage check for LineageRecorded events (recursion guard)', async () => {
    const { config, events } = makeInMemoryConfig();
    const lineage: TallysealLineageConfig = {
      store: makeLineageStore([]),
    };
    const { event } = await writeEvent(
      { ...baseAIInput, kind: 'LineageRecorded' as const },
      {
        tenant,
        actor,
        config: { ...config, lineage },
        spec: lineageSpec,
      },
    );
    expect(event.kind).toBe('LineageRecorded');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Lineage check when ctx.config.lineage is absent', async () => {
    const { config, events } = makeInMemoryConfig();
    // No lineage config → no check, even with spec.lineageRequirement.
    const { event } = await writeEvent(baseAIInput, {
      tenant,
      actor,
      config,
      spec: lineageSpec,
    });
    expect(event.version).toBe(0);
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('throws status=blank-node-forbidden when PROV-O graph has a node without explicit @id', async () => {
    const { config } = makeInMemoryConfig();
    const bad = makeLineage({
      provO: {
        '@context': PROV_JSONLD_CONTEXT_URL,
        '@graph': [
          { '@id': '' as Iri, '@type': 'Entity' }, // blank node
        ],
      },
    });
    const lineage: TallysealLineageConfig = {
      store: makeLineageStore([bad]),
    };
    await expect(
      writeEvent(baseAIInput, {
        tenant,
        actor,
        config: { ...config, lineage },
        spec: lineageSpec,
      }),
    ).rejects.toMatchObject({ code: 'lineage-invalid', status: 'blank-node-forbidden' });
  });

  it('throws status=insufficient-inputs when Lineage record has fewer inputs than required', async () => {
    const { config } = makeInMemoryConfig();
    const sparseLineage = makeLineage({ inputs: [{ id: promptIri, kind: 'event' }] });
    const strictSpec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
      projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      lineageRequirement: { required: true, minInputs: 3 },
    });
    const lineage: TallysealLineageConfig = {
      store: makeLineageStore([sparseLineage]),
    };
    await expect(
      writeEvent(baseAIInput, {
        tenant,
        actor,
        config: { ...config, lineage },
        spec: strictSpec,
      }),
    ).rejects.toMatchObject({ code: 'lineage-invalid', status: 'insufficient-inputs' });
  });
});

// ============== HumanOversight primitive #14 — writeEvent integration ==============

describe('writeEvent — HumanOversight pre-check (primitive #14, Q-CR8 LOCKED)', () => {
  const REQ_ART14 = b<string, 'OversightRequirementId'>(
    'ai-act-art-14-periodic',
  ) as OversightRequirement['id'];

  const AI_ACT_ART_14: OversightRequirement['regulation'] = {
    regulation: b<string, 'RegulationVersion'>('eu-ai-act@2026-Q2') as RegulationVersion,
    article: 'Art. 14',
  };

  const requirement: OversightRequirement = {
    id: REQ_ART14,
    regulation: AI_ACT_ART_14,
    acceptedRoles: ['individual', 'committee'],
    mode: 'on-loop',
    maxGapDays: 90,
  };

  const oversightSpec = defineCrawcusSpec({
    key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
    projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
    version: 1,
    fields: { x: field.string().required() },
    readiness: () => true,
    oversightRequirements: [requirement],
  });

  const makeOversight = (overrides: Partial<HumanOversight> = {}): HumanOversight => ({
    id: b<string, 'OversightId'>('ov_001') as HumanOversight['id'],
    tenantId: tenant.id as unknown as HumanOversight['tenantId'],
    requirementId: REQ_ART14,
    overseer: {
      id: b<string, 'ActorId'>('ac_chair') as OverseerRef['id'],
      role: 'individual',
      orgId: b<string, 'OrgId'>('org_dpo') as OrgId,
      name: 'Dr. DPO Chair',
    },
    scope: {
      kind: 'period',
      from: b<string, 'Timestamp'>('2026-04-01T00:00:00.000Z') as HumanOversight['conductedAt'],
      to: b<string, 'Timestamp'>('2026-05-01T00:00:00.000Z') as HumanOversight['conductedAt'],
    },
    mode: 'on-loop',
    conductedAt: b<string, 'Timestamp'>(
      '2026-05-01T00:00:00.000Z',
    ) as HumanOversight['conductedAt'],
    outcome: 'signed-off',
    findings: [],
    regulation: AI_ACT_ART_14,
    ...overrides,
  });

  const makeOversightStore = (records: readonly HumanOversight[]): OversightStorePort => ({
    async byId(_tenantId, oversightId) {
      return records.find((o) => o.id === oversightId) ?? null;
    },
    async forRequirement(_tenantId, requirementId) {
      return records.filter((o) => o.requirementId === requirementId);
    },
  });

  const baseOversightInput = {
    intentId,
    kind: 'CapturedTurn' as const,
    payload: unsafeAssertUntainted({ x: 'hello' }),
    lawfulBasis: 'contract' as const,
    purpose,
    dataSubjectIds: [] as readonly SubjectId[],
  };

  it('succeeds when a valid signed-off oversight exists', async () => {
    const { config, events } = makeInMemoryConfig();
    const oversight: TallysealOversightConfig = {
      store: makeOversightStore([makeOversight()]),
    };
    const { event } = await writeEvent(baseOversightInput, {
      tenant,
      actor,
      config: { ...config, oversight },
      spec: oversightSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('throws OversightInvalidError + emits OversightRequired event when no record exists', async () => {
    const { config, events } = makeInMemoryConfig();
    const oversight: TallysealOversightConfig = {
      store: makeOversightStore([]),
    };
    const err = await writeEvent(baseOversightInput, {
      tenant,
      actor,
      config: { ...config, oversight },
      spec: oversightSpec,
    }).then(
      () => {
        throw new Error('expected throw did not happen');
      },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(OversightInvalidError);
    const oie = err as OversightInvalidError;
    expect(oie.code).toBe('oversight-invalid');
    expect(oie.requirementId).toBe(REQ_ART14);
    expect(oie.status).toBe('missing');
    expect(oie.checkpoint).toBe('pre');

    const chain = events.get(intentId) ?? [];
    expect(chain).toHaveLength(1);
    expect(chain[0]!.kind).toBe('OversightRequired');
    const payload = chain[0]!.payload as { requirementId: string; status: string; specKey: string };
    expect(payload.requirementId).toBe(REQ_ART14);
    expect(payload.status).toBe('missing');
    expect(payload.specKey).toBe('TestIntent');
  });

  it('throws status=escalated when most-recent oversight outcome is escalated', async () => {
    const { config } = makeInMemoryConfig();
    const oversight: TallysealOversightConfig = {
      store: makeOversightStore([makeOversight({ outcome: 'escalated' })]),
    };
    await expect(
      writeEvent(baseOversightInput, {
        tenant,
        actor,
        config: { ...config, oversight },
        spec: oversightSpec,
      }),
    ).rejects.toMatchObject({ code: 'oversight-invalid', status: 'escalated' });
  });

  it('throws status=role-not-accepted when overseer role is not in acceptedRoles', async () => {
    const { config } = makeInMemoryConfig();
    const strictSpec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
      projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      oversightRequirements: [
        {
          ...requirement,
          acceptedRoles: ['committee'], // individual not accepted
        },
      ],
    });
    const oversight: TallysealOversightConfig = {
      store: makeOversightStore([makeOversight()]), // overseer role is 'individual'
    };
    await expect(
      writeEvent(baseOversightInput, {
        tenant,
        actor,
        config: { ...config, oversight },
        spec: strictSpec,
      }),
    ).rejects.toMatchObject({ code: 'oversight-invalid', status: 'role-not-accepted' });
  });

  it('throws status=expired-gap when conductedAt is older than maxGapDays', async () => {
    const { config } = makeInMemoryConfig();
    const strictSpec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
      projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
      oversightRequirements: [{ ...requirement, maxGapDays: 1 }],
    });
    const oversight: TallysealOversightConfig = {
      store: makeOversightStore([
        makeOversight({
          conductedAt: b<string, 'Timestamp'>(
            '2020-01-01T00:00:00.000Z',
          ) as HumanOversight['conductedAt'],
        }),
      ]),
    };
    await expect(
      writeEvent(baseOversightInput, {
        tenant,
        actor,
        config: { ...config, oversight },
        spec: strictSpec,
      }),
    ).rejects.toMatchObject({ code: 'oversight-invalid', status: 'expired-gap' });
  });

  it('skips Oversight check when spec has no oversightRequirements', async () => {
    const { config, events } = makeInMemoryConfig();
    const noReqsSpec = defineCrawcusSpec({
      key: b<string, 'IntentKey'>('TestIntent') as IntentKey,
      projection: b<string, 'ProjectionName'>('Test') as ProjectionName,
      version: 1,
      fields: { x: field.string().required() },
      readiness: () => true,
    });
    const oversight: TallysealOversightConfig = {
      store: makeOversightStore([]),
    };
    const { event } = await writeEvent(baseOversightInput, {
      tenant,
      actor,
      config: { ...config, oversight },
      spec: noReqsSpec,
    });
    expect(event.kind).toBe('CapturedTurn');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Oversight check for OversightConducted events (recursion guard)', async () => {
    const { config, events } = makeInMemoryConfig();
    const oversight: TallysealOversightConfig = {
      store: makeOversightStore([]),
    };
    const { event } = await writeEvent(
      { ...baseOversightInput, kind: 'OversightConducted' as const },
      {
        tenant,
        actor,
        config: { ...config, oversight },
        spec: oversightSpec,
      },
    );
    expect(event.kind).toBe('OversightConducted');
    expect(events.get(intentId)).toHaveLength(1);
  });

  it('skips Oversight check when ctx.config.oversight is absent', async () => {
    const { config, events } = makeInMemoryConfig();
    const { event } = await writeEvent(baseOversightInput, {
      tenant,
      actor,
      config,
      spec: oversightSpec,
    });
    expect(event.version).toBe(0);
    expect(events.get(intentId)).toHaveLength(1);
  });
});
