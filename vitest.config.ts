/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 *
 * Root vitest config for the CRAWCUS sub-monorepo.
 *
 * Presence of this file stops vitest's upward-config search from escaping
 * into the parent Foundry monorepo (which has its own vitest.config.ts
 * with Foundry-scoped include patterns).
 *
 * Per-package `vitest.config.ts` files override this — each package
 * scopes its own `test/**` glob. This root exists only as a boundary
 * marker and shared defaults surface.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    passWithNoTests: true,
  },
});
