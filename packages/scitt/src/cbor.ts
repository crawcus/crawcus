/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import { Decoder, Encoder, Tag } from 'cbor-x';

const encoder = new Encoder({
  useRecords: false,
  mapsAsObjects: false,
  tagUint8Array: false,
  variableMapSize: true,
});

const decoder = new Decoder({
  useRecords: false,
  mapsAsObjects: false,
});

export function encodeCbor(value: unknown): Uint8Array {
  return new Uint8Array(encoder.encode(value));
}

export function decodeCbor(bytes: Uint8Array): unknown {
  return decoder.decode(bytes);
}

export { Tag };

/**
 * Build a CBOR map with integer keys in core-deterministic order
 * (RFC 8949 §4.2.1: shorter encodings first, then bytewise). For the
 * small integer labels used here that is: non-negative ascending, then
 * negative by absolute value ascending.
 */
export function deterministicMap(entries: readonly (readonly [number, unknown])[]): Map<number, unknown> {
  const rank = (k: number): [number, number] => {
    const major = k >= 0 ? 0 : 1;
    const n = k >= 0 ? k : -1 - k;
    const len = n < 24 ? 1 : n < 256 ? 2 : n < 65536 ? 3 : 5;
    return [len, major * 2 ** 40 + n];
  };
  const sorted = [...entries].sort((a, b) => {
    const [la, va] = rank(a[0]);
    const [lb, vb] = rank(b[0]);
    return la - lb || va - vb;
  });
  return new Map(sorted);
}
