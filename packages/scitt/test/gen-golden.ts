/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */
import { writeFileSync } from 'node:fs';
import { encodeSignedStatement } from '../src/index.js';
import { hex, TEST_PAYLOAD, testKey } from './helpers.js';

const k = testKey(1);
const bytes = encodeSignedStatement({
  payload: TEST_PAYLOAD,
  secretKey: k.secretKey,
  kid: k.kid,
  iss: 'https://issuer.example',
  sub: 'urn:crawcus:intent:i_test',
  iat: 1786406400,
});
writeFileSync(new URL('./fixtures/signed-statement-ed25519.cbor.hex', import.meta.url), `${hex(bytes)}\n`);
