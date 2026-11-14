/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * End-to-end signer-trust cases T1–T17.
 *
 * Keys in this file are TEST ONLY. They are generated from fixed
 * 32-byte seeds prefixed with the ASCII bytes "TEST". They are not
 * production keys and must not be copied into a deployed policy.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ed25519 } from '@noble/curves/ed25519';
import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { verifyBundle } from '../src/index.js';
import { parseTrustPolicy } from '../src/trust/parse-policy.js';
import {
  buildSignedBundle,
  buildSignedBundleWithKey,
  resignWithKey,
} from './fixtures/build-bundle.js';
import { policyPinningKey, RFC8032_TEST_PUBLIC_KEY } from './fixtures/trust-policies.js';
import type { TrustPolicy, VerifyResult } from '../src/index.js';

const VERIFIED_AT = '2026-10-15T00:00:00.000Z';

function testSeed(n: number): Uint8Array {
  const seed = new Uint8Array(32);
  seed.set([0x54, 0x45, 0x53, 0x54], 0);
  seed[31] = n;
  return seed;
}

function trustFollowsSignature(result: VerifyResult): void {
  const signature = result.checks.findIndex((check) => check.id === 'dsse.signature');
  expect(signature).toBeGreaterThanOrEqual(0);
  expect(result.checks[signature + 1]?.id).toBe('dsse.signer-trust');
}

function detailsAreBounded(result: VerifyResult): void {
  for (const check of result.checks) {
    expect(check.detail.length).toBeLessThanOrEqual(200);
  }
}

