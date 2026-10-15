/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Conformance vectors for the proposed Merkle log (ADR-0053) and the
 * in-toto receipt statement (ADR-0054). Keys are TEST ONLY. The
 * hash-chain vector reuses the existing golden chain so compatibility
 * mode stays attached to `verifyChain`.
 */

import { createHash } from 'node:crypto';
import {
  buildReceiptStatement,
  consistencyProof,
  encodeBase64,
  ed25519PublicKey,
  hashLeaf,
  inclusionProof,
  logEntryForCommitment,
  merkleRoot,
  nakedPayloadHash,
  receiptCommitment,
  rekorAnchorBody,
  signCheckpoint,
  statementBytes,
  tileLayout,
  verifyConsistency,
  verifyInclusion,
  verifyRekorAnchor,
  verifySignedNote,
  parseCheckpointNote,
  verifyChain,
  type IntentId,
  type RekorAnchor,
} from '@crawcus/spec';
import { buildGoldenSequence } from './hash-chain.fixture.js';
import { TCK_RESULT_PASS, type TckResult } from './result.js';

export const MERKLE_INTOTO_KEY_LABEL = 'TEST ONLY' as const;

export interface MerkleIntotoVector {
  readonly name: string;
  readonly description: string;
  readonly keyLabel: typeof MERKLE_INTOTO_KEY_LABEL;
  readonly body: Record<string, unknown>;
  readonly expectedOk: boolean;
}

const encoder = new TextEncoder();

export function buildMerkleIntotoVectors(): readonly MerkleIntotoVector[] {
  const rawLeaves = [0, 1, 2, 3].map((n) => encoder.encode(`tlog-leaf-${String(n)}`));
  const leafHashes = rawLeaves.map((leaf) => hashLeaf(leaf));
  const root = merkleRoot(leafHashes);
  const validProof = inclusionProof(leafHashes, 2);
  const brokenProof = validProof.map((node, index) => (index === 0 ? flip(node) : node));
  const earlier = merkleRoot(leafHashes.slice(0, 2));
  const cons = consistencyProof(leafHashes, 2, 4);

  const shredKey = testSeed(1);
  const nonceA = new Uint8Array(16).fill(1);
  const nonceB = new Uint8Array(16).fill(2);
  const payload = encoder.encode('TEST ONLY payload — not personal data');
  const commitment = receiptCommitment({ shredKey, nonce: nonceA, payload });
  const otherNonce = receiptCommitment({ shredKey, nonce: nonceB, payload });
  const entry = logEntryForCommitment(commitment);
  const entryLeaf = hashLeaf(entry);

  const logKey = testSeed(2);
  const origin = 'example.com/crawcus-test';
  const signed = signCheckpoint({ origin, size: 4, rootHash: root }, logKey);
  const publicKey = ed25519PublicKey(logKey);
  const noteText = signed.slice(0, signed.indexOf('\n\n') + 1);
  const anchorBody = rekorAnchorBody(noteText);
  const anchorLeaf = hashLeaf(anchorBody);

  const merkleStatement = buildReceiptStatement({
    chainMode: 'merkle-tlog',
    logOrigin: origin,
    leafIndex: 0,
    treeSize: 1,
    logEntry: entry,
    inclusionProof: [],
    rootHash: entryLeaf,
  });
  const golden = buildGoldenSequence('tck-golden-intent' as IntentId);
  const head = golden[golden.length - 1];
  const hashStatement = buildReceiptStatement({
    chainMode: 'hash-chain',
    contentHash: head?.contentHash ?? '',
    prevHash: head?.prevHash ?? null,
  });

  return [
    vector('inclusion-valid', 'Leaf 2 of a 4-leaf RFC 6962 tree.', {
      leaves: rawLeaves.map((leaf) => encodeBase64(leaf)),
      index: 2,
      treeSize: 4,
      proof: validProof.map((hash) => encodeBase64(hash)),
      root: encodeBase64(root),
    }, true),
    vector('inclusion-tampered', 'The same tree rejects a proof whose first node was flipped.', {
      leaves: rawLeaves.map((leaf) => encodeBase64(leaf)),
      index: 2,
      treeSize: 4,
      proof: brokenProof.map((hash) => encodeBase64(hash)),
      root: encodeBase64(root),
    }, true),
    vector('consistency-valid', 'Consistency from size 2 to size 4.', {
      leaves: rawLeaves.map((leaf) => encodeBase64(leaf)),
      first: 2,
      second: 4,
      proof: cons.map((hash) => encodeBase64(hash)),
      firstRoot: encodeBase64(earlier),
      secondRoot: encodeBase64(root),
    }, true),
    vector('tile-layout', 'Published tlog-tiles widths, including the 70000-leaf example.', {
      layouts: {
        '256': tileLayout(256),
        '70000': tileLayout(70000),
      },
    }, true),
    vector('commitment', 'Keyed commitment. A naked payload hash is a different value.', {
      shredKey: Buffer.from(shredKey).toString('hex'),
      nonce: Buffer.from(nonceA).toString('hex'),
      payload: encodeBase64(payload),
      commitment: encodeBase64(commitment),
      otherNonceCommitment: encodeBase64(otherNonce),
      nakedPayloadHash: nakedPayloadHash(payload),
      logEntry: encodeBase64(entry),
    }, true),
    vector('checkpoint', 'Ed25519 signed-note checkpoint over the 4-leaf root. TEST key.', {
      signed,
      publicKey: Buffer.from(publicKey).toString('hex'),
      origin,
      size: 4,
      root: encodeBase64(root),
    }, true),
    vector('rekor-anchor', 'Offline inclusion of a checkpoint-note anchor in a one-leaf Rekor tree.', {
      checkpointNote: noteText,
      body: encodeBase64(anchorBody),
      leafIndex: 0,
      treeSize: 1,
      proof: [],
      root: encodeBase64(anchorLeaf),
    }, true),
    vector('intoto-merkle', 'Statement v1 whose subject is the log entry, not the payload.', {
      statement: merkleStatement,
      statementSha256: createHash('sha256').update(statementBytes(merkleStatement)).digest('hex'),
    }, true),
    vector('intoto-hash-chain', 'Compatibility-mode statement for the golden hash-chain head.', {
      statement: hashStatement,
      contentHash: head?.contentHash ?? '',
      chainValid: verifyChain(golden).valid,
    }, true),
  ];
}

