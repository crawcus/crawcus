/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression tests for the prior review of the signer-trust change:
 *   R1 the integrity-only DSSE primitive is not on the public surface;
 *   R2 the dsse.signature audit cite names the signature that verified;
 *   R3 a self-asserted signing time is flagged on the trust result;
 *   R4 the test-only hatch has a loud name and never upgrades trust.
 *
 * Keys are TEST ONLY, generated from fixed seeds prefixed "TEST".
 */

import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import * as publicApi from '../src/index.js';
import { verifyBundle } from '../src/index.js';
import { verifyDsseSignatureUntrusted } from '../src/dsse.js';
import { parseSignedBundle } from '../src/parse.js';
import { buildSignedBundleWithKey, resignWithKey } from './fixtures/build-bundle.js';
import { policyPinningKey } from './fixtures/trust-policies.js';
import type { TrustPolicy } from '../src/index.js';

const VERIFIED_AT = '2026-10-15T00:00:00.000Z';

function testSeed(n: number): Uint8Array {
  const seed = new Uint8Array(32);
  seed.set([0x54, 0x45, 0x53, 0x54], 0);
  seed[31] = n;
  return seed;
}

type Env = { payloadType: string; payload: string; signatures: { keyid: string; sig: string }[] };

function decode(bytes: Uint8Array): Env {
  return JSON.parse(new TextDecoder().decode(bytes)) as Env;
}

function encode(env: Env): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(env));
}

describe('R1 integrity-only primitive is not public', () => {
  it('does not export verifyDsseEnvelope or the untrusted primitive', () => {
    const names = Object.keys(publicApi);
    expect(names).not.toContain('verifyDsseEnvelope');
    expect(names).not.toContain('verifyDsseSignature');
    expect(names).not.toContain('verifyDsseSignatureUntrusted');
    expect(names).toContain('verifyBundle');
  });

  it('the raw primitive passes an attacker re-sign, which is why it is internal', () => {
    const legit = buildSignedBundleWithKey(testSeed(1));
    const attacked = resignWithKey(legit.bundleBytes, testSeed(2));
    const parsed = parseSignedBundle(attacked);
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;
    const raw = verifyDsseSignatureUntrusted(parsed.parsed.envelope, parsed.parsed.payloadBytes);
    expect(raw.verdict).toBe('pass');
    expect(raw.detail).toMatch(/integrity only/);

    const checked = verifyBundle({
      bundle: attacked,
      options: { verifiedAt: VERIFIED_AT, trustPolicy: policyPinningKey(legit.publicKey) },
    });
    expect(checked.verdict).toBe('untrusted-signer');
  });
});

describe('R2 dsse.signature cites the signature that verified', () => {
  it('cites signatures[1] when signatures[0] is corrupt', () => {
    const legit = buildSignedBundleWithKey(testSeed(1));
    const env = decode(legit.bundleBytes);
    const good = env.signatures[0];
    expect(good).toBeDefined();
    if (good === undefined) return;
    const flipped = Buffer.from(good.sig, 'base64');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    const bundle = encode({
      ...env,
      signatures: [{ keyid: good.keyid, sig: flipped.toString('base64') }, good],
    });
    const result = verifyBundle({
      bundle,
      options: { verifiedAt: VERIFIED_AT, trustPolicy: policyPinningKey(legit.publicKey) },
    });
    expect(result.verdict).toBe('pass');
    const sig = result.checks.find((check) => check.id === 'dsse.signature');
    expect(sig?.cite).toEqual([{ kind: 'envelope-field', value: 'signatures[1]' }]);
    const trust = result.checks.find((check) => check.id === 'dsse.signer-trust');
    expect(trust?.cite).toEqual([{ kind: 'envelope-field', value: 'signatures[1]' }]);
  });

  it('still cites signatures[0] for a single valid signature', () => {
    const fixture = buildSignedBundleWithKey(testSeed(1));
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy: policyPinningKey(fixture.publicKey) },
    });
    const sig = result.checks.find((check) => check.id === 'dsse.signature');
    expect(sig?.cite).toEqual([{ kind: 'envelope-field', value: 'signatures[0]' }]);
  });
});

