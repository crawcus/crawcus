/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parser and evaluator unit tests. Keys are TEST ONLY.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { VERIFIER_VERSION, verifyBundle } from '../src/index.js';
import { parseTrustPolicy } from '../src/trust/parse-policy.js';
import { buildSignedBundleWithKey } from './fixtures/build-bundle.js';
import { policyPinningKey } from './fixtures/trust-policies.js';

function testSeed(n: number): Uint8Array {
  const seed = new Uint8Array(32);
  seed.set([0x54, 0x45, 0x53, 0x54], 0);
  seed[31] = n;
  return seed;
}

describe('parseTrustPolicy', () => {
  it('normalises hex and base64 of the same TEST key to one fingerprint', () => {
    const publicKey = ed25519.getPublicKey(testSeed(1));
    const hex = bytesToHex(publicKey);
    const b64 = Buffer.from(publicKey).toString('base64');
    const fromHex = parseTrustPolicy(policyPinningKey(hex));
    const fromB64 = parseTrustPolicy(policyPinningKey(b64));
    expect(fromHex.kind).toBe('ok');
    expect(fromB64.kind).toBe('ok');
    if (fromHex.kind === 'ok' && fromB64.kind === 'ok') {
      expect(fromHex.policy.anchors[0]).toMatchObject({ publicKey: hex });
      expect(fromB64.policy.anchors[0]).toMatchObject({ publicKey: hex });
      expect(fromHex.fingerprint).toBe(fromB64.fingerprint);
    }
  });

  it('accepts a reserved sigstore anchor and still fails closed for an ed25519 signature', () => {
    const parsed = parseTrustPolicy({
      crawcusTrustPolicy: 1,
      policyId: 'test-only',
      anchors: [
        {
          type: 'sigstore-identity',
          id: 'reserved',
          issuer: 'https://token.actions.githubusercontent.com',
          subject: 'https://github.com/example/consumer/.github/workflows/sign.yml@refs/heads/main',
        },
      ],
    });
    expect(parsed.kind).toBe('ok');
    const fixture = buildSignedBundleWithKey(testSeed(1));
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: '2026-10-15T00:00:00.000Z', trustPolicy: parsed.kind === 'ok' ? parsed.policy : {} },
    });
    expect(result.verdict).toBe('untrusted-signer');
    expect(result.trust.reason).toBe('signer.untrusted.unknown-key');
  });

  it('notes a self-asserted signing time when a superseded key is still inside its window', () => {
    const publicKey = bytesToHex(ed25519.getPublicKey(testSeed(1)));
    const fixture = buildSignedBundleWithKey(testSeed(1), {
      eventTimestamp: '2026-08-11T00:00:00.000Z',
    });
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: {
        verifiedAt: '2026-10-15T00:00:00.000Z',
        trustPolicy: {
          crawcusTrustPolicy: 1,
          policyId: 'test-only',
          anchors: [{ type: 'ed25519-pinned', id: 'old', publicKey, label: 'TEST ONLY' }],
          revoked: [{ publicKey, revokedAt: '2026-08-31T00:00:00Z', reason: 'superseded' }],
        },
      },
    });
    expect(result.verdict).toBe('pass');
    expect(result.checks.find((check) => check.id === 'dsse.signer-trust')?.detail).toMatch(
      /signing time self-asserted/,
    );
  });
});

describe('VERIFIER_VERSION', () => {
  it('matches packages/verifier/package.json', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(VERIFIER_VERSION).toBe(pkg.version);
    expect(pkg.version).toBe('0.4.0');
  });
});
