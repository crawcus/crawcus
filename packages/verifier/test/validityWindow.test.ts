/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/** Validity windows are half-open: [notBefore, notAfter). TEST ONLY keys. */

import { describe, expect, it } from 'vitest';
import { verifyBundle } from '../src/index.js';
import { parseTrustPolicy } from '../src/trust/parse-policy.js';
import { buildSignedBundleWithKey } from './fixtures/build-bundle.js';
import { policyPinningKey } from './fixtures/trust-policies.js';

const seed = new Uint8Array(32);
seed.set([0x54, 0x45, 0x53, 0x54], 0);
seed[31] = 42;

function run(ts: string) {
  const f = buildSignedBundleWithKey(seed, { eventTimestamp: ts });
  return verifyBundle({
    bundle: f.bundleBytes,
    options: {
      verifiedAt: '2026-10-15T00:00:00.000Z',
      trustPolicy: policyPinningKey(f.publicKey, { notBefore: '2026-01-01T00:00:00Z', notAfter: '2026-07-01T00:00:00Z' }),
    },
  });
}

describe('half-open validity window', () => {
  it('notBefore is inclusive', () => {
    expect(run('2026-01-01T00:00:00.000Z').verdict).toBe('pass');
  });
  it('one millisecond before notAfter is valid', () => {
    expect(run('2026-06-30T23:59:59.999Z').verdict).toBe('pass');
  });
  it('notAfter itself is exclusive', () => {
    const r = run('2026-07-01T00:00:00.000Z');
    expect(r.trust.reason).toBe('signer.untrusted.expired');
  });
  it('an empty window (notBefore == notAfter) is malformed', () => {
    const p = policyPinningKey('c800f2063ef6f1b5a92362aee2c9f3a6332872bd427b0b03c2051cd8b542b24b', {
      notBefore: '2026-01-01T00:00:00Z', notAfter: '2026-01-01T00:00:00Z',
    });
    expect(parseTrustPolicy(p).kind).toBe('fail');
  });
});
