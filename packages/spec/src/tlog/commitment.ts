/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Keyed commitment used as a transparency-log entry.
 *
 * The log stores the commitment, never the payload. Opening it
 * requires the per-subject shred key and the per-leaf nonce, both of
 * which live in the side store. Destroying those values is the
 * crypto-shred. The commitment stays in the tree, so inclusion and
 * consistency proofs still verify.
 *
 * The commitment is SHA-256 over a length-prefixed preimage. It is
 * computationally hiding while the shred key is secret and the nonce
 * is unguessable. It is not information-theoretically hiding, and it
 * is not a Pedersen commitment. A naked SHA-256 of the payload is a
 * different value and must not be used as a leaf.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

export const COMMITMENT_DOMAIN = 'crawcus-tlog-commitment-v1';
export const LOG_ENTRY_VERSION = 0x01;
export const SHRED_KEY_BYTES = 32;
export const NONCE_BYTES = 16;

export interface CommitmentOpening {
  readonly shredKey: Uint8Array;
  readonly nonce: Uint8Array;
  readonly payload: Uint8Array;
}

export function receiptCommitment(opening: CommitmentOpening): Uint8Array {
  if (opening.shredKey.length !== SHRED_KEY_BYTES) {
    throw new RangeError('shred key must be 32 bytes');
  }
  if (opening.nonce.length !== NONCE_BYTES) {
    throw new RangeError('nonce must be 16 bytes');
  }
  const payloadHash = sha256(opening.payload);
  const domain = new TextEncoder().encode(COMMITMENT_DOMAIN);
  const preimage = concat([
    domain,
    uint16(opening.shredKey.length),
    opening.shredKey,
    uint16(opening.nonce.length),
    opening.nonce,
    uint16(payloadHash.length),
    payloadHash,
  ]);
  return sha256(preimage);
}

/** Log entry placed in a tlog-tiles entry bundle: version byte || commitment. */
export function logEntryForCommitment(commitment: Uint8Array): Uint8Array {
  if (commitment.length !== 32) throw new RangeError('commitment must be 32 bytes');
  const entry = new Uint8Array(1 + commitment.length);
  entry[0] = LOG_ENTRY_VERSION;
  entry.set(commitment, 1);
  return entry;
}

export function commitmentFromLogEntry(entry: Uint8Array): Uint8Array | null {
  if (entry.length !== 33 || entry[0] !== LOG_ENTRY_VERSION) return null;
  return entry.slice(1);
}

/**
 * In-memory side store. Production deployments encrypt the payload at
 * rest under the shred key (AES-256-GCM is the intended construction)
 * and destroy every copy of that key, including backups. This class
 * only models the logical shred: after `shred`, the payload, nonce,
 * and key are gone, and the retained tombstone is the commitment.
 */
export class ReceiptSideStore {
  private readonly keys = new Map<string, Uint8Array>();
  private readonly records = new Map<
    number,
    { subjectId: string; nonce: Uint8Array; payload: Uint8Array; commitment: Uint8Array }
  >();

  putSubjectKey(subjectId: string, shredKey: Uint8Array): void {
    if (shredKey.length !== SHRED_KEY_BYTES) throw new RangeError('shred key must be 32 bytes');
    this.keys.set(subjectId, copy(shredKey));
  }

  append(subjectId: string, index: number, nonce: Uint8Array, payload: Uint8Array): Uint8Array {
    const shredKey = this.keys.get(subjectId);
    if (shredKey === undefined) throw new Error('unknown subject key');
    const commitment = receiptCommitment({ shredKey, nonce, payload });
    this.records.set(index, {
      subjectId,
      nonce: copy(nonce),
      payload: copy(payload),
      commitment,
    });
    return commitment;
  }

  open(index: number): { payload: Uint8Array; commitment: Uint8Array } | null {
    const record = this.records.get(index);
    const key = record === undefined ? undefined : this.keys.get(record.subjectId);
    if (record === undefined || key === undefined) return null;
    const again = receiptCommitment({
      shredKey: key,
      nonce: record.nonce,
      payload: record.payload,
    });
    if (!equal(again, record.commitment)) return null;
    return { payload: copy(record.payload), commitment: copy(record.commitment) };
  }

  /**
   * Delete the subject key and every payload and nonce for that
   * subject. Commitments are kept so a verifier can still show the
   * leaf that was logged.
   */
  shred(subjectId: string): readonly number[] {
    this.keys.delete(subjectId);
    const shredded: number[] = [];
    for (const [index, record] of this.records) {
      if (record.subjectId !== subjectId) continue;
      shredded.push(index);
      this.records.set(index, {
        subjectId,
        nonce: new Uint8Array(),
        payload: new Uint8Array(),
        commitment: record.commitment,
      });
    }
    return shredded;
  }

  tombstone(index: number): { commitment: Uint8Array } | null {
    const record = this.records.get(index);
    if (record === undefined) return null;
    return { commitment: copy(record.commitment) };
  }
}

export function nakedPayloadHash(payload: Uint8Array): string {
  return bytesToHex(sha256(payload));
}

function uint16(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function copy(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