describe('R3 self-asserted signing time is flagged', () => {
  it('marks the bundle event timestamp as self-asserted', () => {
    const fixture = buildSignedBundleWithKey(testSeed(1), {
      eventTimestamp: '2026-08-11T00:00:00.000Z',
    });
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy: policyPinningKey(fixture.publicKey) },
    });
    expect(result.trust.signer?.signingTimeSource).toBe('bundle-latest-event-ts');
    expect(result.trust.signer?.signingTimeSelfAsserted).toBe(true);
  });

  it('a back-dated bundle from a superseded key is accepted (documented limit), but flagged', () => {
    const key = testSeed(1);
    const publicKey = bytesToHex(ed25519.getPublicKey(key));
    const backDated = buildSignedBundleWithKey(key, {
      eventTimestamp: '2026-08-01T00:00:00.000Z',
    });
    const trustPolicy: TrustPolicy = {
      crawcusTrustPolicy: 1,
      policyId: 'test-only',
      anchors: [{ type: 'ed25519-pinned', id: 'old', publicKey, label: 'TEST ONLY' }],
      revoked: [{ publicKey, revokedAt: '2026-08-31T00:00:00Z', reason: 'superseded' }],
    };
    const result = verifyBundle({
      bundle: backDated.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy },
    });
    expect(result.verdict).toBe('pass');
    expect(result.trust.signer?.signingTimeSelfAsserted).toBe(true);
    const trust = result.checks.find((check) => check.id === 'dsse.signer-trust');
    expect(trust?.detail).toMatch(/self-asserted/);
  });

  it('key-compromise rejects the same back-dated bundle', () => {
    const key = testSeed(1);
    const publicKey = bytesToHex(ed25519.getPublicKey(key));
    const backDated = buildSignedBundleWithKey(key, {
      eventTimestamp: '2026-08-01T00:00:00.000Z',
    });
    const trustPolicy: TrustPolicy = {
      crawcusTrustPolicy: 1,
      policyId: 'test-only',
      anchors: [{ type: 'ed25519-pinned', id: 'old', publicKey, label: 'TEST ONLY' }],
      revoked: [{ publicKey, revokedAt: '2026-08-31T00:00:00Z', reason: 'key-compromise' }],
    };
    const result = verifyBundle({
      bundle: backDated.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy },
    });
    expect(result.verdict).toBe('fail');
    expect(result.trust.reason).toBe('signer.untrusted.revoked');
  });
});

describe('R4 test-only hatch', () => {
  it('the old option name has no effect', () => {
    const fixture = buildSignedBundleWithKey(testSeed(1));
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: {
        verifiedAt: VERIFIED_AT,
        ...({ allowUntrustedSigner: true } as Record<string, unknown>),
      },
    });
    expect(result.verdict).toBe('untrusted-signer');
  });

  it('the renamed hatch keeps trust.decision untrusted', () => {
    const fixture = buildSignedBundleWithKey(testSeed(1));
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, allowUntrustedSignerForTestsOnly: true },
    });
    expect(result.verdict).toBe('pass');
    expect(result.trust.decision).toBe('untrusted');
  });

  it('the hatch never rescues a key-compromise revocation', () => {
    const key = testSeed(1);
    const publicKey = bytesToHex(ed25519.getPublicKey(key));
    const fixture = buildSignedBundleWithKey(key);
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: {
        verifiedAt: VERIFIED_AT,
        allowUntrustedSignerForTestsOnly: true,
        trustPolicy: {
          crawcusTrustPolicy: 1,
          policyId: 'test-only',
          anchors: [{ type: 'ed25519-pinned', id: 'k', publicKey, label: 'TEST ONLY' }],
          revoked: [{ publicKey, revokedAt: '2026-01-01T00:00:00Z', reason: 'key-compromise' }],
        },
      },
    });
    expect(result.verdict).toBe('fail');
  });
});