describe('verifyBundle signer trust', () => {
  it('T1 valid pinned key', () => {
    const seed = testSeed(1);
    const fixture = buildSignedBundleWithKey(seed);
    const trustPolicy = policyPinningKey(fixture.publicKey);
    const parsed = parseTrustPolicy(trustPolicy);
    expect(parsed.kind).toBe('ok');
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy },
    });
    expect(result.verdict).toBe('pass');
    expect(result.trust.decision).toBe('trusted');
    expect(result.trust.reason).toBe('signer.trusted.pinned-key');
    expect(result.trust.signer?.anchorId).toBe('test-signer');
    expect(result.trust.policyFingerprint).toMatch(/^[0-9a-f]{64}$/);
    if (parsed.kind === 'ok') {
      expect(result.trust.policyFingerprint).toBe(parsed.fingerprint);
    }
    trustFollowsSignature(result);
    detailsAreBounded(result);
  });

  it('T2 attacker re-sign, same payload', () => {
    const legit = buildSignedBundleWithKey(testSeed(1));
    const attacked = resignWithKey(legit.bundleBytes, testSeed(2));
    const result = verifyBundle({
      bundle: attacked,
      options: {
        verifiedAt: VERIFIED_AT,
        trustPolicy: policyPinningKey(legit.publicKey),
      },
    });
    expect(result.verdict).toBe('untrusted-signer');
    expect(result.trust.decision).toBe('untrusted');
    expect(result.trust.reason).toBe('signer.untrusted.unknown-key');
    expect(result.verdict).not.toBe('pass');
    trustFollowsSignature(result);
  });

  it('T3 attacker re-sign and recomputed hashes', () => {
    const legit = ed25519.getPublicKey(testSeed(1));
    const forged = buildSignedBundleWithKey(testSeed(2));
    const result = verifyBundle({
      bundle: forged.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy: policyPinningKey(legit) },
    });
    expect(result.verdict).toBe('untrusted-signer');
    expect(result.trust.reason).toBe('signer.untrusted.unknown-key');
    for (const id of ['dsse.signature', 'chain.jcs-hash-equivalence', 'chain.hash-chain']) {
      expect(result.checks.find((check) => check.id === id)?.verdict).toBe('pass');
    }
    trustFollowsSignature(result);
  });

  it('T4 no policy', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const bytes = new Uint8Array(readFileSync(join(here, 'fixtures', 'cosign-emitted-bundle.json')));
    const result = verifyBundle({ bundle: bytes, options: { verifiedAt: VERIFIED_AT } });
    expect(result.verdict).toBe('untrusted-signer');
    expect(result.trust.decision).toBe('untrusted');
    expect(result.trust.reason).toBe('signer.untrusted.no-policy');
    trustFollowsSignature(result);
  });

  it('T5 allowUntrustedSignerForTestsOnly without a policy', () => {
    const fixture = buildSignedBundleWithKey(testSeed(1));
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, allowUntrustedSignerForTestsOnly: true },
    });
    expect(result.verdict).toBe('pass');
    expect(result.trust.decision).toBe('untrusted');
    expect(result.trust.reason).toBe('signer.untrusted.no-policy');
  });

  it('T6 rotated key within overlap', () => {
    const oldKey = testSeed(1);
    const newKey = testSeed(3);
    const fixture = buildSignedBundleWithKey(oldKey, {
      eventTimestamp: '2026-08-11T00:00:00.000Z',
    });
    const trustPolicy: TrustPolicy = {
      crawcusTrustPolicy: 1,
      policyId: 'test-only',
      description: 'TEST ONLY',
      anchors: [
        {
          type: 'ed25519-pinned',
          id: 'old',
          publicKey: bytesToHex(ed25519.getPublicKey(oldKey)),
          notAfter: '2026-08-31T00:00:00Z',
          label: 'TEST ONLY old',
        },
        {
          type: 'ed25519-pinned',
          id: 'new',
          publicKey: bytesToHex(ed25519.getPublicKey(newKey)),
          notBefore: '2026-08-01T00:00:00Z',
          label: 'TEST ONLY new',
        },
      ],
    };
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy },
    });
    expect(result.verdict).toBe('pass');
    expect(result.trust.reason).toBe('signer.trusted.pinned-key');
    expect(result.trust.signer?.anchorId).toBe('old');
  });

  it('T7 rotated key after supersede', () => {
    const oldKey = testSeed(1);
    const publicKey = bytesToHex(ed25519.getPublicKey(oldKey));
    const fixture = buildSignedBundleWithKey(oldKey, {
      eventTimestamp: '2026-09-10T00:00:00.000Z',
    });
    const trustPolicy: TrustPolicy = {
      crawcusTrustPolicy: 1,
      policyId: 'test-only',
      anchors: [
        {
          type: 'ed25519-pinned',
          id: 'old',
          publicKey,
          label: 'TEST ONLY',
        },
      ],
      revoked: [{ publicKey, revokedAt: '2026-08-31T00:00:00Z', reason: 'superseded' }],
    };
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy },
    });
    expect(result.verdict).toBe('untrusted-signer');
    expect(result.trust.reason).toBe('signer.untrusted.revoked');
  });

  it('T8 revoked for compromise, including a back-dated bundle', () => {
    const key = testSeed(1);
    const publicKey = bytesToHex(ed25519.getPublicKey(key));
    const fixture = buildSignedBundleWithKey(key, {
      eventTimestamp: '2026-01-01T00:00:00.000Z',
    });
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: {
        verifiedAt: VERIFIED_AT,
        trustPolicy: policyPinningKey(publicKey, {
          revoked: [{ publicKey, revokedAt: '2026-09-01T00:00:00Z', reason: 'key-compromise' }],
        }),
      },
    });
    expect(result.verdict).toBe('fail');
    expect(result.trust.reason).toBe('signer.untrusted.revoked');
    expect(result.checks.find((check) => check.id === 'dsse.signer-trust')?.violationKind).toBe(
      'Envelope.signer.revoked',
    );
  });

  it('T9 expired window', () => {
    const fixture = buildSignedBundleWithKey(testSeed(1));
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: {
        verifiedAt: VERIFIED_AT,
        trustPolicy: policyPinningKey(fixture.publicKey, { notAfter: '2026-01-01T00:00:00Z' }),
      },
    });
    expect(result.verdict).toBe('untrusted-signer');
    expect(result.trust.reason).toBe('signer.untrusted.expired');
  });

  it('T10 not yet valid', () => {
    const fixture = buildSignedBundleWithKey(testSeed(1));
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: {
        verifiedAt: VERIFIED_AT,
        trustPolicy: policyPinningKey(fixture.publicKey, { notBefore: '2026-02-01T00:00:00Z' }),
      },
    });
    expect(result.verdict).toBe('untrusted-signer');
    expect(result.trust.reason).toBe('signer.untrusted.not-yet-valid');
  });

  it('T11 payload type not allowed', () => {
    const fixture = buildSignedBundleWithKey(testSeed(1));
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: {
        verifiedAt: VERIFIED_AT,
        trustPolicy: policyPinningKey(fixture.publicKey, {
          payloadTypes: ['application/vnd.crawcus.disclosure-bundle+jsonl'],
        }),
      },
    });
    expect(result.verdict).toBe('untrusted-signer');
    expect(result.trust.reason).toBe('signer.untrusted.payload-type-not-allowed');
  });

  it('T12a malformed policy unknown field', () => {
    expectMalformed({ ...basePolicy(), unexpected: true });
  });

  it('T12b malformed policy duplicate anchor id', () => {
    const key = bytesToHex(ed25519.getPublicKey(testSeed(1)));
    expectMalformed({
      ...basePolicy(),
      anchors: [
        { type: 'ed25519-pinned', id: 'same', publicKey: key },
        { type: 'ed25519-pinned', id: 'same', publicKey: bytesToHex(ed25519.getPublicKey(testSeed(2))) },
      ],
    });
  });

  it('T12c malformed policy bad key length', () => {
    expectMalformed({
      ...basePolicy(),
      anchors: [{ type: 'ed25519-pinned', id: 'short', publicKey: 'aa'.repeat(31) }],
    });
  });

  it('T12d malformed policy bad date', () => {
    expectMalformed({
      ...basePolicy(),
      anchors: [
        {
          type: 'ed25519-pinned',
          id: 'dated',
          publicKey: bytesToHex(ed25519.getPublicKey(testSeed(1))),
          notAfter: 'tomorrow',
        },
      ],
    });
  });

  it('T12e malformed policy empty anchors', () => {
    expectMalformed({ ...basePolicy(), anchors: [] });
  });

  it('T12f malformed policy version 2', () => {
    expectMalformed({ ...basePolicy(), crawcusTrustPolicy: 2 });
  });

  it('T12g malformed policy non-object', () => {
    expectMalformed('not-a-policy');
  });

  it('T12h malformed policy threshold present', () => {
    expectMalformed({ ...basePolicy(), threshold: 2 });
  });

  it('T13 tampered payload with a trusted policy', () => {
    const fixture = buildSignedBundleWithKey(testSeed(1));
    const env = JSON.parse(new TextDecoder().decode(fixture.bundleBytes)) as {
      payload: string;
    };
    const payloadBytes = new Uint8Array(Buffer.from(env.payload, 'base64'));
    payloadBytes[Math.floor(payloadBytes.length / 2)] ^= 0x01;
    env.payload = Buffer.from(payloadBytes).toString('base64');
    const result = verifyBundle({
      bundle: new TextEncoder().encode(JSON.stringify(env)),
      options: {
        verifiedAt: VERIFIED_AT,
        trustPolicy: policyPinningKey(fixture.publicKey),
      },
    });
    expect(result.verdict).toBe('fail');
    expect(result.checks.some((check) => check.id === 'dsse.signature' && check.verdict === 'fail')).toBe(
      true,
    );
    expect(result.trust.decision).toBe('not-evaluated');
    expect(result.trust.reason).toBe('signature.invalid');
    trustFollowsSignature(result);
  });

  it('T14 multiple signatures, first trusted wins', () => {
    const legit = buildSignedBundleWithKey(testSeed(1));
    const legitEnv = JSON.parse(new TextDecoder().decode(legit.bundleBytes)) as {
      payloadType: string;
      payload: string;
      signatures: { keyid: string; sig: string }[];
    };
    const attackerEnv = JSON.parse(
      new TextDecoder().decode(resignWithKey(legit.bundleBytes, testSeed(2))),
    ) as { signatures: { keyid: string; sig: string }[] };
    const attackerThenLegit = new TextEncoder().encode(
      JSON.stringify({
        ...legitEnv,
        signatures: [attackerEnv.signatures[0], legitEnv.signatures[0]],
      }),
    );
    const trusted = verifyBundle({
      bundle: attackerThenLegit,
      options: { verifiedAt: VERIFIED_AT, trustPolicy: policyPinningKey(legit.publicKey) },
    });
    expect(trusted.verdict).toBe('pass');
    expect(trusted.trust.signer?.anchorId).toBe('test-signer');
    expect(trusted.trust.signer?.publicKey).toBe(bytesToHex(legit.publicKey));

    const flipped = Buffer.from(legitEnv.signatures[0]?.sig ?? '', 'base64');
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    const badThenAttacker = new TextEncoder().encode(
      JSON.stringify({
        ...legitEnv,
        signatures: [
          { keyid: legitEnv.signatures[0]?.keyid, sig: flipped.toString('base64') },
          attackerEnv.signatures[0],
        ],
      }),
    );
    const untrusted = verifyBundle({
      bundle: badThenAttacker,
      options: { verifiedAt: VERIFIED_AT, trustPolicy: policyPinningKey(legit.publicKey) },
    });
    expect(untrusted.verdict).toBe('untrusted-signer');
    expect(untrusted.trust.reason).toBe('signer.untrusted.unknown-key');
  });

  it('T15 determinism and fingerprint stability', () => {
    const fixture = buildSignedBundleWithKey(testSeed(1));
    const trustPolicy = policyPinningKey(fixture.publicKey);
    const first = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy },
    });
    const second = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy },
    });
    expect(second).toEqual(first);

    const reordered = {
      anchors: trustPolicy.anchors,
      policyId: trustPolicy.policyId,
      description: trustPolicy.description,
      crawcusTrustPolicy: trustPolicy.crawcusTrustPolicy,
    };
    const a = parseTrustPolicy(trustPolicy);
    const b = parseTrustPolicy(reordered);
    expect(a.kind).toBe('ok');
    expect(b.kind).toBe('ok');
    if (a.kind === 'ok' && b.kind === 'ok') {
      expect(a.fingerprint).toBe(b.fingerprint);
    }
  });

  it('T16 detail hygiene for a hostile keyid', () => {
    const hostile = `\u0001${'A'.repeat(10_000)}\n`;
    const fixture = buildSignedBundle({ overrideKeyId: hostile });
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy: policyPinningKey(fixture.publicKey) },
    });
    detailsAreBounded(result);
    for (const check of result.checks) {
      expect(check.detail.includes(hostile)).toBe(false);
      expect(check.detail.includes('\u0001')).toBe(false);
      expect(check.detail.includes('A'.repeat(17))).toBe(false);
    }
  });

  it('T17 production policy files do not pin the RFC 8032 test key', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const hits: string[] = [];
    for (const dir of ['docs', 'examples']) {
      collectTrustPolicies(join(root, dir), hits);
    }
    for (const file of hits) {
      const text = readFileSync(file, 'utf8').toLowerCase();
      expect(text.includes(RFC8032_TEST_PUBLIC_KEY)).toBe(false);
    }
  });
});

function basePolicy(): Record<string, unknown> {
  return {
    crawcusTrustPolicy: 1,
    policyId: 'test-only',
    anchors: [
      {
        type: 'ed25519-pinned',
        id: 'test-signer',
        publicKey: bytesToHex(ed25519.getPublicKey(testSeed(1))),
      },
    ],
  };
}

function expectMalformed(trustPolicy: unknown): void {
  const fixture = buildSignedBundleWithKey(testSeed(1));
  expect(() =>
    verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: VERIFIED_AT, trustPolicy },
    }),
  ).not.toThrow();
  const result = verifyBundle({
    bundle: fixture.bundleBytes,
    options: { verifiedAt: VERIFIED_AT, trustPolicy },
  });
  expect(result.verdict).toBe('fail');
  expect(result.trust.reason).toBe('policy.malformed');
  expect(result.checks.find((check) => check.id === 'dsse.signer-trust')?.violationKind).toBe(
    'TrustPolicy.malformed',
  );
}

function collectTrustPolicies(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) collectTrustPolicies(path, out);
    else if (entry.endsWith('.trust-policy.json')) out.push(path);
  }
}
