/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RFC 6962 Merkle tree (the same node hashes RFC 9162 and C2SP
 * tlog-tiles use). SHA-256. Leaf prefix 0x00, node prefix 0x01.
 *
 * The prototype rejects tree sizes above 2^20 so index arithmetic
 * stays inside the range where JavaScript bitwise shifts are exact.
 * Empty trees have the SHA-256 of the empty string as their root.
 * A consistency proof from size 0 is rejected: RFC 6962 defines
 * proofs for 0 < m <= n, and a witness of an empty tree has nothing
 * to compare.
 */

import { sha256 } from '@noble/hashes/sha256';

export const MAX_MERKLE_TREE_SIZE = 1 << 20;

const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

export function hashLeaf(data: Uint8Array): Uint8Array {
  const input = new Uint8Array(1 + data.length);
  input[0] = LEAF_PREFIX;
  input.set(data, 1);
  return sha256(input);
}

export function hashChildren(left: Uint8Array, right: Uint8Array): Uint8Array {
  const input = new Uint8Array(1 + left.length + right.length);
  input[0] = NODE_PREFIX;
  input.set(left, 1);
  input.set(right, 1 + left.length);
  return sha256(input);
}

export function emptyRoot(): Uint8Array {
  return sha256(new Uint8Array());
}

/** Merkle tree hash of an ordered list of already-computed leaf hashes. */
export function merkleRoot(leafHashes: readonly Uint8Array[]): Uint8Array {
  assertSize(leafHashes.length);
  return rootOf(leafHashes);
}

export function inclusionProof(
  leafHashes: readonly Uint8Array[],
  index: number,
): Uint8Array[] {
  assertSize(leafHashes.length);
  if (!Number.isInteger(index) || index < 0 || index >= leafHashes.length) {
    throw new RangeError('leaf index is outside the tree');
  }
  return proveInclusion(leafHashes, index).map(copyBytes);
}

/**
 * Consistency proof between a tree of size `first` and a tree of size
 * `second`, both prefixes of `leafHashes`. `0 < first <= second`.
 */
export function consistencyProof(
  leafHashes: readonly Uint8Array[],
  first: number,
  second: number,
): Uint8Array[] {
  assertSize(leafHashes.length);
  if (!Number.isInteger(first) || !Number.isInteger(second) || first <= 0 || second < first) {
    throw new RangeError('consistency proof requires 0 < first <= second');
  }
  if (second > leafHashes.length) {
    throw new RangeError('consistency proof extends past the available leaves');
  }
  if (first === second) return [];
  return subProof(leafHashes, first, 0, second, true).map(copyBytes);
}

/**
 * Recompute the root from a leaf hash and an inclusion proof.
 * Returns null when the proof shape is wrong.
 */
export function rootFromInclusionProof(
  index: number,
  size: number,
  leafHash: Uint8Array,
  proof: readonly Uint8Array[],
): Uint8Array | null {
  if (!Number.isInteger(index) || !Number.isInteger(size) || index < 0 || index >= size) {
    return null;
  }
  if (size > MAX_MERKLE_TREE_SIZE) return null;
  if (leafHash.length !== 32) return null;
  const inner = bitLength(index ^ (size - 1));
  const border = onesCount(shiftRight(index, inner));
  if (proof.length !== inner + border) return null;
  for (const node of proof) {
    if (node.length !== 32) return null;
  }
  const acc = chainBorderRight(
    chainInner(leafHash, proof.slice(0, inner), index),
    proof.slice(inner),
  );
  return acc;
}

export function verifyInclusion(
  index: number,
  size: number,
  leafHash: Uint8Array,
  proof: readonly Uint8Array[],
  root: Uint8Array,
): boolean {
  const calculated = rootFromInclusionProof(index, size, leafHash, proof);
  return calculated !== null && equalBytes(calculated, root);
}

/**
 * RFC 9162 §2.1.4.2. Equal sizes require an empty proof and equal
 * roots. A non-empty proof between equal sizes fails.
 */
