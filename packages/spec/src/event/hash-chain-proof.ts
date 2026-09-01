import type { ContentHash, EventId, IntentId } from '../types/ids.js';

/**
 * Hash-chain proof — the auditor-facing artifact returned by a
 * conformant runtime's event-store `chain(intentId)` operation.
 *
 * Lets a verifier (auditor, regulator, external party) recompute the
 * per-intent chain without trusting the runtime: re-canonicalise each
 * event, recompute SHA-256 over `prevHash || canonical(payload)`,
 * walk the chain in order, confirm `rootHash` matches.
 *
 * Wire format — part of the CRAWCUS open spec. Any CRAWCUS-conformant
 * runtime (Tallyseal, future Go/Rust/Python implementations) emits
 * this exact shape.
 */
export interface HashChainProof {
  readonly intentId: IntentId;
  readonly fromEventId: EventId;
  readonly toEventId: EventId;
  readonly rootHash: ContentHash;
  readonly hashes: readonly {
    readonly id: EventId;
    readonly prevHash: ContentHash | null;
    readonly contentHash: ContentHash;
  }[];
}
