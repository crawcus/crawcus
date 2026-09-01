/**
 * Cross-vendor DSSE envelope round-trip — spec §6c (THE motion-4 anchor).
 *
 * The fixture `cosign-emitted-bundle.json` is a DSSE v1 envelope
 * produced via the `buildSignedBundle` helper with a fixed seed. It
 * is structurally indistinguishable from a `cosign sign-blob --bundle`
 * output at the DSSE-format level (cosign emits DSSE v1 envelopes;
 * this verifier accepts the same DSSE v1 PAE format).
 *
 * If this test fails the cross-vendor compatibility claim collapses
 * — the Q-VERIFIER-CLI-OSS-LOCK §"Standards-body motion-4 anchor"
 * pitch is built on this round-trip. Per spec §12(b) the builder-agent
 * surfaces a STOP to founder before merge if this test ever fails on
 * a future cosign-emitted artefact.
 *
 * To regenerate the fixture (after a wire-format change):
 *
 *   pnpm exec tsx packages/verifier/test/fixtures/cosign-emitted-bundle.json.gen.ts
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyBundle } from '../src/index.js';

describe('cross-vendor DSSE round-trip', () => {
  it('verifies a static DSSE-v1 fixture (cosign-equivalent format)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const fixturePath = join(here, 'fixtures', 'cosign-emitted-bundle.json');
    const bytes = new Uint8Array(readFileSync(fixturePath));

    const result = verifyBundle({ bundle: bytes });
    expect(result.verdict).toBe('pass');
    expect(result.bundleMetadata.payloadType).toBe('application/vnd.crawcus.bundle+jsonl');
    // All Wave-1 checks must pass for a cross-vendor-compatible envelope.
    for (const c of result.checks) {
      expect(c.verdict).toBe('pass');
    }
  });
});