export function verifyConsistency(
  first: number,
  second: number,
  proof: readonly Uint8Array[],
  firstRoot: Uint8Array,
  secondRoot: Uint8Array,
): boolean {
  if (!Number.isInteger(first) || !Number.isInteger(second) || first <= 0 || second < first) {
    return false;
  }
  if (second > MAX_MERKLE_TREE_SIZE) return false;
  if (firstRoot.length !== 32 || secondRoot.length !== 32) return false;
  if (first === second) {
    return proof.length === 0 && equalBytes(firstRoot, secondRoot);
  }
  if (proof.length === 0) return false;

  const path = isPowerOfTwo(first) ? [firstRoot, ...proof] : [...proof];
  let fn = first - 1;
  let sn = second - 1;
  while ((fn & 1) === 1) {
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  let fr = path[0];
  let sr = path[0];
  if (fr === undefined || sr === undefined) return false;
  for (let i = 1; i < path.length; i++) {
    const node = path[i];
    if (node === undefined || node.length !== 32) return false;
    if (sn === 0) return false;
    if ((fn & 1) === 1 || fn === sn) {
      fr = hashChildren(node, fr);
      sr = hashChildren(node, sr);
      if ((fn & 1) === 0) {
        while ((fn & 1) === 0 && fn !== 0) {
          fn = Math.floor(fn / 2);
          sn = Math.floor(sn / 2);
        }
      }
    } else {
      sr = hashChildren(sr, node);
    }
    fn = Math.floor(fn / 2);
    sn = Math.floor(sn / 2);
  }
  return sn === 0 && equalBytes(fr, firstRoot) && equalBytes(sr, secondRoot);
}

function rootOf(leafHashes: readonly Uint8Array[]): Uint8Array {
  const n = leafHashes.length;
  if (n === 0) return emptyRoot();
  const only = leafHashes[0];
  if (n === 1 && only !== undefined) return only;
  const k = largestPowerOfTwoLessThan(n);
  return hashChildren(rootOf(leafHashes.slice(0, k)), rootOf(leafHashes.slice(k)));
}

function proveInclusion(leafHashes: readonly Uint8Array[], index: number): Uint8Array[] {
  const n = leafHashes.length;
  if (n === 1) return [];
  const k = largestPowerOfTwoLessThan(n);
  if (index < k) {
    return [...proveInclusion(leafHashes.slice(0, k), index), rootOf(leafHashes.slice(k))];
  }
  return [...proveInclusion(leafHashes.slice(k), index - k), rootOf(leafHashes.slice(0, k))];
}

function subProof(
  leafHashes: readonly Uint8Array[],
  m: number,
  start: number,
  end: number,
  known: boolean,
): Uint8Array[] {
  const n = end - start;
  if (m === n) {
    return known ? [] : [rootOf(leafHashes.slice(start, end))];
  }
  const k = largestPowerOfTwoLessThan(n);
  if (m <= k) {
    return [
      ...subProof(leafHashes, m, start, start + k, known),
      rootOf(leafHashes.slice(start + k, end)),
    ];
  }
  return [
    ...subProof(leafHashes, m - k, start + k, end, false),
    rootOf(leafHashes.slice(start, start + k)),
  ];
}

function chainInner(seed: Uint8Array, proof: readonly Uint8Array[], index: number): Uint8Array {
  let acc = seed;
  for (let i = 0; i < proof.length; i++) {
    const node = proof[i] ?? seed;
    const bit = shiftRight(index, i) & 1;
    acc = bit === 0 ? hashChildren(acc, node) : hashChildren(node, acc);
  }
  return acc;
}

function chainBorderRight(seed: Uint8Array, proof: readonly Uint8Array[]): Uint8Array {
  let acc = seed;
  for (const node of proof) acc = hashChildren(node, acc);
  return acc;
}

function shiftRight(value: number, bits: number): number {
  let out = value;
  for (let i = 0; i < bits; i++) out = Math.floor(out / 2);
  return out;
}

function largestPowerOfTwoLessThan(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function bitLength(n: number): number {
  if (n <= 0) return 0;
  return Math.floor(Math.log2(n)) + 1;
}

function onesCount(n: number): number {
  let count = 0;
  let value = Math.floor(n);
  while (value > 0) {
    count += value & 1;
    value = Math.floor(value / 2);
  }
  return count;
}

function assertSize(size: number): void {
  if (!Number.isInteger(size) || size < 0 || size > MAX_MERKLE_TREE_SIZE) {
    throw new RangeError(`tree size must be an integer in 0..${String(MAX_MERKLE_TREE_SIZE)}`);
  }
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
