/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/** TEST ONLY. Fixed seeds prefixed "TEST"; never pin these in a deployment. */
import { ed25519 } from '@noble/curves/ed25519';

export function testSeed(n: number): Uint8Array {
  const seed = new Uint8Array(32);
  seed.set([0x54, 0x45, 0x53, 0x54], 0);
  seed[31] = n;
  return seed;
}

export function testKey(n: number): { secretKey: Uint8Array; publicKey: Uint8Array; kid: Uint8Array } {
  const secretKey = testSeed(n);
  const publicKey = ed25519.getPublicKey(secretKey);
  return { secretKey, publicKey, kid: new TextEncoder().encode(`test-key-${String(n)}`) };
}

/** Illustrative JCS-canonical bundle bytes (keys sorted, no whitespace). */
export const TEST_PAYLOAD = new TextEncoder().encode(
  '{"bundleVersion":"0.1.0","events":[{"id":"evt_0000","timestamp":"2026-08-11T00:00:00.000Z"}],"intent":{"id":"i_test","key":"TestIntent"}}',
);

export function hex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex');
}
