/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * in-toto Statement v1 for a CRAWCUS receipt.
 *
 * The statement is the DSSE payload. Its payload type, when enveloped,
 * is `application/vnd.in-toto+json`. The predicate type is a CRAWCUS
 * URI. The statement does not carry the receipt payload: the subject
 * digest identifies the log entry (Merkle mode) or the existing
 * content hash (hash-chain compatibility mode).
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { canonicalJSON } from '../event/canonical-json.js';
import { encodeBase64 } from '../tlog/checkpoint.js';

export const IN_TOTO_STATEMENT_TYPE = 'https://in-toto.io/Statement/v1';
export const IN_TOTO_PAYLOAD_TYPE = 'application/vnd.in-toto+json';
export const CRAWCUS_RECEIPT_PREDICATE_TYPE =
  'https://tallyseal.org/ns/crawcus/in-toto/receipt/v1';

export type ReceiptChainMode = 'hash-chain' | 'merkle-tlog';

export interface MerkleReceiptClaim {
  readonly chainMode: 'merkle-tlog';
  readonly logOrigin: string;
  readonly leafIndex: number;
  readonly treeSize: number;
  readonly logEntry: Uint8Array;
  readonly inclusionProof: readonly Uint8Array[];
  readonly rootHash: Uint8Array;
}

export interface HashChainReceiptClaim {
  readonly chainMode: 'hash-chain';
  readonly contentHash: string;
  readonly prevHash: string | null;
}

export type ReceiptClaim = MerkleReceiptClaim | HashChainReceiptClaim;

export interface InTotoStatement {
  readonly _type: typeof IN_TOTO_STATEMENT_TYPE;
  readonly subject: readonly {
    readonly name: string;
    readonly digest: { readonly sha256: string };
  }[];
  readonly predicateType: typeof CRAWCUS_RECEIPT_PREDICATE_TYPE;
  readonly predicate: Record<string, unknown>;
}

export function buildReceiptStatement(claim: ReceiptClaim): InTotoStatement {
  if (claim.chainMode === 'merkle-tlog') {
    const digest = bytesToHex(sha256(claim.logEntry));
    return {
      _type: IN_TOTO_STATEMENT_TYPE,
      subject: [
        {
          name: `${claim.logOrigin}#${String(claim.leafIndex)}`,
          digest: { sha256: digest },
        },
      ],
      predicateType: CRAWCUS_RECEIPT_PREDICATE_TYPE,
      predicate: {
        v: 1,
        chainMode: 'merkle-tlog',
        logOrigin: claim.logOrigin,
        leafIndex: claim.leafIndex,
        treeSize: claim.treeSize,
        logEntry: encodeBase64(claim.logEntry),
        inclusionProof: claim.inclusionProof.map((hash) => encodeBase64(hash)),
        rootHash: encodeBase64(claim.rootHash),
      },
    };
  }
  if (!/^[0-9a-f]{64}$/.test(claim.contentHash)) {
    throw new RangeError('contentHash must be 64 lowercase hex characters');
  }
  if (claim.prevHash !== null && !/^[0-9a-f]{64}$/.test(claim.prevHash)) {
    throw new RangeError('prevHash must be 64 lowercase hex characters or null');
  }
  return {
    _type: IN_TOTO_STATEMENT_TYPE,
    subject: [
      {
        name: 'crawcus-hash-chain',
        digest: { sha256: claim.contentHash },
      },
    ],
    predicateType: CRAWCUS_RECEIPT_PREDICATE_TYPE,
    predicate: {
      v: 1,
      chainMode: 'hash-chain',
      contentHash: claim.contentHash,
      prevHash: claim.prevHash,
    },
  };
}

/** Canonical statement bytes. These are the DSSE payload bytes. */
export function statementBytes(statement: InTotoStatement): Uint8Array {
  return new TextEncoder().encode(canonicalJSON(statement));
}

const MERKLE_FIELDS = [
  'v',
  'chainMode',
  'logOrigin',
  'leafIndex',
  'treeSize',
  'logEntry',
  'inclusionProof',
  'rootHash',
] as const;

const HASH_CHAIN_FIELDS = ['v', 'chainMode', 'contentHash', 'prevHash'] as const;

export function parseReceiptStatement(value: unknown): InTotoStatement | null {
  if (!isRecord(value)) return null;
  if (value['_type'] !== IN_TOTO_STATEMENT_TYPE) return null;
  if (value['predicateType'] !== CRAWCUS_RECEIPT_PREDICATE_TYPE) return null;
  const subject = value['subject'];
  if (!Array.isArray(subject) || subject.length !== 1) return null;
  const first = subject[0];
  if (!isRecord(first) || typeof first['name'] !== 'string') return null;
  const digest = first['digest'];
  if (!isRecord(digest) || typeof digest['sha256'] !== 'string') return null;
  if (!/^[0-9a-f]{64}$/.test(digest['sha256'])) return null;
  const predicate = value['predicate'];
  if (!isRecord(predicate)) return null;
  if (predicate['chainMode'] === 'merkle-tlog') {
    if (!exactFields(predicate, MERKLE_FIELDS)) return null;
  } else if (predicate['chainMode'] === 'hash-chain') {
    if (!exactFields(predicate, HASH_CHAIN_FIELDS)) return null;
  } else {
    return null;
  }
  if (predicate['v'] !== 1) return null;
  return value as unknown as InTotoStatement;
}

function exactFields(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(value);
  if (keys.length !== allowed.length) return false;
  return allowed.every((field) => Object.hasOwn(value, field));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
