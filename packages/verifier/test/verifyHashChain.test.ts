/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unit tests for `verifyEventChain` (re-exported as `verifyHashChain`)
 * + `verifyJcsHashEquivalence`.
 *
 * Spec §6a row 3:
 *   - Valid 3-event chain → pass
 *   - Broken middle link → Chain.hash.broken
 *   - JCS byte-equality fails on whitespace-injected payload →
 *     Bundle.hash.mismatch
 */

import { describe, expect, it } from 'vitest';
import { verifyEventChain, verifyJcsHashEquivalence } from '../src/hash-chain.js';
import { parseSignedBundle } from '../src/parse.js';
import { buildSignedBundle } from './fixtures/build-bundle.js';

describe('verifyEventChain', () => {
  it('passes a valid 3-event chain', () => {
    const fixture = buildSignedBundle();
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const result = verifyEventChain(parsed.parsed.bundle);
    expect(result.verdict).toBe('pass');
    expect(result.detail).toMatch(/3 events/);
  });

  it('fails on broken middle link (Chain.hash.broken)', () => {
    const fixture = buildSignedBundle({
      tamperBundle: (b) => {
        const events = b['events'] as Record<string, unknown>[];
        // Corrupt event[1].prevHash so the chain walks brokens.
        const ev1 = { ...events[1], prevHash: 'sha256:badhash' };
        return { ...b, events: [events[0], ev1, events[2]] };
      },
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const result = verifyEventChain(parsed.parsed.bundle);
    expect(result.verdict).toBe('fail');
    expect(result.violationKind).toBe('Chain.hash.broken');
    expect(result.brokenAt).toBe(1);
  });

  it('handles empty events array (vacuous pass)', () => {
    const fixture = buildSignedBundle({
      tamperBundle: (b) => ({ ...b, events: [] }),
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const result = verifyEventChain(parsed.parsed.bundle);
    expect(result.verdict).toBe('pass');
  });

  it('fails when events is not an array', () => {
    const fixture = buildSignedBundle({
      tamperBundle: (b) => ({ ...b, events: 'not-an-array' }),
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const result = verifyEventChain(parsed.parsed.bundle);
    expect(result.verdict).toBe('fail');
    expect(result.violationKind).toBe('Chain.hash.broken');
  });

  it('handles a bundle with no events field (vacuous pass)', () => {
    const fixture = buildSignedBundle({
      tamperBundle: (b) => {
        const copy = { ...b };
        delete copy['events'];
        return copy;
      },
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const result = verifyEventChain(parsed.parsed.bundle);
    expect(result.verdict).toBe('pass');
  });
});

describe('verifyJcsHashEquivalence', () => {
  it('passes when the bundle self-hash matches recomputation', () => {
    const fixture = buildSignedBundle();
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const result = verifyJcsHashEquivalence(parsed.parsed.bundle);
    expect(result.verdict).toBe('pass');
    expect(result.recordedHash).toBeDefined();
    expect(result.recomputedHash).toBeDefined();
    expect(result.recordedHash).toEqual(result.recomputedHash);
  });

  it('skips when chainProof.bundleSelfHash is absent (legacy bundle)', () => {
    const fixture = buildSignedBundle({ omitSelfHash: true });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const result = verifyJcsHashEquivalence(parsed.parsed.bundle);
    expect(result.verdict).toBe('pass');
    expect(result.detail).toMatch(/skipped/);
  });

  it('fails when a bundle field has been tampered post-signing', () => {
    // Build a bundle, then tamper the parsed payload directly (the
    // self-hash inside the bundle still references the pre-tamper state).
    const fixture = buildSignedBundle();
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const tampered = {
      ...parsed.parsed.bundle,
      tenant: { ...(parsed.parsed.bundle.tenant as object), id: 't_evil' },
    };

    const result = verifyJcsHashEquivalence(tampered);
    expect(result.verdict).toBe('fail');
    expect(result.detail).toMatch(/mismatch/);
  });

  it('skips on chainProof absent', () => {
    const fixture = buildSignedBundle({
      tamperBundle: (b) => {
        const copy = { ...b };
        delete copy['chainProof'];
        return copy;
      },
    });
    const parsed = parseSignedBundle(fixture.bundleBytes);
    if (parsed.kind !== 'ok') throw new Error('parse failed');

    const result = verifyJcsHashEquivalence(parsed.parsed.bundle);
    expect(result.verdict).toBe('pass');
    expect(result.detail).toMatch(/skipped/);
  });
});
