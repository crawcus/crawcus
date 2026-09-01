/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Brand } from './brand.js';

/**
 * ISO 8601 duration (e.g., 'P7Y', 'P3M', 'P30D'). Per-spec retention
 * policies use this format. Shorthand like '7y', '3m', '30d' is
 * accepted in source code and canonicalised at build time by the
 * compliance manifest validator (4b).
 */
export type ISO8601Duration = Brand<string, 'ISO8601Duration'>;
