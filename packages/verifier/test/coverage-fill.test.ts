/**
 * Coverage-fill tests for edge paths missed by the targeted unit tests.
 *
 * Targets the spec §13 ≥95% line + branch coverage gate on
 * `packages/verifier/src/**`. Each test in this file documents the
 * specific defensive code path it exercises.
 */

import { describe, expect, it } from 'vitest';
import { verifyJcsHashEquivalence } from '../src/hash-chain.js';
import { parseDsseEnvelope, verifyDsseSignature } from '../src/dsse.js';
import { reevaluateContracts } from '../src/contracts.js';
import { parseSignedBundle } from '../src/parse.js';
import { buildSignedBundle } from './fixtures/build-bundle.js';

describe('coverage-fill — defensive branches', () => {
  it('parseDsseEnvelope: rejects sub-array signatures item (not an object)', () => {
    const env = {
      payloadType: 'application/vnd.crawcus.bundle+jsonl',
      payload: Buffer.from('{}').toString('base64'),
      signatures: ['not-an-object'],
    };
    const bytes = new TextEncoder().encode(JSON.stringify(env));
    const result = parseDsseEnvelope(bytes);
    expect(result.kind).toBe('parse-error');
    if (result.kind === 'parse-error') {
      expect(result.reason).toMatch(/not an object/);
    }
  });

  it('verifyJcsHashEquivalence: surfaces canonicalJSON throw as fail', () => {
    // Inject a non-canonicalisable value (e.g., Infinity) via a tamper hook
    // — `chainProof.bundleSelfHash` is present so the JCS check runs;
    // canonicalJSON should throw on the NaN injection.
    const fixture = buildSignedBundle();
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    // Build a bundle whose chainProof has a self-hash but whose tenant
    // contains a non-finite number after re-cast.
    const broken = {
      ...parsed.parsed.bundle,
      generatedAt: Number.POSITIVE_INFINITY,
    };
    const result = verifyJcsHashEquivalence(broken);
    expect(result.verdict).toBe('fail');
    expect(result.detail).toMatch(/RFC-8785/);
  });

  it('verifyDsseSignature: surfaces base64-decoder throw as fail', () => {
    const fixture = buildSignedBundle();
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');
    // Replace sig with a string that base64-decodes to wrong length
    // but doesn't throw — handled by length-check branch separately.
    // For the throw branch, simulate an invalid input that decode handles.
    // In practice Buffer.from is permissive — to hit the catch we test
    // a degenerate string-replace.
    const envCopy = {
      ...parsed.parsed.envelope,
      signatures: [
        { keyid: parsed.parsed.envelope.signatures[0]?.keyid ?? '', sig: '\x00not-real' },
      ],
    };
    const r = verifyDsseSignature(envCopy, parsed.parsed.payloadBytes);
    expect(r.verdict).toBe('fail');
    expect(r.violationKind).toBe('Envelope.signature.invalid');
  });

  it('reevaluateContracts: skips entries with neither contractId nor contract.id', () => {
    // contractResults entry missing both id keys — the verifier
    // continues silently (defensive parsing path).
    const fixture = buildSignedBundle({
      contractResults: [
        { result: 'pass', checkpoint: 'pre' }, // no id at all
        {
          result: 'pass',
          checkpoint: 'pre',
          contractId: 'kept.contract',
        },
      ],
      predicateSources: { 'kept.contract': '({}) => true;' },
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results).toHaveLength(1);
    expect(results[0]?.contractId).toBe('kept.contract');
  });

  it('reevaluateContracts: reads id from contract.id when contractId is absent', () => {
    const fixture = buildSignedBundle({
      contractResults: [
        {
          result: 'pass',
          checkpoint: 'pre',
          // canon-shape: contract: { id }, no top-level contractId
          contract: { id: 'nested.id', severity: 'block' },
        },
      ],
      predicateSources: { 'nested.id': '({}) => true;' },
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results[0]?.contractId).toBe('nested.id');
  });

  it('reevaluateContracts: handles contractResults absent (returns empty)', () => {
    const fixture = buildSignedBundle();
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results).toEqual([]);
  });

  it('reevaluateContracts: handles contractResults non-array (returns empty)', () => {
    const fixture = buildSignedBundle({
      tamperBundle: (b) => ({ ...b, contractResults: 'not-an-array' }),
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const results = reevaluateContracts(parsed.parsed.bundle);
    expect(results).toEqual([]);
  });
});
