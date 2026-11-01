/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519';
import {
  consistencyProof,
  hashLeaf,
  inclusionProof,
  logEntryForCommitment,
  merkleRoot,
  receiptCommitment,
  rekorAnchorBody,
  signCheckpoint,
  type RekorAnchor,
} from '@crawcus/spec';
import { sealReceipt, verifyOfflineLog, verifySealedReceipt } from '../src/index.js';

const encoder = new TextEncoder();

function testSeed(n: number): Uint8Array {
  const seed = new Uint8Array(32);
  seed.set([0x54, 0x45, 0x53, 0x54], 0);
  seed[31] = n;
  return seed;
}

function entryFor(byte: number): Uint8Array {
  const commitment = receiptCommitment({
    shredKey: testSeed(4),
    nonce: new Uint8Array(16).fill(byte),
    payload: encoder.encode(`receipt-${String(byte)}`),
  });
  return logEntryForCommitment(commitment);
}

describe('offline Merkle log', () => {
  const privateKey = testSeed(3);
  const publicKey = ed25519.getPublicKey(privateKey);
  const entries = [entryFor(1), entryFor(2), entryFor(3)];
  const leafHashes = entries.map((entry) => hashLeaf(entry));
  const root = merkleRoot(leafHashes);
  const earlier = merkleRoot(leafHashes.slice(0, 2));
  const signed = signCheckpoint(
    { origin: 'example.com/crawcus', size: 3, rootHash: root },
    privateKey,
  );
  const noteText = signed.split('\n\n')[0];
  const anchorBody = rekorAnchorBody(`${noteText ?? ''}\n`);
  const anchorLeaf = hashLeaf(anchorBody);
  const anchor: RekorAnchor = {
    body: anchorBody,
    leafHash: anchorLeaf,
    leafIndex: 0,
    treeSize: 1,
    proof: [],
    rootHash: anchorLeaf,
  };

  it('verifies inclusion, consistency, and a Rekor anchor offline', () => {
    const result = verifyOfflineLog({
      signedCheckpoint: signed,
      logPublicKey: publicKey,
      inclusion: {
        index: 1,
        treeSize: 3,
        leafData: entries[1] ?? new Uint8Array(),
        proof: inclusionProof(leafHashes, 1),
      },
      consistency: {
        earlierSize: 2,
        earlierRoot: earlier,
        proof: consistencyProof(leafHashes, 2, 3),
      },
      rekor: anchor,
      requireRekor: true,
    });
    expect(result.ok).toBe(true);
    expect(result.inclusion).toBe(true);
    expect(result.consistency).toBe('pass');
    expect(result.rekor).toBe('pass');
  });

  it('fails closed when a required Rekor anchor is missing', () => {
    const result = verifyOfflineLog({
      signedCheckpoint: signed,
      logPublicKey: publicKey,
      inclusion: {
        index: 0,
        treeSize: 3,
        leafData: entries[0] ?? new Uint8Array(),
        proof: inclusionProof(leafHashes, 0),
      },
      requireRekor: true,
    });
    expect(result.ok).toBe(false);
    expect(result.rekor).toBe('missing');
  });

  it('rejects a leaf that was not appended', () => {
    const result = verifyOfflineLog({
      signedCheckpoint: signed,
      logPublicKey: publicKey,
      inclusion: {
        index: 0,
        treeSize: 3,
        leafData: entryFor(9),
        proof: inclusionProof(leafHashes, 0),
      },
      requireRekor: false,
    });
    expect(result.ok).toBe(false);
    expect(result.inclusion).toBe(false);
  });
});

describe('in-toto receipt envelope', () => {
  const privateKey = testSeed(5);

  it('seals a Merkle receipt and verifies the inclusion proof inside DSSE', () => {
    const entry = entryFor(6);
    const root = hashLeaf(entry);
    const sealed = sealReceipt(
      {
        chainMode: 'merkle-tlog',
        logOrigin: 'example.com/crawcus',
        leafIndex: 0,
        treeSize: 1,
        logEntry: entry,
        inclusionProof: [],
        rootHash: root,
      },
      privateKey,
    );
    expect(verifySealedReceipt(sealed.envelope).ok).toBe(true);
    const tampered = new Uint8Array(sealed.envelope);
    tampered[20] = (tampered[20] ?? 0) ^ 0x01;
    expect(verifySealedReceipt(tampered).ok).toBe(false);
  });

  it('keeps the hash chain as a compatibility predicate', () => {
    const contentHash = 'ab'.repeat(32);
    const sealed = sealReceipt(
      { chainMode: 'hash-chain', contentHash, prevHash: null },
      privateKey,
    );
    const result = verifySealedReceipt(sealed.envelope);
    expect(result.ok).toBe(true);
    expect(result.chainMode).toBe('hash-chain');
    const envelope = JSON.parse(new TextDecoder().decode(sealed.envelope)) as {
      payloadType: string;
      payload: string;
    };
    expect(envelope.payloadType).toBe('application/vnd.in-toto+json');
    const statement = JSON.parse(Buffer.from(envelope.payload, 'base64').toString('utf8')) as {
      _type: string;
      predicate: { contentHash: string; chainMode: string };
    };
    expect(statement._type).toBe('https://in-toto.io/Statement/v1');
    expect(statement.predicate.chainMode).toBe('hash-chain');
    expect(statement.predicate.contentHash).toBe(contentHash);
  });
});
