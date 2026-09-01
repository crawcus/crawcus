/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * # hash-chain.fixture.ts
 *
 * TCK fixture that any CRAWCUS-conformant runtime's EventStore
 * implementation must satisfy for the hash-chain primitive
 * (`@crawcus/spec` `computeContentHash` + `verifyChain` +
 * `GENESIS_PREV_HASH`).
 *
 * **Why this exists.** HF's PrismaEventStore migration (Epic #1338,
 * Slice 2 / #1343) needs a 5-minute pass/fail conformance test against
 * any host EventStore — not reverse-engineered against the in-memory
 * reference store. The fixture pins a deterministic golden 5-event
 * sequence, computes the expected `contentHash` for each via the
 * canonical primitives (`computeContentHash`), then drives the
 * candidate store with `appendEvent` + `readChain` and asserts:
 *
 *   1. Every read-back event's `contentHash` matches the deterministic
 *      expected value (no in-flight tampering by the store).
 *   2. `verifyChain(events).valid === true` (genesis sentinel +
 *      prevHash linkage + recompute equivalence all pass).
 *   3. Read order matches write order (stores MUST preserve the
 *      append sequence — read-back reordering breaks audit-bundle
 *      reproducibility).
 *
 * **Why a programmatic builder, not a static JSON fixture.** A static
 * file would freeze hashes against the current `@noble/hashes` +
 * `canonicalize` versions rather than against the spec contract
 * (RFC 8785 canonical JSON → SHA-256). Computing expected hashes at
 * fixture-build time means the fixture tracks the spec, not its
 * current implementation; any future legitimate upgrade of the hash
 * pipeline produces a new (still-deterministic) golden set without a
 * test-data churn.
 *
 * **EventKind choice.** The ticket spec called for `SourceCaptured`,
 * `CapturedTurn`, `ProjectionCommit` — all three are present in
 * `SYSTEM_EVENT_KINDS` as of crawcus-spec v0.5.x. The chosen sequence
 * is documented inline in `buildGoldenSequence`. If a future spec
 * revision removes any of these, the fixture's builder MUST be updated
 * to pick the closest available kinds — the contract is hash-chain
 * integrity, not the specific kinds used.
 *
 * Spec sources:
 *   - `packages/crawcus-spec/src/event/hash-chain.ts` —
 *     `computeContentHash`, `verifyChain`, `GENESIS_PREV_HASH`
 *   - `packages/crawcus-spec/src/event/canonical-json.ts` —
 *     RFC 8785 canonical JSON wrapper
 *   - `00-canon/architecture-primitives.md` §4 (compliance-by-design
 *     hash chain) + NFR D2 (tamper detection)
 *   - `08-design-partner/hf-feedback-prisma-event-store-hash-chain-20260608.md`
 *     (originating HF feedback)
 *   - `08-design-partner/hf-reply-prereqs-prisma-event-store-hash-chain-20260608.md`
 *     §Ask 2 commitment
 *   - `09-operating/tkt-tck-hash-chain-fixture-spec.md` (this ticket)
 */

import {
  computeContentHash,
  verifyChain,
  GENESIS_PREV_HASH,
  type ContentHash,
  type Event,
  type EventId,
  type IntentId,
  type SubjectId,
  type TenantId,
  type Purpose,
  type Actor,
  type SystemEventKind,
} from '@crawcus/spec';
import type { TckResult } from './result.js';
import { TCK_RESULT_PASS } from './result.js';

// ============ Public surface ============

/**
 * Minimal store surface the contract test drives. The host's
 * `PrismaEventStore` (or any other `EventStore` adapter) implements
 * this. Deliberately smaller than the full `/core`
 * `EventStore` port — the TCK only needs `appendEvent` + `readChain`
 * to verify the chain. Adapters that already implement the wider port
 * can pass `this` straight through.
 */
export interface HashChainContractStore {
  /**
   * Persist `event` exactly as supplied. Implementations MUST NOT
   * mutate `contentHash`, `prevHash`, `payload`, or any other field —
   * the chain is verified by recomputing the hash from the stored
   * fields, so any silent transformation will fail the contract.
   */
  appendEvent(event: Event): Promise<Event>;
  /**
   * Return every event previously appended for `intentId`, in append
   * order. Stores that reorder events (e.g., by timestamp) will fail
   * the prevHash-linkage assertion.
   */
  readChain(intentId: IntentId): Promise<readonly Event[]>;
}