export const MERKLE_INTOTO_VECTORS: readonly MerkleIntotoVector[] = buildMerkleIntotoVectors();

export function runMerkleIntotoVectors(
  vectors: readonly MerkleIntotoVector[] = MERKLE_INTOTO_VECTORS,
): TckResult {
  for (const vector of vectors) {
    const ok = evaluate(vector);
    if (ok !== vector.expectedOk) {
      return {
        ok: false,
        code: 'MERKLE_INTOTO_VECTOR_MISMATCH',
        message:
          `${vector.name} evaluated to ${String(ok)} but the vector expects ${String(vector.expectedOk)}. ` +
          'See docs/adr/ADR-0053-merkle-transparency-log.md and docs/adr/ADR-0054-intoto-receipt-attestation.md.',
      };
    }
  }
  return TCK_RESULT_PASS;
}

function evaluate(vector: MerkleIntotoVector): boolean {
  const body = vector.body;
  if (vector.name === 'inclusion-valid' || vector.name === 'inclusion-tampered') {
    const raw = asStrings(body['leaves']).map(decode);
    const leafHashes = raw.map((leaf) => hashLeaf(leaf));
    const proof = asStrings(body['proof']).map(decode);
    const root = decode(String(body['root']));
    const index = Number(body['index']);
    const included = verifyInclusion(
      index,
      Number(body['treeSize']),
      leafHashes[index] ?? new Uint8Array(),
      proof,
      root,
    );
    const rootOk = bytesEqual(merkleRoot(leafHashes), root);
    return vector.name === 'inclusion-tampered' ? rootOk && !included : rootOk && included;
  }
  if (vector.name === 'consistency-valid') {
    const raw = asStrings(body['leaves']).map(decode);
    const leafHashes = raw.map((leaf) => hashLeaf(leaf));
    return verifyConsistency(
      Number(body['first']),
      Number(body['second']),
      asStrings(body['proof']).map(decode),
      decode(String(body['firstRoot'])),
      decode(String(body['secondRoot'])),
    ) && bytesEqual(merkleRoot(leafHashes), decode(String(body['secondRoot'])));
  }
  if (vector.name === 'tile-layout') {
    const layouts = body['layouts'] as Record<string, unknown>;
    return JSON.stringify(layouts['256']) === JSON.stringify(tileLayout(256))
      && JSON.stringify(layouts['70000']) === JSON.stringify(tileLayout(70000));
  }
  if (vector.name === 'commitment') {
    const shredKey = Buffer.from(String(body['shredKey']), 'hex');
    const nonce = Buffer.from(String(body['nonce']), 'hex');
    const payload = decode(String(body['payload']));
    const commitment = receiptCommitment({ shredKey, nonce, payload });
    const other = decode(String(body['otherNonceCommitment']));
    return bytesEqual(commitment, decode(String(body['commitment'])))
      && nakedPayloadHash(payload) === body['nakedPayloadHash']
      && nakedPayloadHash(payload) !== Buffer.from(commitment).toString('hex')
      && !bytesEqual(commitment, other);
  }
  if (vector.name === 'checkpoint') {
    const publicKey = new Uint8Array(Buffer.from(String(body['publicKey']), 'hex'));
    const verified = verifySignedNote(String(body['signed']), [{ name: String(body['origin']), publicKey }]);
    if (!verified.ok) return false;
    const parsed = parseCheckpointNote(verified.text);
    return parsed !== null && parsed.size === body['size'] && parsed.origin === body['origin'];
  }
  if (vector.name === 'rekor-anchor') {
    const bodyBytes = decode(String(body['body']));
    const root = decode(String(body['root']));
    const anchor: RekorAnchor = {
      body: bodyBytes,
      leafHash: hashLeaf(bodyBytes),
      leafIndex: Number(body['leafIndex']),
      treeSize: Number(body['treeSize']),
      proof: [],
      rootHash: root,
    };
    return verifyRekorAnchor(String(body['checkpointNote']), anchor).ok;
  }
  if (vector.name === 'intoto-merkle') {
    const statement = body['statement'] as { subject?: { digest?: { sha256?: string } }[]; predicate?: { logEntry?: string } };
    const logEntry = decode(String(statement.predicate?.logEntry));
    const digest = createHash('sha256').update(logEntry).digest('hex');
    return statement.subject?.[0]?.digest?.sha256 === digest
      && body['statementSha256'] === createHash('sha256').update(statementBytes(statement as never)).digest('hex');
  }
  if (vector.name === 'intoto-hash-chain') {
    const statement = body['statement'] as { subject?: { digest?: { sha256?: string } }[]; predicate?: { contentHash?: string; chainMode?: string } };
    return body['chainValid'] === true
      && statement.predicate?.chainMode === 'hash-chain'
      && statement.predicate.contentHash === body['contentHash']
      && statement.subject?.[0]?.digest?.sha256 === body['contentHash'];
  }
  return false;
}

function vector(
  name: string,
  description: string,
  body: Record<string, unknown>,
  expectedOk: boolean,
): MerkleIntotoVector {
  return {
    name,
    description,
    keyLabel: MERKLE_INTOTO_KEY_LABEL,
    body,
    expectedOk,
  };
}

function testSeed(n: number): Uint8Array {
  const seed = new Uint8Array(32);
  seed.set([0x54, 0x45, 0x53, 0x54], 0);
  seed[31] = n;
  return seed;
}

function flip(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes);
  copy[0] = (copy[0] ?? 0) ^ 0xff;
  return copy;
}

function decode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

