/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  buildMerkleTiles,
  buildReceiptStatement,
  checkpointNoteText,
  commitmentFromLogEntry,
  consistencyProof,
  decodeBase64Strict,
  decodeEntryBundle,
  emptyRoot,
  encodeEntryBundle,
  hashLeaf,
  inclusionProof,
  logEntryForCommitment,
  merkleRoot,
  nakedPayloadHash,
  noteKeyId,
  parseCheckpointNote,
  parseReceiptStatement,
  receiptCommitment,
  ReceiptSideStore,
  rekorAnchorBody,
  signCheckpoint,
  statementBytes,
  tileIndexPath,
  tileLayout,
  verifyConsistency,
  verifyInclusion,
  verifyRekorAnchor,
  verifySignedNote,
  type RekorAnchor,
} from '../../src/index.js';
import { hashChildren, consistencyProof as prove } from '../../src/tlog/merkle.js';
import { merkleRoot as root } from '../../src/tlog/merkle.js';

const encoder = new TextEncoder();

function leaves(count: number, seed: number): Uint8Array[] {
  return Array.from({ length: count }, (_, index) =>
    hashLeaf(encoder.encode(`leaf-${String(seed)}-${String(index)}`)),
  );
}

describe('RFC 6962 Merkle tree', () => {
  it('hashes a single leaf as SHA-256(0x00 || data)', () => {
    const data = encoder.encode('a');
    const expected = sha256(new Uint8Array([0x00, ...data]));
    expect(bytesToHex(hashLeaf(data))).toBe(bytesToHex(expected));
    expect(bytesToHex(merkleRoot([hashLeaf(data)]))).toBe(bytesToHex(expected));
  });

  it('uses an empty SHA-256 as the empty root', () => {
    expect(bytesToHex(emptyRoot())).toBe(bytesToHex(sha256(new Uint8Array())));
    expect(bytesToHex(merkleRoot([]))).toBe(bytesToHex(emptyRoot()));
  });

  it('builds the three-leaf tree from the RFC recurrence', () => {
    const h0 = hashLeaf(encoder.encode('a'));
    const h1 = hashLeaf(encoder.encode('b'));
    const h2 = hashLeaf(encoder.encode('c'));
    const pair = hashChildren(h0, h1);
    const tree = hashChildren(pair, h2);
    expect(bytesToHex(merkleRoot([h0, h1, h2]))).toBe(bytesToHex(tree));
    expect(inclusionProof([h0, h1, h2], 0).map(bytesToHex)).toEqual([h1, h2].map(bytesToHex));
    expect(inclusionProof([h0, h1, h2], 2).map(bytesToHex)).toEqual([pair].map(bytesToHex));
    expect(verifyInclusion(2, 3, h2, inclusionProof([h0, h1, h2], 2), tree)).toBe(true);
  });

  it('accepts inclusion and consistency proofs for random small trees', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 50 }), (size, seed) => {
        const leafHashes = leaves(size, seed);
        const tree = merkleRoot(leafHashes);
        for (let index = 0; index < size; index++) {
          const proof = inclusionProof(leafHashes, index);
          const leaf = leafHashes[index];
          if (leaf === undefined) return false;
          if (!verifyInclusion(index, size, leaf, proof, tree)) return false;
          const broken = proof.map((node, i) => (i === 0 ? flip(node) : node));
          if (proof.length > 0 && verifyInclusion(index, size, leaf, broken, tree)) return false;
        }
        for (let first = 1; first <= size; first++) {
          const proof = consistencyProof(leafHashes, first, size);
          const earlier = merkleRoot(leafHashes.slice(0, first));
          if (!verifyConsistency(first, size, proof, earlier, tree)) return false;
        }
        return true;
      }),
      { numRuns: 25 },
    );
  });

  it('rejects a consistency proof that forks the earlier tree', () => {
    const leafHashes = leaves(6, 7);
    const proof = consistencyProof(leafHashes, 3, 6);
    const earlier = merkleRoot(leafHashes.slice(0, 3));
    const other = merkleRoot(leaves(3, 99));
    expect(verifyConsistency(3, 6, proof, other, merkleRoot(leafHashes))).toBe(false);
    expect(verifyConsistency(3, 6, proof, earlier, merkleRoot(leafHashes))).toBe(true);
    expect(prove).toBe(consistencyProof);
    expect(root).toBe(merkleRoot);
  });
});

