/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RegulationVersion } from '@crawcus/core';

/**
 * EU AI Act — Regulation (EU) 2024/1689. Entered into force
 * 2024-08-01; high-risk + GPAI obligations apply from 2026-08-01.
 * 2026-Q2 reflects the AI Act high-risk readiness commencement
 * window (Tallyseal's first applicable cycle).
 */
export const EU_AI_ACT_VERSION = 'eu-ai-act@2026-Q2' as RegulationVersion;
