/**
 * Unit tests for `parseSignedBundle` — spec §6a row 1.
 *
 * Coverage:
 *   - Valid DSSE envelope parses cleanly
 *   - Malformed JSON → Envelope.shape.invalid
 *   - Missing fields → Envelope.shape.invalid
 *   - payloadType not in vnd.crawcus.*+jsonl family → caught by
 *     downstream check (parse alone is lenient)
 */

import { describe, expect, it } from 'vitest';
import { parseSignedBundle } from '../src/parse.js';
import { buildSignedBundle } from './fixtures/build-bundle.js';

describe('parseSignedBundle', () => {
  it('parses a valid DSSE envelope', () => {
    const fixture = buildSignedBundle();
    const result = parseSignedBundle(fixture.bundleBytes);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.parsed.envelope.payloadType).toBe('application/vnd.crawcus.bundle+jsonl');
      expect(result.parsed.envelope.signatures).toHaveLength(1);
      expect(result.parsed.payloadBytes.length).toBeGreaterThan(0);
    }
  });

  it('fails on non-JSON input with Envelope.shape.invalid', () => {
    const bytes = new TextEncoder().encode('not json at all');
    const result = parseSignedBundle(bytes);
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') {
      expect(result.violationKind).toBe('Envelope.shape.invalid');
    }
  });

  it('fails on JSON array (not an object) with Envelope.shape.invalid', () => {
    const bytes = new TextEncoder().encode('[]');
    const result = parseSignedBundle(bytes);
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') {
      expect(result.violationKind).toBe('Envelope.shape.invalid');
    }
  });

  it('fails on missing payloadType field', () => {
    const fixture = buildSignedBundle({
      tamperEnvelope: (e) => {
        const copy = { ...e };
        delete copy['payloadType'];
        return copy;
      },
    });
    const result = parseSignedBundle(fixture.bundleBytes);
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') {
      expect(result.violationKind).toBe('Envelope.shape.invalid');
      expect(result.detail).toMatch(/payloadType/);
    }
  });

  it('fails on missing payload field', () => {
    const fixture = buildSignedBundle({
      tamperEnvelope: (e) => {
        const copy = { ...e };
        delete copy['payload'];
        return copy;
      },
    });
    const result = parseSignedBundle(fixture.bundleBytes);
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') {
      expect(result.violationKind).toBe('Envelope.shape.invalid');
      expect(result.detail).toMatch(/payload/);
    }
  });

  it('fails on empty signatures array', () => {
    const fixture = buildSignedBundle({
      tamperEnvelope: (e) => ({ ...e, signatures: [] }),
    });
    const result = parseSignedBundle(fixture.bundleBytes);
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') {
      expect(result.violationKind).toBe('Envelope.shape.invalid');
    }
  });

  it('fails on signatures item missing keyid', () => {
    const fixture = buildSignedBundle({
      tamperEnvelope: (e) => ({
        ...e,
        signatures: [{ sig: 'some-sig' }],
      }),
    });
    const result = parseSignedBundle(fixture.bundleBytes);
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') {
      expect(result.violationKind).toBe('Envelope.shape.invalid');
      expect(result.detail).toMatch(/keyid/);
    }
  });

  it('fails on signatures item missing sig', () => {
    const fixture = buildSignedBundle({
      tamperEnvelope: (e) => ({
        ...e,
        signatures: [{ keyid: 'somekeyid' }],
      }),
    });
    const result = parseSignedBundle(fixture.bundleBytes);
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') {
      expect(result.violationKind).toBe('Envelope.shape.invalid');
      expect(result.detail).toMatch(/sig/);
    }
  });

  it('accepts payloadType outside the crawcus family (later check catches it)', () => {
    // parseSignedBundle alone is lenient on payloadType — the
    // family-check happens in `checkEnvelopeShape` (verify.ts).
    const fixture = buildSignedBundle({ payloadType: 'application/vnd.example.other+json' });
    const result = parseSignedBundle(fixture.bundleBytes);
    expect(result.kind).toBe('ok');
  });

  it('fails on payload that is not valid base64', () => {
    const fixture = buildSignedBundle({
      tamperEnvelope: (e) => ({ ...e, payload: '!!! not base64 !!!' }),
    });
    const result = parseSignedBundle(fixture.bundleBytes);
    // Buffer.from is permissive on bad base64 (treats invalid chars as
    // skipped). We may or may not produce a valid UTF-8 string from
    // the gibberish; either way, the eventual JSON.parse will fail.
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') {
      expect(result.violationKind).toBe('Envelope.shape.invalid');
    }
  });

  it('fails on payload that decodes to non-JSON bytes', () => {
    const garbage = new TextEncoder().encode('not-json-at-all');
    const fixture = buildSignedBundle({
      tamperEnvelope: (e) => ({
        ...e,
        payload: Buffer.from(garbage).toString('base64'),
      }),
    });
    const result = parseSignedBundle(fixture.bundleBytes);
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') {
      expect(result.violationKind).toBe('Envelope.shape.invalid');
    }
  });

  it('fails on payload that decodes to a JSON array (not object)', () => {
    const arr = new TextEncoder().encode('[]');
    const fixture = buildSignedBundle({
      tamperEnvelope: (e) => ({
        ...e,
        payload: Buffer.from(arr).toString('base64'),
      }),
    });
    const result = parseSignedBundle(fixture.bundleBytes);
    expect(result.kind).toBe('fail');
    if (result.kind === 'fail') {
      expect(result.violationKind).toBe('Envelope.shape.invalid');
      expect(result.detail).toMatch(/not a JSON object/);
    }
  });
});
