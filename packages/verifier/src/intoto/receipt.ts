/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Seal and check an in-toto Statement v1 receipt inside a DSSE
 * envelope. The hash-chain compatibility mode is a predicate value,
 * not a second envelope.
 *
 * The DSSE signature is an integrity check against the key carried in
 * `keyid`. Deciding whether that key is an authorised signer is a
 * separate trust-policy question and is not decided here.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  IN_TOTO_PAYLOAD_TYPE,
  buildReceiptStatement,
  canonicalJSON,
  decodeBase64Strict,
  hashLeaf,
  parseReceiptStatement,
  statementBytes,
  verifyChain,
  verifyInclusion,
  type Event,
  type InTotoStatement,
  type ReceiptClaim,
} from '@crawcus/spec';
import { parseDsseEnvelope, preAuthenticationEncoding, verifyDsseSignature } from '../dsse.js';

export interface SealedReceipt {
  readonly statement: InTotoStatement;
  readonly envelope: Uint8Array;
}

export function sealReceipt(claim: ReceiptClaim, privateKey: Uint8Array): SealedReceipt {
  const statement = buildReceiptStatement(claim);
  const payloadBytes = statementBytes(statement);
  const publicKey = ed25519.getPublicKey(privateKey);
  const pae = preAuthenticationEncoding(IN_TOTO_PAYLOAD_TYPE, payloadBytes);
  const envelope = {
    payloadType: IN_TOTO_PAYLOAD_TYPE,
    payload: Buffer.from(payloadBytes).toString('base64'),
    signatures: [
      {
        keyid: bytesToHex(publicKey),
        sig: Buffer.from(ed25519.sign(pae, privateKey)).toString('base64'),
      },
    ],
  };
  return {
    statement,
    envelope: new TextEncoder().encode(canonicalJSON(envelope)),
  };
}

export interface ReceiptVerifyResult {
  readonly ok: boolean;
  readonly chainMode: 'hash-chain' | 'merkle-tlog' | null;
  readonly detail: string;
}

export function verifySealedReceipt(
  envelopeBytes: Uint8Array,
  hashChainEvents?: readonly Event[],
): ReceiptVerifyResult {
  const parsed = parseDsseEnvelope(envelopeBytes);
  if (parsed.kind !== 'ok') return { ok: false, chainMode: null, detail: parsed.reason };
  if (parsed.envelope.payloadType !== IN_TOTO_PAYLOAD_TYPE) {
    return { ok: false, chainMode: null, detail: 'DSSE payloadType is not an in-toto statement' };
  }
  let payloadBytes: Uint8Array;
  try {
    payloadBytes = new Uint8Array(Buffer.from(parsed.envelope.payload, 'base64'));
  } catch {
    return { ok: false, chainMode: null, detail: 'DSSE payload is not base64' };
  }
  const signature = verifyDsseSignature(parsed.envelope, payloadBytes);
  if (signature.verdict !== 'pass') {
    return { ok: false, chainMode: null, detail: signature.detail };
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes));
  } catch {
    return { ok: false, chainMode: null, detail: 'statement is not JSON' };
  }
  const statement = parseReceiptStatement(json);
  if (statement === null) {
    return { ok: false, chainMode: null, detail: 'statement is not a CRAWCUS receipt predicate' };
  }
  const canonical = statementBytes(statement);
  if (!equal(canonical, payloadBytes)) {
    return { ok: false, chainMode: null, detail: 'statement bytes are not canonical JSON' };
  }
  const mode = statement.predicate['chainMode'];
  if (mode === 'merkle-tlog') return verifyMerklePredicate(statement);
  if (mode === 'hash-chain') return verifyHashChainPredicate(statement, hashChainEvents);
  return { ok: false, chainMode: null, detail: 'unknown chain mode' };
}

function verifyMerklePredicate(statement: InTotoStatement): ReceiptVerifyResult {
  const predicate = statement.predicate;
  const logEntry = decodeBase64Strict(String(predicate['logEntry']));
  const root = decodeBase64Strict(String(predicate['rootHash']));
  const proofRaw = predicate['inclusionProof'];
  if (logEntry === null || root === null || !Array.isArray(proofRaw)) {
    return { ok: false, chainMode: 'merkle-tlog', detail: 'merkle predicate is malformed' };
  }
  const proof: Uint8Array[] = [];
  for (const item of proofRaw) {
    if (typeof item !== 'string') {
      return { ok: false, chainMode: 'merkle-tlog', detail: 'inclusion proof is malformed' };
    }
    const hash = decodeBase64Strict(item);
    if (hash === null) {
      return { ok: false, chainMode: 'merkle-tlog', detail: 'inclusion proof is malformed' };
    }
    proof.push(hash);
  }
  const digest = statement.subject[0]?.digest.sha256;
  if (digest !== bytesToHex(sha256(logEntry))) {
    return {
      ok: false,
      chainMode: 'merkle-tlog',
      detail: 'subject digest does not match the log entry',
    };
  }
  const index = predicate['leafIndex'];
  const size = predicate['treeSize'];
  if (typeof index !== 'number' || typeof size !== 'number') {
    return { ok: false, chainMode: 'merkle-tlog', detail: 'leaf index or tree size is malformed' };
  }
  const ok = verifyInclusion(index, size, hashLeaf(logEntry), proof, root);
  return {
    ok,
    chainMode: 'merkle-tlog',
    detail: ok ? 'in-toto receipt inclusion verified' : 'inclusion proof did not verify',
  };
}

function verifyHashChainPredicate(
  statement: InTotoStatement,
  events: readonly Event[] | undefined,
): ReceiptVerifyResult {
  const contentHash = statement.predicate['contentHash'];
  if (typeof contentHash !== 'string' || statement.subject[0]?.digest.sha256 !== contentHash) {
    return {
      ok: false,
      chainMode: 'hash-chain',
      detail: 'subject digest does not match the hash-chain content hash',
    };
  }
  if (events === undefined) {
    return {
      ok: true,
      chainMode: 'hash-chain',
      detail: 'hash-chain attestation shape verified; events were not supplied',
    };
  }
  if (events.length === 0) {
    return { ok: false, chainMode: 'hash-chain', detail: 'hash chain is empty' };
  }
  const chain = verifyChain(events);
  if (!chain.valid) {
    return {
      ok: false,
      chainMode: 'hash-chain',
      detail: chain.reason ?? 'hash chain did not verify',
    };
  }
  const last = events[events.length - 1];
  if (last !== undefined && last.contentHash !== contentHash) {
    return {
      ok: false,
      chainMode: 'hash-chain',
      detail: 'attestation content hash is not the chain head',
    };
  }
  return { ok: true, chainMode: 'hash-chain', detail: 'hash-chain compatibility mode verified' };
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
