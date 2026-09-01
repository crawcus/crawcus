/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bumped 0.0.0 → 0.0.1 (commit 4a — type surface + ports + hash chain).
 * Bumped 0.0.1 → 0.0.2 (commit 4b — defineCrawcusSpec + field builder +
 * defineCompliance + Contracts evaluator + validators + readiness +
 * graph + projector types). Further bumps follow commits 4c + 4d
 * per ratchet #16 (version-bump-per-PR).
 * Bumped 0.0.5 → 0.1.0 (B1.2 rename — IntentSpec → CrawcusSpec across
 * all exports; defineIntent → defineCrawcusSpec;
 * @tallyseal/intentspec-tck → @crawcus/tck. Breaking change;
 * no compat shim per CLAUDE.md guidance. See
 * `docs/notebook/09-operating/crawcus-expansion-2026-05-21.md`).
 */
export const CRAWCUS_CORE_VERSION = '0.2.1' as const;
