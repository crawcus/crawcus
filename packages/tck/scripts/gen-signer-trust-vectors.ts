/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Write `packages/tck/vectors/signer-trust/*.json` from the deterministic
 * TEST-ONLY builder.
 *
 *   UPDATE_SIGNER_TRUST_VECTORS=1 pnpm --filter @crawcus/tck exec vitest run test/signer-trust.fixture.test.ts
 *
 * The vitest file is the generator so the committed JSON is compared by
 * the same process that builds the vectors. This module re-exports the
 * builder for non-vitest callers.
 */

export { buildSignerTrustVectors, SIGNER_TRUST_VECTORS } from '../src/fixtures/signer-trust.fixture.js';