describe('tlog tiles', () => {
  it('encodes the published index path', () => {
    expect(tileIndexPath(1234067)).toBe('x001/x234/067');
    expect(tileIndexPath(0)).toBe('000');
  });

  it('matches the published widths for trees of 256 and 70000', () => {
    expect(tileLayout(256)).toEqual([
      { level: 0, fullTiles: 1, partialWidth: 0 },
      { level: 1, fullTiles: 0, partialWidth: 1 },
    ]);
    expect(tileLayout(70000)).toEqual([
      { level: 0, fullTiles: 273, partialWidth: 112 },
      { level: 1, fullTiles: 1, partialWidth: 17 },
      { level: 2, fullTiles: 0, partialWidth: 1 },
    ]);
  });

  it('stores leaf hashes at level 0 and the subtree root at level 1 for 256 leaves', () => {
    const leafHashes = leaves(256, 1);
    const tiles = buildMerkleTiles(leafHashes);
    const level0 = tiles.find((tile) => tile.path === 'tile/0/000');
    const level1 = tiles.find((tile) => tile.path === 'tile/1/000.p/1');
    expect(level0?.hashes).toHaveLength(256);
    expect(bytesToHex(level0?.hashes[0] ?? new Uint8Array())).toBe(bytesToHex(leafHashes[0] ?? new Uint8Array()));
    expect(bytesToHex(level1?.hashes[0] ?? new Uint8Array())).toBe(bytesToHex(merkleRoot(leafHashes)));
  });

  it('round-trips an entry bundle', () => {
    const entries = [encoder.encode('one'), encoder.encode('two')];
    const decoded = decodeEntryBundle(encodeEntryBundle(entries));
    expect(decoded?.map((entry) => Buffer.from(entry).toString('utf8'))).toEqual(['one', 'two']);
  });
});

describe('keyed commitment', () => {
  const key = new Uint8Array(32).fill(7);
  const nonce = new Uint8Array(16).fill(9);
  const payload = encoder.encode('subject:ada|purpose:access');

  it('does not publish a naked payload hash', () => {
    const commitment = receiptCommitment({ shredKey: key, nonce, payload });
    expect(bytesToHex(commitment)).not.toBe(nakedPayloadHash(payload));
    const entry = logEntryForCommitment(commitment);
    expect(bytesToHex(commitmentFromLogEntry(entry) ?? new Uint8Array())).toBe(bytesToHex(commitment));
  });

  it('changes when the nonce changes and ignores a guessed payload without the key', () => {
    const first = receiptCommitment({ shredKey: key, nonce, payload });
    const otherNonce = new Uint8Array(16).fill(8);
    const second = receiptCommitment({ shredKey: key, nonce: otherNonce, payload });
    expect(bytesToHex(first)).not.toBe(bytesToHex(second));
    const guessed = receiptCommitment({
      shredKey: new Uint8Array(32).fill(1),
      nonce,
      payload,
    });
    expect(bytesToHex(guessed)).not.toBe(bytesToHex(first));
  });

  it('keeps the tombstone after the side store is shredded', () => {
    const store = new ReceiptSideStore();
    store.putSubjectKey('subject-a', key);
    const commitment = store.append('subject-a', 0, nonce, payload);
    expect(store.open(0)?.payload).toEqual(payload);
    store.shred('subject-a');
    expect(store.open(0)).toBeNull();
    expect(bytesToHex(store.tombstone(0)?.commitment ?? new Uint8Array())).toBe(bytesToHex(commitment));
  });
});

