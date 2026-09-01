import type { Event, IntentId, Tenant, HashChainProof } from '@crawcus/spec';
import type { TxContext } from './tx-context.js';

/**
 * Event store port — append-only log adapter. Implementations:
 * `internal-package`, `@tallyseal/event-store-postgres`,
 * `@tallyseal/event-store-kafka`, `@tallyseal/event-store-supabase`,
 * `@tallyseal/event-store-d1`, etc.
 *
 * `begin()` is the canonical entry point for `writeEvent` (4c) — it
 * opens a transaction in which the event append + reducer projection
 * write commit together (the same-transaction guarantee, ratchet #13).
 * Takes the active `Tenant` so the adapter can scope the transaction
 * (residency, RLS, BYOC sharding) — `TxContext.tenant` flows into
 * `append()`, projection writes, etc.
 *
 * `read()` returns events in chronological order (by `version`).
 * `chain()` returns a verifiable hash-chain proof; auditors recompute
 * the chain locally to confirm tamper-evidence.
 */
export interface EventStorePort {
  append(event: Event, ctx: TxContext): Promise<void>;
  read(intentId: IntentId): AsyncIterable<Event>;
  chain(intentId: IntentId): Promise<HashChainProof>;
  /**
   * Opens a tx scoped to `tenant`; passes the TxContext to the
   * callback for nested operations.
   */
  begin<T>(tenant: Tenant, fn: (tx: TxContext) => Promise<T>): Promise<T>;
}
