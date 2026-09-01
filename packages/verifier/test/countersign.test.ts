/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for `countersignResult` — TKT-VERIFIER-1b spec §5a row 2.
 *
 * Coverage:
 *   - ed25519 sign-verify round-trip (raw 32-byte seed, hex string, PKCS#8 PEM)
 *   - Malformed key blob rejected with a clear error
 *   - Fail-result countersigning works (auditor attests to verifier output, not verdict)
 *   - signerKeyId default = hex pubkey; override is preserved
 *   - Deterministic envelope when signedAt + signerKeyId fixed
 *   - Envelope payloadType is `application/vnd.crawcus.verify-result+jsonl`
 *     (fits canon open-enum per crawcus-format.md:669-677; surfaced per §7(b))
 *   - PAE convention matches the audit-bundle envelope (one verifier
 *     can use one PAE for both)
 */

import { ed25519 } from '@noble/curves/ed25519';
import { describe, expect, it } from 'vitest';
import {
  countersignResult,
  decodeAuditorPrivateKey,
  PAYLOAD_TYPE_VERIFY_RESULT,
} from '../src/countersign.js';
import { preAuthenticationEncoding } from '../src/dsse.js';
import type { VerifyResult } from '../src/types.js';

function makeResult(verdict: VerifyResult['verdict'] = 'pass'): VerifyResult {
  return {
    verdict,
    checks: [
      {
        id: 'dsse.envelope.shape',
        label: 'DSSE envelope shape',
        verdict: 'pass',
        detail: 'parsed cleanly',
      },
    ],
    bundleMetadata: {
      bundleId: 'i_test',
      schemaVersion: '0.1.0',
      payloadType: 'application/vnd.crawcus.bundle+jsonl',
      signerKeyId: 'aa'.repeat(32),
      eventCount: 3,
      contractCount: 0,
      earliestEventTs: '2026-01-01T00:00:00.000Z',
      latestEventTs: '2026-01-01T00:00:02.000Z',
    },
    verifiedAt: '2026-06-03T12:00:00.000Z',
    verifierIdentity: {
      version: '0.2.0',
      publicKeyFingerprint: 'wave1-unsigned',
      buildSha: 'devbuild',
    },
  };
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}

interface EnvelopeJson {
  readonly payloadType: string;
  readonly payload: string;
  readonly signatures: readonly { readonly keyid: string; readonly sig: string }[];
}

function parseEnvelope(bytes: Uint8Array): EnvelopeJson {
  return JSON.parse(new TextDecoder().decode(bytes)) as EnvelopeJson;
}

describe('countersignResult — Wave-1b auditor flow', () => {
  it('signs the JCS-canonical VerifyResult with raw 32-byte seed', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const pubkey = ed25519.getPublicKey(seed);
    const result = makeResult();
    const out = countersignResult({
      result,
      signerKey: seed,
      signedAt: '2026-06-03T13:00:00.000Z',
    });

    const envelope = parseEnvelope(out.envelope);
    expect(envelope.payloadType).toBe(PAYLOAD_TYPE_VERIFY_RESULT);
    expect(envelope.signatures).toHaveLength(1);
    expect(envelope.signatures[0]?.keyid).toBe(bytesToHex(pubkey));

    // PAE-verify round-trip — auditor sig MUST verify against the
    // derived pubkey using the same DSSE PAE convention as the
    // audit-bundle envelope.
    const payloadBytes = new Uint8Array(Buffer.from(envelope.payload, 'base64'));
    const sigBytes = new Uint8Array(Buffer.from(envelope.signatures[0]?.sig ?? '', 'base64'));
    const pae = preAuthenticationEncoding(envelope.payloadType, payloadBytes);
    expect(ed25519.verify(sigBytes, pae, pubkey)).toBe(true);
  });

  it('accepts hex-encoded 64-char seed string', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const hex = bytesToHex(seed);
    const pubkey = ed25519.getPublicKey(seed);
    const out = countersignResult({ result: makeResult(), signerKey: hex });
    const envelope = parseEnvelope(out.envelope);
    expect(envelope.signatures[0]?.keyid).toBe(bytesToHex(pubkey));
  });

  it('accepts a PKCS#8 PEM blob (openssl genpkey output shape)', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const pubkey = ed25519.getPublicKey(seed);
    // Build the canonical 48-byte PKCS#8 DER manually + base64-armour.
    const der = new Uint8Array([
      0x30,
      0x2e,
      0x02,
      0x01,
      0x00,
      0x30,
      0x05,
      0x06,
      0x03,
      0x2b,
      0x65,
      0x70,
      0x04,
      0x22,
      0x04,
      0x20,
      ...seed,
    ]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----\n`;

    const out = countersignResult({ result: makeResult(), signerKey: pem });
    const envelope = parseEnvelope(out.envelope);
    expect(envelope.signatures[0]?.keyid).toBe(bytesToHex(pubkey));
  });

  it('rejects a Uint8Array of wrong length', () => {
    expect(() =>
      countersignResult({ result: makeResult(), signerKey: new Uint8Array(31) }),
    ).toThrow(/32 bytes/);
  });

  it('rejects a non-hex / non-PEM string', () => {
    expect(() => countersignResult({ result: makeResult(), signerKey: 'not-a-key' })).toThrow(
      /32-byte|hex|PEM/,
    );
  });

  it('rejects a PKCS#8 PEM with wrong outer SEQUENCE header', () => {
    const seed = ed25519.utils.randomPrivateKey();
    // Corrupt the outer SEQUENCE byte (should be 0x30).
    const der = new Uint8Array([
      0x31, // ← wrong
      0x2e,
      0x02,
      0x01,
      0x00,
      0x30,
      0x05,
      0x06,
      0x03,
      0x2b,
      0x65,
      0x70,
      0x04,
      0x22,
      0x04,
      0x20,
      ...seed,
    ]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----\n`;
    expect(() => countersignResult({ result: makeResult(), signerKey: pem })).toThrow(
      /outer SEQUENCE/,
    );
  });

  it('rejects a PKCS#8 PEM with wrong version byte', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const der = new Uint8Array([
      0x30,
      0x2e,
      0x02,
      0x02, // ← wrong (should be 0x01)
      0x00,
      0x30,
      0x05,
      0x06,
      0x03,
      0x2b,
      0x65,
      0x70,
      0x04,
      0x22,
      0x04,
      0x20,
      ...seed,
    ]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----\n`;
    expect(() => countersignResult({ result: makeResult(), signerKey: pem })).toThrow(/version/);
  });

  it('rejects a PKCS#8 PEM with wrong inner OCTET STRING wrapper', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const der = new Uint8Array([
      0x30,
      0x2e,
      0x02,
      0x01,
      0x00,
      0x30,
      0x05,
      0x06,
      0x03,
      0x2b,
      0x65,
      0x70,
      0x05, // ← wrong (should be 0x04 OCTET STRING)
      0x22,
      0x04,
      0x20,
      ...seed,
    ]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----\n`;
    expect(() => countersignResult({ result: makeResult(), signerKey: pem })).toThrow(
      /OCTET STRING/,
    );
  });

  it('rejects a PKCS#8 PEM with a 47-byte DER (wrong length)', () => {
    // 47 bytes — wrong canonical length.
    const der = new Uint8Array(47);
    der[0] = 0x30;
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----\n`;
    expect(() => countersignResult({ result: makeResult(), signerKey: pem })).toThrow(/48-byte/);
  });

  it('rejects a PKCS#8 PEM with wrong algorithm OID', () => {
    // Build a 48-byte blob that ISN'T id-Ed25519 (corrupt the OID byte).
    const seed = ed25519.utils.randomPrivateKey();
    const der = new Uint8Array([
      0x30,
      0x2e,
      0x02,
      0x01,
      0x00,
      0x30,
      0x05,
      0x06,
      0x03,
      0x2b,
      0x65,
      0x71, // ← wrong OID last byte (should be 0x70)
      0x04,
      0x22,
      0x04,
      0x20,
      ...seed,
    ]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----\n`;
    expect(() => countersignResult({ result: makeResult(), signerKey: pem })).toThrow(/Ed25519/);
  });

  it('rejects a PEM without armour', () => {
    expect(() =>
      countersignResult({
        result: makeResult(),
        signerKey: '-----BEGIN SOMETHING ELSE-----\nfoo\n-----END SOMETHING ELSE-----',
      }),
    ).toThrow();
  });

  it('signs a FAIL-verdict result the same way (auditor attests to output)', () => {
    // Per spec §7(d) — countersigning a `historical-unverifiable` or
    // `fail` result attests to the verifier OUTPUT, not the verdict.
    // The countersign flow itself does not care about the verdict.
    const seed = ed25519.utils.randomPrivateKey();
    const pubkey = ed25519.getPublicKey(seed);
    const out = countersignResult({ result: makeResult('fail'), signerKey: seed });
    const envelope = parseEnvelope(out.envelope);
    const payloadBytes = new Uint8Array(Buffer.from(envelope.payload, 'base64'));
    const sigBytes = new Uint8Array(Buffer.from(envelope.signatures[0]?.sig ?? '', 'base64'));
    const pae = preAuthenticationEncoding(envelope.payloadType, payloadBytes);
    expect(ed25519.verify(sigBytes, pae, pubkey)).toBe(true);
    // The countersigned payload preserves the original verdict.
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as { verdict: string };
    expect(payload.verdict).toBe('fail');
  });

  it('signs a historical-unverifiable result identically', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const out = countersignResult({
      result: makeResult('historical-unverifiable'),
      signerKey: seed,
    });
    const envelope = parseEnvelope(out.envelope);
    const payloadBytes = new Uint8Array(Buffer.from(envelope.payload, 'base64'));
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as { verdict: string };
    expect(payload.verdict).toBe('historical-unverifiable');
  });

  it('preserves a custom signerKeyId in the envelope', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const customId = 'auditor@example.com';
    const out = countersignResult({
      result: makeResult(),
      signerKey: seed,
      signerKeyId: customId,
    });
    const envelope = parseEnvelope(out.envelope);
    expect(envelope.signatures[0]?.keyid).toBe(customId);
    expect(out.envelopeMetadata.signerKeyId).toBe(customId);
  });

  it('produces deterministic output when signedAt + signerKeyId fixed', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const a = countersignResult({
      result: makeResult(),
      signerKey: seed,
      signedAt: '2026-06-03T13:00:00.000Z',
    });
    const b = countersignResult({
      result: makeResult(),
      signerKey: seed,
      signedAt: '2026-06-03T13:00:00.000Z',
    });
    expect(Buffer.from(a.envelope).toString('hex')).toBe(Buffer.from(b.envelope).toString('hex'));
  });

  it('exports the canonical countersign payloadType', () => {
    expect(PAYLOAD_TYPE_VERIFY_RESULT).toBe('application/vnd.crawcus.verify-result+jsonl');
    // Trigger §7(b) surfacing check — the payloadType MUST end with
    // `+jsonl` to fit the canon open-enum per crawcus-format.md:669-677.
    expect(PAYLOAD_TYPE_VERIFY_RESULT.endsWith('+jsonl')).toBe(true);
    expect(PAYLOAD_TYPE_VERIFY_RESULT.startsWith('application/vnd.crawcus.')).toBe(true);
  });

  it('exposes envelopeMetadata.signedAt matching the input override', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const out = countersignResult({
      result: makeResult(),
      signerKey: seed,
      signedAt: '2026-06-04T00:00:00.000Z',
    });
    expect(out.envelopeMetadata.signedAt).toBe('2026-06-04T00:00:00.000Z');
  });
});

describe('decodeAuditorPrivateKey', () => {
  it('returns the seed unchanged for a 32-byte Uint8Array', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const decoded = decodeAuditorPrivateKey(seed);
    expect(Buffer.from(decoded).toString('hex')).toBe(Buffer.from(seed).toString('hex'));
  });

  it('trims whitespace around hex input', () => {
    const seed = ed25519.utils.randomPrivateKey();
    const hex = `   ${bytesToHex(seed)}   `;
    const decoded = decodeAuditorPrivateKey(hex);
    expect(Buffer.from(decoded).toString('hex')).toBe(Buffer.from(seed).toString('hex'));
  });
});
