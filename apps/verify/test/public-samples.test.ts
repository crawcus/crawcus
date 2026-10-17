/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verify } from '../src/core/verify.js';
import type { TrustAnchor } from '../src/core/trust.js';

const read = (p: string): Uint8Array => new Uint8Array(readFileSync(new URL(p, import.meta.url)));
const demo = JSON.parse(readFileSync(new URL('../src/samples/demo-anchor.json', import.meta.url), 'utf8')) as { label: string; publicKeyHex: string };
const anchors: TrustAnchor[] = [{ label: demo.label, publicKeyHex: demo.publicKeyHex, source: 'sample' }];

describe('downloadable sample files (public/samples)', () => {
  const cases = [
    ['good.dsse.json', 'crawcus-sample-good.dsse.json', 'pass'],
    ['tampered.dsse.json', 'crawcus-sample-tampered.dsse.json', 'fail'],
  ] as const;
  for (const [src, pub, verdict] of cases) {
    it(`${pub} is byte-identical to src/samples/${src} and verifies as ${verdict}`, () => {
      const a = read(`../src/samples/${src}`);
      const b = read(`../public/samples/${pub}`);
      expect(Buffer.from(b).equals(Buffer.from(a))).toBe(true);
      expect(verify(b, { anchors }).verdict).toBe(verdict);
    });
  }
});