describe('checkpoint note', () => {
  it('verifies the signed-note example vector', () => {
    const note = [
      'This is an example message.',
      '',
      '— example.com/foo Uw2QOkn8srV1yJGh2VYRlL1Tnagv1YEq6TfXppzi2ONncAlTgK7Ztg1ERYNZXsYjOBH3mFXmRKuwHjG1Yu72IneyaQM=',
      '',
    ].join('\n');
    const material = decodeBase64Strict('AekyeRrm56hApGFkyQR4ZCbV54Id2LKaANYcrnKv3U2k');
    expect(material?.[0]).toBe(0x01);
    const publicKey = material?.slice(1) ?? new Uint8Array();
    expect(Buffer.from(noteKeyId('example.com/foo', publicKey)).toString('hex')).toBe('530d903a');
    const result = verifySignedNote(note, [{ name: 'example.com/foo', publicKey }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe('This is an example message.\n');
  });

  it('signs a checkpoint the same parser accepts', () => {
    const privateKey = testSeed(1);
    const publicKey = ed25519.getPublicKey(privateKey);
    const body = {
      origin: 'example.com/crawcus',
      size: 2,
      rootHash: merkleRoot(leaves(2, 1)),
    };
    const signed = signCheckpoint(body, privateKey);
    const verified = verifySignedNote(signed, [{ name: body.origin, publicKey }]);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(parseCheckpointNote(verified.text)).toEqual(body);
    expect(checkpointNoteText(body).startsWith('example.com/crawcus\n2\n')).toBe(true);
  });
});

describe('rekor anchor and in-toto statement', () => {
  it('anchors the checkpoint note, not the payload', () => {
    const privateKey = testSeed(2);
    const body = {
      origin: 'example.com/crawcus',
      size: 1,
      rootHash: merkleRoot(leaves(1, 2)),
    };
    const note = checkpointNoteText(body);
    const anchorBody = rekorAnchorBody(note);
    expect(Buffer.from(anchorBody).toString('utf8').includes('subject:ada')).toBe(false);
    const leaf = hashLeaf(anchorBody);
    const anchor: RekorAnchor = {
      body: anchorBody,
      leafHash: leaf,
      leafIndex: 0,
      treeSize: 1,
      proof: [],
      rootHash: leaf,
    };
    expect(verifyRekorAnchor(note, anchor).ok).toBe(true);
    expect(verifyRekorAnchor(`${note}tamper`, anchor).ok).toBe(false);
    expect(signCheckpoint(body, privateKey).includes(body.origin)).toBe(true);
  });

  it('builds a statement whose subject is the log entry, not the payload', () => {
    const payload = encoder.encode('subject:ada');
    const commitment = receiptCommitment({
      shredKey: new Uint8Array(32).fill(3),
      nonce: new Uint8Array(16).fill(4),
      payload,
    });
    const entry = logEntryForCommitment(commitment);
    const rootHash = hashLeaf(entry);
    const statement = buildReceiptStatement({
      chainMode: 'merkle-tlog',
      logOrigin: 'example.com/crawcus',
      leafIndex: 0,
      treeSize: 1,
      logEntry: entry,
      inclusionProof: [],
      rootHash,
    });
    expect(statement._type).toBe('https://in-toto.io/Statement/v1');
    expect(statement.predicateType).toBe('https://crawcus.org/ns/in-toto/receipt/v1');
    expect(statement.subject[0]?.digest.sha256).toBe(bytesToHex(sha256(entry)));
    expect(statement.subject[0]?.digest.sha256).not.toBe(bytesToHex(sha256(payload)));
    const parsed = parseReceiptStatement(JSON.parse(new TextDecoder().decode(statementBytes(statement))));
    expect(parsed?.predicate['chainMode']).toBe('merkle-tlog');
    expect(parseReceiptStatement({ ...statement, predicate: { ...statement.predicate, payload: 'no' } })).toBeNull();
  });
});

function testSeed(n: number): Uint8Array {
  const seed = new Uint8Array(32);
  seed.set([0x54, 0x45, 0x53, 0x54], 0);
  seed[31] = n;
  return seed;
}

function flip(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes);
  copy[0] = (copy[0] ?? 0) ^ 0x01;
  return copy;
}
