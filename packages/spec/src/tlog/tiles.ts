/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * C2SP tlog-tiles layout for an RFC 6962 tree.
 *
 * Level 0 stores leaf hashes. A hash at level L > 0 is the Merkle
 * tree hash of one full tile from the level below (256^L leaves).
 * Partial tiles are not hashed upward. Paths use 3-digit groups; every
 * group except the last is prefixed with `x`.
 *
 * This module builds the static resources. It does not fetch them.
 */

import { merkleRoot } from './merkle.js';

export const TILE_WIDTH = 256;
export const HASH_BYTES = 32;

export interface TileLayoutRow {
  readonly level: number;
  readonly fullTiles: number;
  readonly partialWidth: number;
}

export interface LogTile {
  readonly path: string;
  readonly level: number;
  readonly index: number;
  readonly partialWidth: number | null;
  readonly hashes: readonly Uint8Array[];
  readonly bytes: Uint8Array;
}

/** Widths for a tree of `size` leaves. Matches the tlog-tiles examples. */
export function tileLayout(size: number): readonly TileLayoutRow[] {
  if (!Number.isInteger(size) || size < 0) {
    throw new RangeError('tree size must be a non-negative integer');
  }
  const rows: TileLayoutRow[] = [];
  for (let level = 0; level <= 6; level++) {
    const span = TILE_WIDTH ** level;
    if (span > size) break;
    const hashes = Math.floor(size / span);
    if (hashes === 0) break;
    rows.push({
      level,
      fullTiles: Math.floor(hashes / TILE_WIDTH),
      partialWidth: hashes % TILE_WIDTH,
    });
  }
  return rows;
}

/**
 * Index path such as `x001/x234/067`. The last element has no `x`
 * prefix. Index 0 is `000`.
 */
export function tileIndexPath(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('tile index must be a non-negative integer');
  }
  let decimal = String(index);
  const pad = (3 - (decimal.length % 3)) % 3;
  decimal = '0'.repeat(pad) + decimal;
  const parts: string[] = [];
  for (let offset = 0; offset < decimal.length; offset += 3) {
    const chunk = decimal.slice(offset, offset + 3);
    const last = offset + 3 === decimal.length;
    parts.push(last ? chunk : `x${chunk}`);
  }
  return parts.join('/');
}

export function tileResourcePath(level: number, index: number, partialWidth: number | null): string {
  const suffix = partialWidth === null ? '' : `.p/${String(partialWidth)}`;
  return `tile/${String(level)}/${tileIndexPath(index)}${suffix}`;
}

export function entryBundlePath(index: number, partialWidth: number | null): string {
  const suffix = partialWidth === null ? '' : `.p/${String(partialWidth)}`;
  return `tile/entries/${tileIndexPath(index)}${suffix}`;
}

/**
 * Build Merkle tiles from RFC 6962 leaf hashes. The caller hashes each
 * log entry with `hashLeaf` first; this function does not hash again.
 */
export function buildMerkleTiles(leafHashes: readonly Uint8Array[]): readonly LogTile[] {
  const tiles: LogTile[] = [];
  for (const row of tileLayout(leafHashes.length)) {
    const span = TILE_WIDTH ** row.level;
    const hashCount = row.fullTiles * TILE_WIDTH + row.partialWidth;
    const hashes: Uint8Array[] = [];
    for (let i = 0; i < hashCount; i++) {
      hashes.push(merkleRoot(leafHashes.slice(i * span, (i + 1) * span)));
    }
    for (let tile = 0; tile < row.fullTiles; tile++) {
      const slice = hashes.slice(tile * TILE_WIDTH, (tile + 1) * TILE_WIDTH);
      tiles.push(packTile(row.level, tile, null, slice));
    }
    if (row.partialWidth > 0) {
      const slice = hashes.slice(row.fullTiles * TILE_WIDTH);
      tiles.push(packTile(row.level, row.fullTiles, row.partialWidth, slice));
    }
  }
  return tiles;
}

/**
 * Entry bundle body: a sequence of big-endian uint16 lengths followed
 * by the entry bytes, as tlog-tiles specifies. Entries longer than
 * 65535 bytes are rejected.
 */
export function encodeEntryBundle(entries: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const entry of entries) {
    if (entry.length > 0xffff) throw new RangeError('log entry exceeds uint16 length');
    total += 2 + entry.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const entry of entries) {
    out[offset] = (entry.length >> 8) & 0xff;
    out[offset + 1] = entry.length & 0xff;
    out.set(entry, offset + 2);
    offset += 2 + entry.length;
  }
  return out;
}

export function decodeEntryBundle(bytes: Uint8Array): Uint8Array[] | null {
  const entries: Uint8Array[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 2 > bytes.length) return null;
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    offset += 2;
    if (offset + length > bytes.length) return null;
    entries.push(bytes.slice(offset, offset + length));
    offset += length;
  }
  return entries;
}

function packTile(
  level: number,
  index: number,
  partialWidth: number | null,
  hashes: readonly Uint8Array[],
): LogTile {
  const bytes = new Uint8Array(hashes.length * HASH_BYTES);
  hashes.forEach((hash, i) => {
    if (hash.length !== HASH_BYTES) throw new RangeError('tile hash must be 32 bytes');
    bytes.set(hash, i * HASH_BYTES);
  });
  return {
    path: tileResourcePath(level, index, partialWidth),
    level,
    index,
    partialWidth,
    hashes,
    bytes,
  };
}
