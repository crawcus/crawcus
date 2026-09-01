/**
 * End-to-end integration tests for `verifyBundle`.
 *
 * Spec §6a row 5:
 *   - Produce a bundle, wrap in DSSE, verify → pass
 *   - Tamper one byte → fail
 *   - Remove a predicate source → Contract.predicate.unembedded fail
 *   - Round-trip through the full pipeline
 */

import { describe, expect, it } from 'vitest';
import { verifyBundle } from '../src/index.js';
import { buildSignedBundle, predHash } from './fixtures/build-bundle.js';

const FIXED_VERIFIED_AT = '2026-06-03T12:00:00.000Z';

describe('verifyBundle (integration)', () => {
  it('passes a freshly-composed signed bundle', () => {
    const fixture = buildSignedBundle();
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { verifiedAt: FIXED_VERIFIED_AT },
    });
    expect(result.verdict).toBe('pass');
    expect(result.checks.every((c) => c.verdict === 'pass')).toBe(true);
    expect(result.bundleMetadata.eventCount).toBe(3);
    expect(result.verifiedAt).toBe(FIXED_VERIFIED_AT);
  });

  it('fails on a single-byte tamper of the payload', () => {
    const fixture = buildSignedBundle();

    // Mutate one byte in the DSSE envelope's payload after construction.
    const env = JSON.parse(new TextDecoder().decode(fixture.bundleBytes));
    const payloadBytes = new Uint8Array(Buffer.from(env.payload, 'base64'));
    payloadBytes[Math.floor(payloadBytes.length / 2)] ^= 0x01;
    env.payload = Buffer.from(payloadBytes).toString('base64');
    const tampered = new TextEncoder().encode(JSON.stringify(env));

    const result = verifyBundle({ bundle: tampered });
    expect(result.verdict).toBe('fail');
    // The DSSE signature check should fire first.
    expect(
      result.checks.some(
        (c) => c.verdict === 'fail' && c.violationKind === 'Envelope.signature.invalid',
      ),
    ).toBe(true);
  });

  it('fails Contract.predicate.unembedded when predicate source missing', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'pass',
          checkpoint: 'pre',
          contractId: 'ferpa.99-31.schoolOfficial',
        },
      ],
      // predicateSources intentionally missing
    });
    const result = verifyBundle({ bundle: fixture.bundleBytes });
    expect(result.verdict).toBe('fail');
    expect(result.checks.some((c) => c.violationKind === 'Contract.predicate.unembedded')).toBe(
      true,
    );
  });

  it('returns historical-unverifiable when only Check 7 fires', () => {
    const oldSource = "({ has }) => has('a');";
    const newSource = "({ has }) => has('b');";
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'pass',
          checkpoint: 'pre',
          contractId: 'rotated.predicate',
          predicateHash: predHash(oldSource),
        },
      ],
      predicateSources: { 'rotated.predicate': newSource },
    });
    const result = verifyBundle({ bundle: fixture.bundleBytes });
    expect(result.verdict).toBe('historical-unverifiable');
  });

  it('extracts BundleMetadata correctly', () => {
    const fixture = buildSignedBundle();
    const result = verifyBundle({ bundle: fixture.bundleBytes });
    expect(result.bundleMetadata.payloadType).toBe('application/vnd.crawcus.bundle+jsonl');
    expect(result.bundleMetadata.eventCount).toBe(3);
    expect(result.bundleMetadata.signerKeyId).toEqual(fixture.keyid);
  });

  it('returns failEarly + envelope-shape check when envelope cannot parse', () => {
    const garbage = new TextEncoder().encode('not a bundle');
    const result = verifyBundle({ bundle: garbage });
    expect(result.verdict).toBe('fail');
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]?.violationKind).toBe('Envelope.shape.invalid');
  });

  it('rejects a payloadType outside the crawcus family when requireCrawcusPayloadType is true', () => {
    const fixture = buildSignedBundle({ payloadType: 'application/vnd.other.thing+jsonl' });
    const result = verifyBundle({ bundle: fixture.bundleBytes });
    expect(result.verdict).toBe('fail');
    expect(
      result.checks.some(
        (c) => c.id === 'dsse.envelope.shape' && c.violationKind === 'Envelope.shape.invalid',
      ),
    ).toBe(true);
  });

  it('accepts the same payloadType when requireCrawcusPayloadType is false', () => {
    const fixture = buildSignedBundle({ payloadType: 'application/vnd.other.thing+jsonl' });
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { requireCrawcusPayloadType: false },
    });
    expect(result.verdict).toBe('pass');
  });

  it('accepts a known-future subtype with informational note', () => {
    const fixture = buildSignedBundle({
      payloadType: 'application/vnd.crawcus.disclosure-bundle+jsonl',
    });
    const result = verifyBundle({ bundle: fixture.bundleBytes });
    expect(result.verdict).toBe('pass');
    const shape = result.checks.find((c) => c.id === 'dsse.envelope.shape');
    expect(shape?.detail).toMatch(/forward-compat/);
  });

  it('skips Contract re-evaluation when reevaluatePredicates is false', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'fail',
          checkpoint: 'pre',
          contractId: 'ferpa.99-31.x',
          severity: 'block',
        },
      ],
      predicateSources: { 'ferpa.99-31.x': '({ has }) => true;' },
    });
    const result = verifyBundle({
      bundle: fixture.bundleBytes,
      options: { reevaluatePredicates: false },
    });
    // The contract check should not appear in the output.
    expect(result.checks.find((c) => c.id.startsWith('contract.pre.'))).toBeUndefined();
  });

  it('verifierIdentity is stamped per verifier-binary release', () => {
    const fixture = buildSignedBundle();
    const result = verifyBundle({ bundle: fixture.bundleBytes });
    expect(result.verifierIdentity.version).toBe('0.2.0');
    expect(result.verifierIdentity.publicKeyFingerprint).toMatch(/^wave1-unsigned/);
  });
});
