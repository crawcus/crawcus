/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Optional Rekor anchor for a checkpoint.
 *
 * The anchored object is the checkpoint note text (origin, size, root),
 * not a receipt payload and not a naked payload hash. A witness checks
 * the anchor offline against a Rekor tree head they already hold.
 * Nothing in this module contacts Rekor.
 */

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { hashLeaf, verifyInclusion } from './merkle.js';

export const REKOR_ANCHOR_LABEL = 'crawcus-rekor-anchor-v1';

export interface RekorAnchor {
  readonly body: Uint8Array;
  readonly leafHash: Uint8Array;
  readonly leafIndex: number;
  readonly treeSize: number;
  readonly proof: readonly Uint8Array[];
  readonly rootHash: Uint8Array;
}

export function rekorAnchorBody(checkpointNoteText: string): Uint8Array {
  const digest = bytesToHex(sha256(new TextEncoder().encode(checkpointNoteText)));
  return new TextEncoder().encode(`${REKOR_ANCHOR_LABEL}\n${digest}\n`);
}

export function verifyRekorAnchor(
  checkpointNoteText: string,
  anchor: RekorAnchor,
): { readonly ok: boolean; readonly reason: string } {
  const expected = rekorAnchorBody(checkpointNoteText);
  if (!equal(expected, anchor.body)) {
    return { ok: false, reason: 'rekor anchor body does not commit to this checkpoint' };
  }
  const leaf = hashLeaf(anchor.body);
  if (!equal(leaf, anchor.leafHash)) {
    return { ok: false, reason: 'rekor leaf hash does not match the anchor body' };
  }
  const included = verifyInclusion(
    anchor.leafIndex,
    anchor.treeSize,
    anchor.leafHash,
    anchor.proof,
    anchor.rootHash,
  );
  if (!included) {
    return { ok: false, reason: 'rekor inclusion proof did not verify' };
  }
  return { ok: true, reason: 'rekor anchor inclusion verified offline' };
}

function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
