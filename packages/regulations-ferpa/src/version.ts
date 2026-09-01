/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RegulationVersion } from '@crawcus/core';

/**
 * Pinned version: 34 CFR Part 99 as of 2024. FERPA is statute-level
 * stable; ED guidance updates more frequently. Quarterly cadence
 * matches GDPR convention even though FERPA itself doesn't change
 * that often.
 */
export const FERPA_VERSION = 'ferpa@2024' as RegulationVersion;
