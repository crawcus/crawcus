/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regenerate the JSON copies with:
 *   UPDATE_MERKLE_INTOTO_VECTORS=1 pnpm --filter @crawcus/tck exec vitest run test/merkle-intoto.fixture.test.ts
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MERKLE_INTOTO_VECTORS,
  buildMerkleIntotoVectors,
  runMerkleIntotoVectors,
} from '../src/fixtures/merkle-intoto.fixture.js';

const VECTOR_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'vectors', 'merkle-intoto');

describe('merkle and in-toto conformance vectors', () => {
  it('rebuilds the same vectors and they demonstrate the ADR checks', () => {
    expect(JSON.stringify(buildMerkleIntotoVectors())).toBe(JSON.stringify(MERKLE_INTOTO_VECTORS));
    expect(MERKLE_INTOTO_VECTORS.length).toBeGreaterThanOrEqual(8);
    for (const vector of MERKLE_INTOTO_VECTORS) {
      expect(vector.keyLabel).toBe('TEST ONLY');
    }
    expect(runMerkleIntotoVectors().ok).toBe(true);
  });

  it('matches the committed JSON copies', () => {
    if (process.env['UPDATE_MERKLE_INTOTO_VECTORS'] === '1') {
      mkdirSync(VECTOR_DIR, { recursive: true });
      for (const vector of MERKLE_INTOTO_VECTORS) {
        writeFileSync(join(VECTOR_DIR, `${vector.name}.json`), `${JSON.stringify(vector, null, 2)}\n`);
      }
    }
    const names = readdirSync(VECTOR_DIR).filter((name) => name.endsWith('.json')).sort();
    expect(names).toEqual(MERKLE_INTOTO_VECTORS.map((vector) => `${vector.name}.json`).sort());
    for (const vector of MERKLE_INTOTO_VECTORS) {
      const onDisk = JSON.parse(readFileSync(join(VECTOR_DIR, `${vector.name}.json`), 'utf8'));
      expect(onDisk).toEqual(vector);
    }
  });
});
