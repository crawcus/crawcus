/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Signer-trust vectors are deterministic, labelled TEST ONLY, and
 * agree with the reference verifier. JSON copies live in
 * `vectors/signer-trust/` for non-TypeScript implementations.
 *
 * Regenerate those copies with:
 *   UPDATE_SIGNER_TRUST_VECTORS=1 pnpm --filter @crawcus/tck exec vitest run test/signer-trust.fixture.test.ts
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { verifyBundle } from '@crawcus/verifier';
import {
  SIGNER_TRUST_VECTORS,
  buildSignerTrustVectors,
  type SignerTrustVector,
} from '../src/fixtures/signer-trust.fixture.js';

const VECTOR_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'vectors', 'signer-trust');

describe('signer-trust conformance vectors', () => {
  it('rebuilds byte-identical vectors', () => {
    expect(JSON.stringify(buildSignerTrustVectors())).toBe(JSON.stringify(buildSignerTrustVectors()));
    expect(JSON.stringify(buildSignerTrustVectors())).toBe(JSON.stringify(SIGNER_TRUST_VECTORS));
  });

  it('labels every vector TEST ONLY and keeps the RFC 8032 key out', () => {
    const rfc8032 = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
    expect(SIGNER_TRUST_VECTORS.length).toBeGreaterThanOrEqual(16);
    for (const vector of SIGNER_TRUST_VECTORS) {
      expect(vector.keyLabel).toBe('TEST ONLY');
      expect(JSON.stringify(vector).toLowerCase().includes(rfc8032)).toBe(false);
    }
  });

  it('matches the reference verifier', () => {
    for (const vector of SIGNER_TRUST_VECTORS) {
      const result = verifyBundle({
        bundle: new TextEncoder().encode(JSON.stringify(vector.envelope)),
        options: {
          verifiedAt: '2026-10-15T00:00:00.000Z',
          ...(vector.policy !== null ? { trustPolicy: vector.policy } : {}),
        },
      });
      expect(result.verdict, vector.name).toBe(vector.expected.verdict);
      expect(result.trust.reason, vector.name).toBe(vector.expected.reason);
    }
  });

  it('matches the committed JSON copies', () => {
    if (process.env['UPDATE_SIGNER_TRUST_VECTORS'] === '1') {
      mkdirSync(VECTOR_DIR, { recursive: true });
      for (const vector of SIGNER_TRUST_VECTORS) {
        writeFileSync(join(VECTOR_DIR, `${vector.name}.json`), `${JSON.stringify(vector, null, 2)}\n`);
      }
    }
    const names = readdirSync(VECTOR_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort();
    expect(names).toEqual(SIGNER_TRUST_VECTORS.map((vector) => `${vector.name}.json`).sort());
    for (const vector of SIGNER_TRUST_VECTORS) {
      const onDisk = JSON.parse(readFileSync(join(VECTOR_DIR, `${vector.name}.json`), 'utf8')) as SignerTrustVector;
      expect(onDisk).toEqual(vector);
    }
  });
});
