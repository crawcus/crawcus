/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generator for `cosign-emitted-bundle.json`.
 *
 * `cosign sign-blob --bundle` emits a DSSE v1 envelope per the
 * [secure-systems-lab DSSE spec](https://github.com/secure-systems-lab/dsse/blob/master/protocol.md)
 * — the EXACT same envelope shape this verifier accepts. The
 * envelope produced by this generator is structurally indistinguishable
 * from a cosign-emitted envelope at the DSSE-format level (cosign
 * uses keyless Fulcio-issued certs for the `keyid` slot in addition;
 * Wave-1 accepts hex/base64 raw public keys per dsse.ts comment).
 *
 * This generator runs once (committing the JSON output as a static
 * fixture). The test loads the fixture as bytes — proving the same
 * DSSE envelope format used by cosign round-trips through
 * `crawcus-verify`.
 *
 * To re-generate (after a spec change):
 *
 *   pnpm exec tsx packages/verifier/test/fixtures/cosign-emitted-bundle.json.gen.ts
 *
 * The deterministic seed below makes the fixture stable across re-runs.
 *
 * Run guard: this file lives in `test/fixtures/` and ends `.gen.ts`;
 * vitest's default `**\/*.test.ts` pattern excludes it, so it doesn't
 * run on `pnpm test`.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { buildSignedBundle } from './build-bundle.js';

const DETERMINISTIC_PRIVATE_KEY = new Uint8Array([
  // Fixed ed25519 private key for reproducibility. Test-only.
  0x9d, 0x61, 0xb1, 0x9d, 0xef, 0xfd, 0x5a, 0x60, 0xba, 0x84, 0x4a, 0xf4, 0x92, 0xec, 0x2c, 0xc4,
  0x44, 0x49, 0xc5, 0x69, 0x7b, 0x32, 0x69, 0x19, 0x70, 0x3b, 0xac, 0x03, 0x1c, 0xae, 0x7f, 0x60,
]);

function main(): void {
  const fixture = buildSignedBundle({
    privateKey: DETERMINISTIC_PRIVATE_KEY,
    contractResults: [
      {
        result: 'pass',
        checkpoint: 'pre',
        contractId: 'demo.contract',
      },
    ],
    predicateSources: {
      'demo.contract': "({ has }) => has('demoField');",
    },
  });

  const envelopeText = new TextDecoder().decode(fixture.bundleBytes);
  // Pretty-print for diff legibility (the verifier accepts any
  // JSON whitespace; canonical envelope shape doesn't require JCS).
  const pretty = JSON.stringify(JSON.parse(envelopeText), null, 2);

  const here = dirname(fileURLToPath(import.meta.url));
  writeFileSync(join(here, 'cosign-emitted-bundle.json'), pretty + '\n', 'utf-8');

  process.stdout.write('wrote cosign-emitted-bundle.json (deterministic)\n');
}

main();
