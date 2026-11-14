/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TEST ONLY trust-anchor documents. Every key is derived from a fixed
 * seed beginning with the ASCII bytes "TEST". Never use outside tests.
 */

import { ed25519 } from '@noble/curves/ed25519';
import {
  TRUST_ANCHORS_TYPE,
  anchorKeyFromPublicKey,
  createLocalEd25519Signer,
  keyIdFor,
  signTrustAnchors,
  type AnchorKey,
  type PinnedRoot,
} from '../../src/index.js';

export function testSeed(tag: number, n: number): Uint8Array {
  const seed = new Uint8Array(32);
  seed.set([0x54, 0x45, 0x53, 0x54, tag], 0);
  seed[31] = n;
  return seed;
}

export const ROOT_SEEDS = [1, 2, 3, 4].map((n) => testSeed(0xa0, n));
export const NEW_ROOT_SEEDS = [1, 2, 3].map((n) => testSeed(0xa1, n));
export const RELEASE_SEED = testSeed(0xb0, 1);
export const TV_SEED = testSeed(0xb0, 2);
export const COMPROMISED_SEED = testSeed(0xb0, 3);
export const RETIRED_SEED = testSeed(0xb0, 4);
export const SUPERSEDED_SEED = testSeed(0xb0, 5);
export const AX_SEED = testSeed(0xb0, 6);

const pub = (s: Uint8Array) => ed25519.getPublicKey(s);
const WIN = { notBefore: '2026-01-01T00:00:00Z', notAfter: '2028-01-01T00:00:00Z' };

export function rootKeys(seeds: readonly Uint8Array[]): AnchorKey[] {
  return seeds.map((s) => anchorKeyFromPublicKey(pub(s), { purpose: 'root', notBefore: '2026-01-01T00:00:00Z', notAfter: '2031-01-01T00:00:00Z' }));
}

export function pinnedFor(seeds: readonly Uint8Array[], threshold = 2): PinnedRoot {
  return { keyids: seeds.map((s) => keyIdFor(pub(s))), threshold };
}
export const PINNED = pinnedFor(ROOT_SEEDS);

export function opKeys(): AnchorKey[] {
  return [
    anchorKeyFromPublicKey(pub(RELEASE_SEED), { purpose: 'release', ...WIN }),
    anchorKeyFromPublicKey(pub(TV_SEED), { purpose: 'test-vectors', ...WIN }),
    anchorKeyFromPublicKey(pub(COMPROMISED_SEED), {
      purpose: 'release', ...WIN, status: 'revoked', revokedAt: '2026-09-01T00:00:00Z', revocationReason: 'key-compromise',
    }),
    anchorKeyFromPublicKey(pub(RETIRED_SEED), { purpose: 'release', notBefore: '2025-01-01T00:00:00Z', notAfter: '2026-03-01T00:00:00Z', status: 'retired' }),
    anchorKeyFromPublicKey(pub(SUPERSEDED_SEED), {
      purpose: 'release', ...WIN, status: 'revoked', revokedAt: '2026-09-01T00:00:00Z', revocationReason: 'superseded',
    }),
    anchorKeyFromPublicKey(pub(AX_SEED), { purpose: 'audit-export', deployment: 'dep-a', ...WIN }),
  ];
}

export function body(over: Record<string, unknown> = {}, roots: readonly Uint8Array[] = ROOT_SEEDS): Record<string, unknown> {
  return {
    _type: TRUST_ANCHORS_TYPE,
    spec_version: '1.0.0',
    issuer: 'test.invalid',
    version: 3,
    issued_at: '2026-10-01T00:00:00Z',
    expires: '2027-04-01T00:00:00Z',
    roles: { root: { keyids: roots.map((s) => keyIdFor(pub(s))), threshold: 2 } },
    keys: [...rootKeys(roots), ...opKeys()],
    ...over,
  };
}

export function sign(signed: Record<string, unknown>, seeds: readonly Uint8Array[] = [ROOT_SEEDS[0], ROOT_SEEDS[1]]) {
  return signTrustAnchors(signed, seeds.map((s) => createLocalEd25519Signer(s)));
}