/** Inputs for one `runHashChainContract` invocation. */
export interface HashChainContractEnv {
  /** Returns a fresh, empty store instance per test run. */
  readonly storeFactory: () => HashChainContractStore;
  /** Intent ID used by the golden sequence. */
  readonly intentId: IntentId;
}

// ============ Golden sequence builder ============

/**
 * Stable values used to build the golden sequence. Fixed here so that
 * the canonical-JSON serialisation is byte-identical on every run —
 * any change to these constants will change the resulting hashes.
 */
const GOLDEN_TENANT_ID = 'tck-tenant' as TenantId;
const GOLDEN_SUBJECT_ID = 'tck-subject' as SubjectId;
const GOLDEN_PURPOSE = 'tck' as Purpose;
const GOLDEN_ACTOR: Actor = { kind: 'human', id: 'tck-subject' as Actor['id'] };

/** Fixed UTC instants — one per event, monotonically increasing. */
const GOLDEN_TIMESTAMPS: readonly Date[] = [
  new Date('2026-01-01T00:00:00.000Z'),
  new Date('2026-01-01T00:00:01.000Z'),
  new Date('2026-01-01T00:00:02.000Z'),
  new Date('2026-01-01T00:00:03.000Z'),
  new Date('2026-01-01T00:00:04.000Z'),
];

/**
 * The five-step kind sequence used by the golden fixture. Capture →
 * three turns → projection-commit — a realistic-shaped chain that
 * exercises three distinct system event kinds without depending on
 * any sector-specific payload schema.
 */
const GOLDEN_KINDS: readonly SystemEventKind[] = [
  'SourceCaptured',
  'CapturedTurn',
  'CapturedTurn',
  'CapturedTurn',
  'ProjectionCommit',
];

/**
 * Fixed per-step payloads. JSON values only (Date instances would be
 * normalised by `normaliseForCanonical`; we use ISO strings directly
 * so the payload is byte-identical to its on-the-wire representation).
 */
const GOLDEN_PAYLOADS: readonly Record<string, unknown>[] = [
  { source: 'tck-golden-source', capturedAt: '2026-01-01T00:00:00.000Z' },
  { role: 'user', text: 'golden turn 1', at: '2026-01-01T00:00:01.000Z' },
  { role: 'assistant', text: 'golden turn 2', at: '2026-01-01T00:00:02.000Z' },
  { role: 'user', text: 'golden turn 3', at: '2026-01-01T00:00:03.000Z' },
  { projection: 'tck-golden-projection', committedAt: '2026-01-01T00:00:04.000Z' },
];

/** Stable per-step event IDs (UUIDv7 convention recommends sortable; */
/** these are fixed strings since the contract does not hash the ID). */
const GOLDEN_EVENT_IDS: readonly EventId[] = [
  'tck-evt-0' as EventId,
  'tck-evt-1' as EventId,
  'tck-evt-2' as EventId,
  'tck-evt-3' as EventId,
  'tck-evt-4' as EventId,
];

/**
 * Build the deterministic golden 5-event sequence for `intentId`.
 *
 * Each event's `prevHash` is the prior event's `contentHash`; the
 * genesis event uses `GENESIS_PREV_HASH` (null). Each event's
 * `contentHash` is computed via `computeContentHash` — i.e. the
 * canonical-JSON SHA-256 of every field except `id` + `contentHash`.
 *
 * The five steps:
 *
 * | # | Kind              | Notes                              |
 * |---|-------------------|-------------------------------------|
 * | 0 | `SourceCaptured`  | Genesis — `prevHash = null`        |
 * | 1 | `CapturedTurn`    | user turn                          |
 * | 2 | `CapturedTurn`    | assistant turn                     |
 * | 3 | `CapturedTurn`    | user turn                          |
 * | 4 | `ProjectionCommit`| Realistic terminator               |
 *
 * Exported for harnesses that want to inspect / log the input before
 * driving their store — the conformance test itself calls it
 * internally.
 */
