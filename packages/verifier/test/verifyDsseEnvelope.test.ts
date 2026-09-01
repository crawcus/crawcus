/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for `verifyDsseSignature` (re-exported as `verifyDsseEnvelope`).
 *
 * Spec §6a row 2:
 *   - Valid ed25519 sig
 *   - Tampered payload
 *   - Wrong key
 *   - Cosign-emitted envelope round-trip (cross-vendor fixture — handled
 *     in `verifyBundle.integration.test.ts` because it exercises the
 *     full pipeline, not just the signature check in isolation)
 */

import { ed25519 } from '@noble/curves/ed25519';
import { describe, expect, it } from 'vitest';
import { verifyDsseSignature } from '../src/dsse.js';
import { parseSignedBundle } from '../src/parse.js';
import { buildSignedBundle } from './fixtures/build-bundle.js';

describe('verifyDsseEnvelope', () => {
  it('verifies a valid ed25519 signature', () => {
    const fixture = buildSignedBundle();
    const parsed = parseSignedBundle(fixture.bundleBytes);
    expect(parsed.kind).toBe('ok');
    if (parsed.kind !== 'ok') return;

    const result = verifyDsseSignature(parsed.parsed.envelope, parsed.parsed.payloadBytes);
    expect(result.verdict).toBe('pass');
  });

  it('fails on tampered payload bytes (PAE no longer matches signature)', () => {
    const fixture = buildSignedBundle();
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const tamperedPayload = new Uint8Array(parsed.parsed.payloadBytes);
    // Flip a byte in the middle of the payload.
    tamperedPayload[Math.floor(tamperedPayload.length / 2)] ^= 0x01;

    const result = verifyDsseSignature(parsed.parsed.envelope, tamperedPayload);
    expect(result.verdict).toBe('fail');
    expect(result.violationKind).toBe('Envelope.signature.invalid');
  });

  it('fails on wrong public key (signature does not verify)', () => {
    const fixture = buildSignedBundle();
    // Generate a different key and re-emit envelope with it as keyid.
    const wrongPriv = ed25519.utils.randomPrivateKey();
    const wrongPub = ed25519.getPublicKey(wrongPriv);
    const wrongKeyid = Array.from(wrongPub)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const tamperedEnvelope = {
      ...JSON.parse(new TextDecoder().decode(fixture.bundleBytes)),
    };
    tamperedEnvelope.signatures = [{ ...tamperedEnvelope.signatures[0], keyid: wrongKeyid }];
    const bundleBytes = new TextEncoder().encode(JSON.stringify(tamperedEnvelope));

    const parsed = parseSignedBundle(bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const result = verifyDsseSignature(parsed.parsed.envelope, parsed.parsed.payloadBytes);
    expect(result.verdict).toBe('fail');
    expect(result.violationKind).toBe('Envelope.signature.invalid');
  });

  it('fails on keyid that is not a valid 32-byte ed25519 public key', () => {
    const fixture = buildSignedBundle({ overrideKeyId: 'not-a-valid-keyid' });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const result = verifyDsseSignature(parsed.parsed.envelope, parsed.parsed.payloadBytes);
    expect(result.verdict).toBe('fail');
    expect(result.violationKind).toBe('Envelope.signature.invalid');
    expect(result.detail).toMatch(/keyid/);
  });

  it('fails on signature with wrong length (not 64 bytes)', () => {
    const fixture = buildSignedBundle();
    const env = JSON.parse(new TextDecoder().decode(fixture.bundleBytes));
    env.signatures[0].sig = Buffer.from(new Uint8Array(32)).toString('base64');
    const bytes = new TextEncoder().encode(JSON.stringify(env));
    const parsed = parseSignedBundle(bytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const result = verifyDsseSignature(parsed.parsed.envelope, parsed.parsed.payloadBytes);
    expect(result.verdict).toBe('fail');
    expect(result.violationKind).toBe('Envelope.signature.invalid');
    expect(result.detail).toMatch(/length/);
  });

  it('accepts base64-encoded keyid (32-byte ed25519 pubkey)', () => {
    const priv = ed25519.utils.randomPrivateKey();
    const pub = ed25519.getPublicKey(priv);
    const base64Keyid = Buffer.from(pub).toString('base64');
    const fixture = buildSignedBundle({ privateKey: priv, overrideKeyId: base64Keyid });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');
    const result = verifyDsseSignature(parsed.parsed.envelope, parsed.parsed.payloadBytes);
    expect(result.verdict).toBe('pass');
  });
});
