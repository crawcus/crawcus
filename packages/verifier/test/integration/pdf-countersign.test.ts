/**
 * Integration test — TKT-VERIFIER-1b spec §5c.
 *
 * Full auditor flow:
 *   1. Build a signed bundle (audit-bundle envelope ← original signer)
 *   2. verifyBundle()
 *   3. renderPdf(result)                              → PDF artefact
 *   4. countersignResult({ result, signerKey })       → DSSE envelope (auditor)
 *   5. Verify the countersign envelope's signature round-trips
 *
 * The two envelopes are parallel — neither modifies the other; both
 * verify independently against their own pubkeys. This is the
 * non-nested chain pattern documented in `crawcus-format.md:706`.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { describe, expect, it } from 'vitest';
import { countersignResult, PAYLOAD_TYPE_VERIFY_RESULT } from '../../src/countersign.js';
import { preAuthenticationEncoding } from '../../src/dsse.js';
import { renderPdf } from '../../src/format/pdf.js';
import { verifyBundle } from '../../src/verify.js';
import { buildSignedBundle } from '../fixtures/build-bundle.js';

describe('integration — verifyBundle → renderPdf → countersignResult', () => {
  it('runs end-to-end with auditor countersigning a PASS result', () => {
    const auditorSeed = ed25519.utils.randomPrivateKey();
    const auditorPubkey = ed25519.getPublicKey(auditorSeed);

    // (1) The original signer produces a signed bundle.
    const fixture = buildSignedBundle();

    // (2) The verifier checks it.
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: '2026-06-03T12:00:00.000Z' },
    });
    expect(result.verdict).toBe('pass');

    // (3) Render the auditor-signable PDF.
    const pdf = renderPdf(result);
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(new TextDecoder('latin1').decode(pdf).startsWith('%PDF-1.4')).toBe(true);

    // (4) The auditor countersigns the verify result.
    const countersigned = countersignResult({
      result,
      signerKey: auditorSeed,
      signerKeyId: 'auditor@bigfour.example',
      signedAt: '2026-06-03T13:00:00.000Z',
    });

    // (5) The countersign envelope verifies independently of the
    // bundle envelope. Both signatures are required for the full
    // chain-of-custody attestation.
    const parsed = JSON.parse(new TextDecoder().decode(countersigned.envelope)) as {
      payloadType: string;
      payload: string;
      signatures: { keyid: string; sig: string }[];
    };
    expect(parsed.payloadType).toBe(PAYLOAD_TYPE_VERIFY_RESULT);
    expect(parsed.signatures[0]?.keyid).toBe('auditor@bigfour.example');

    const payloadBytes = new Uint8Array(Buffer.from(parsed.payload, 'base64'));
    const sigBytes = new Uint8Array(Buffer.from(parsed.signatures[0]?.sig ?? '', 'base64'));
    const pae = preAuthenticationEncoding(parsed.payloadType, payloadBytes);
    expect(ed25519.verify(sigBytes, pae, auditorPubkey)).toBe(true);

    // The countersigned payload contains the full verify result.
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
      verdict: string;
      bundleMetadata: { eventCount: number };
    };
    expect(payload.verdict).toBe('pass');
    expect(payload.bundleMetadata.eventCount).toBe(3);
  });

  it('countersign envelope is independent of the audit-bundle envelope', () => {
    const fixture = buildSignedBundle();
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: '2026-06-03T12:00:00.000Z' },
    });
    const auditorSeed = ed25519.utils.randomPrivateKey();
    const countersigned = countersignResult({ result, signerKey: auditorSeed });

    // The countersign envelope is a SEPARATE artefact — it does not
    // wrap or modify the original audit-bundle envelope bytes. This
    // enforces the parallel-wrap pattern per crawcus-format.md:706
    // (nested DSSE is canon-forbidden).
    const fixtureText = new TextDecoder().decode(fixture.bundleBytes);
    const countersignedText = new TextDecoder().decode(countersigned.envelope);
    expect(countersignedText).not.toContain(fixtureText);
    // The countersign payloadType is the verify-result subtype, not
    // the audit-bundle subtype.
    expect(countersignedText).toContain('verify-result+jsonl');
    expect(countersignedText).not.toContain('bundle+jsonl');
  });

  it('PDF + countersign envelope are produced by the same VerifyResult bytes', () => {
    // Demonstrates the audit-bundle invariant: the PDF and the
    // countersigned envelope are derived from the SAME structured
    // result. An auditor presenting both produces a wet-signature on
    // a PDF that mirrors the digital countersign on the envelope.
    const fixture = buildSignedBundle();
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: '2026-06-03T12:00:00.000Z' },
    });
    const auditorSeed = ed25519.utils.randomPrivateKey();
    const pdf = renderPdf(result);
    const countersigned = countersignResult({
      result,
      signerKey: auditorSeed,
      signedAt: '2026-06-03T13:00:00.000Z',
    });

    const parsed = JSON.parse(new TextDecoder().decode(countersigned.envelope)) as {
      payload: string;
    };
    const payloadBytes = new Uint8Array(Buffer.from(parsed.payload, 'base64'));
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
      bundleMetadata: { bundleId: string };
      verdict: string;
    };

    // Both surfaces reflect the same verdict + bundleId.
    expect(payload.verdict).toBe(result.verdict);
    expect(payload.bundleMetadata.bundleId).toBe(result.bundleMetadata.bundleId);
    // The PDF embeds the same bundleId.
    const pdfText = new TextDecoder('latin1').decode(pdf);
    expect(pdfText).toContain(result.bundleMetadata.bundleId);
  });
});