export function buildGoldenSequence(intentId: IntentId): readonly Event[] {
  const events: Event[] = [];
  for (const [i, kind] of GOLDEN_KINDS.entries()) {
    const timestamp = GOLDEN_TIMESTAMPS[i];
    const payload = GOLDEN_PAYLOADS[i];
    const id = GOLDEN_EVENT_IDS[i];
    // Defensive — all four arrays are co-declared with the same length, so
    // this branch is unreachable. Emitting a thrown error keeps the
    // compiler happy without the lint-forbidden non-null assertion.
    if (timestamp === undefined || payload === undefined || id === undefined) {
      throw new Error(
        `hash-chain golden sequence: missing constant at index ${i} — ` +
          `GOLDEN_KINDS / GOLDEN_TIMESTAMPS / GOLDEN_PAYLOADS / GOLDEN_EVENT_IDS ` +
          `MUST have identical lengths.`,
      );
    }
    const prior = events[i - 1];
    const prevHash: ContentHash | null = i === 0 ? GENESIS_PREV_HASH : (prior?.contentHash ?? null);

    // Build the hashable shape (everything except id + contentHash) first
    // so `computeContentHash` gets exactly the fields the spec defines.
    const hashable = {
      tenantId: GOLDEN_TENANT_ID,
      intentId,
      kind,
      version: i + 1,
      timestamp,
      actor: GOLDEN_ACTOR,
      lawfulBasis: 'legitimate-interest' as const,
      purpose: GOLDEN_PURPOSE,
      dataSubjectIds: [GOLDEN_SUBJECT_ID] as readonly SubjectId[],
      prevHash,
      payload,
    };
    const contentHash = computeContentHash(hashable);

    events.push({
      id,
      ...hashable,
      contentHash,
    });
  }
  return events;
}

/**
 * Expected content hashes for the golden sequence built with
 * `intentId === 'tck-golden-intent'`. Computed eagerly at module-load
 * time so harnesses can compare expected vs actual without rebuilding
 * the chain themselves.
 *
 * NOTE: changing `intentId` changes every hash — the array below is
 * keyed to the literal sentinel. Harnesses that pass a different
 * `intentId` to `runHashChainContract` should not assert against this
 * array; the contract test computes per-`intentId` expected hashes
 * internally.
 */
export const EXPECTED_CONTENT_HASHES: readonly ContentHash[] = buildGoldenSequence(
  'tck-golden-intent' as IntentId,
).map((e) => e.contentHash);

// ============ Contract test ============

/**
 * Drive `env.storeFactory()` with the golden 5-event sequence, read
 * back, and assert hash-chain integrity end-to-end.
 *
 * Returns `TCK_RESULT_PASS` on conformance, otherwise a structured
 * `TckResultFailure` whose `code` identifies the failure class and
 * whose `message` cites the spec location driving the assertion
 * (citation discipline per ratchet disciplines).
 *
 * Failure codes:
 *
 *   - `READ_LENGTH_MISMATCH` — store returned N events; N != 5
 *   - `READ_ORDER_MISMATCH` — store returned events in a different
 *     order than they were appended (`event.id` mismatch at position)
 *   - `CONTENT_HASH_MISMATCH` — store returned an event whose
 *     `contentHash` differs from the value originally appended
 *   - `PREV_HASH_MISMATCH` — store returned an event whose `prevHash`
 *     differs from the value originally appended
 *   - `PAYLOAD_MISMATCH` — store returned an event whose payload's
 *     canonical-JSON serialisation differs from the original (i.e.
 *     the store silently mutated payload content)
 *   - `CHAIN_VERIFY_FAILED` — `verifyChain(readBack).valid === false`
 *     (covers genesis sentinel, prevHash linkage, recompute equality
 *     — see `hash-chain.ts` `verifyChain` for the per-mode reasons)
 */
export async function runHashChainContract(env: HashChainContractEnv): Promise<TckResult> {
  const store = env.storeFactory();
  const golden = buildGoldenSequence(env.intentId);

  // Drive the store with the full sequence.
  for (const event of golden) {
    await store.appendEvent(event);
  }

  const readBack = await store.readChain(env.intentId);

  if (readBack.length !== golden.length) {
    return {
      ok: false,
      code: 'READ_LENGTH_MISMATCH',
      message:
        `HashChainContractStore.readChain returned ${readBack.length} events ` +
        `after appending ${golden.length}. The store MUST preserve every ` +
        `appended event for the named intentId. See ` +
        `packages/crawcus-spec/src/event/hash-chain.ts.`,
    };
  }

  for (const [i, expected] of golden.entries()) {
    const actual = readBack[i];
    if (actual === undefined) {
      // Unreachable — length equality already asserted above. Defensive
      // branch keeps the type narrow without a non-null assertion.
      return {
        ok: false,
        code: 'READ_LENGTH_MISMATCH',
        message:
          `Internal: readBack[${i}] undefined despite matching length. ` +
          `See packages/crawcus-spec/src/event/hash-chain.ts.`,
      };
    }

    if (actual.id !== expected.id) {
      return {
        ok: false,
        code: 'READ_ORDER_MISMATCH',
        message:
          `Event at position ${i} read back with id '${actual.id}'; expected ` +
          `'${expected.id}'. The store MUST return events in append order — ` +
          `reordering breaks audit-bundle reproducibility (hash-chain prevHash ` +
          `linkage is sequence-dependent). See ` +
          `packages/crawcus-spec/src/event/hash-chain.ts verifyChain.`,
      };
    }

    if (actual.contentHash !== expected.contentHash) {
      return {
        ok: false,
        code: 'CONTENT_HASH_MISMATCH',
        message:
          `Event at position ${i} (id '${actual.id}') read back with ` +
          `contentHash '${actual.contentHash}'; expected ` +
          `'${expected.contentHash}'. The store MUST preserve contentHash ` +
          `exactly as written — any transformation breaks the chain. See ` +
          `packages/crawcus-spec/src/event/hash-chain.ts computeContentHash.`,
      };
    }

    if (actual.prevHash !== expected.prevHash) {
      return {
        ok: false,
        code: 'PREV_HASH_MISMATCH',
        message:
          `Event at position ${i} (id '${actual.id}') read back with ` +
          `prevHash '${actual.prevHash ?? '<null>'}'; expected ` +
          `'${expected.prevHash ?? '<null>'}'. The store MUST preserve ` +
          `prevHash exactly as written. See ` +
          `packages/crawcus-spec/src/event/hash-chain.ts verifyChain.`,
      };
    }

    // Re-canonicalise both payloads so legitimate key-order or numeric
    // normalisations (round-tripping through JSONB, etc.) are still
    // considered equivalent — we're checking the contract, not field-
    // ordering. We use `computeContentHash` indirectly via re-hashing
    // both shapes' relevant fields below; equivalent payloads will
    // yield equivalent hashes.
    const { id: _expId, contentHash: _expCh, ...expHashable } = expected;
    void _expId;
    void _expCh;
    const { id: _actId, contentHash: _actCh, ...actHashable } = actual;
    void _actId;
    void _actCh;
    const expRehash = computeContentHash(expHashable);
    const actRehash = computeContentHash(actHashable);
    if (expRehash !== actRehash) {
      return {
        ok: false,
        code: 'PAYLOAD_MISMATCH',
        message:
          `Event at position ${i} (id '${actual.id}') read-back payload + ` +
          `metadata re-hash to '${actRehash}'; expected '${expRehash}'. The ` +
          `store silently mutated one or more fields (likely payload, ` +
          `actor, timestamp, or lawfulBasis). See ` +
          `packages/crawcus-spec/src/event/hash-chain.ts computeContentHash.`,
      };
    }
  }

  // End-to-end: verifyChain across the read-back sequence MUST pass.
  // This is the load-bearing assertion auditors run against the
  // audit-bundle — any store that survives the per-event checks above
  // but breaks here has corrupted the chain's invariants.
  const verification = verifyChain(readBack);
  if (!verification.valid) {
    return {
      ok: false,
      code: 'CHAIN_VERIFY_FAILED',
      message:
        `verifyChain rejected the read-back sequence at index ` +
        `${verification.brokenAt}: ${verification.reason ?? '<no reason>'}. ` +
        `See packages/crawcus-spec/src/event/hash-chain.ts verifyChain for ` +
        `the per-mode rejection reasons.`,
    };
  }

  return TCK_RESULT_PASS;
}
