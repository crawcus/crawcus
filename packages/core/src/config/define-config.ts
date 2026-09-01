/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TallysealConfig, ProjectionAdapter } from './types.js';
import type { CrawcusSpec } from '@crawcus/spec';

/**
 * Identity function for typed TallysealConfig. Runtime no-op; the
 * value is purely in TypeScript inference at authoring time.
 *
 * @example
 * import { defineConfig } from '@crawcus/core';
 * import { prismaProjection } from '@tallyseal/projection-prisma';
 * // ... other adapters ...
 *
 * export default defineConfig({
 *   projection: prismaProjection({ client: prisma }),
 *   eventStore: postgresEventStore({ client: prisma }),
 *   ai: anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
 *   identity: clerkIdentity({ secret: env.CLERK_SECRET }),
 *   pii: presidioPII({ endpoint: env.PRESIDIO_URL }),
 *   tasks: inngestTasks({ key: env.INNGEST_KEY }),
 *   storage: s3Storage({ bucket: 'tallyseal-uploads' }),
 *   compliance: import('./tallyseal.compliance.js'),
 * });
 */
export function defineConfig(config: TallysealConfig): TallysealConfig {
  return config;
}

/**
 * Identity function for typed ProjectionAdapter. The adapter maps
 * each IntentKey to its reducer + lookup + rebuild functions. The
 * dispatcher (writeEvent + reducer/dispatcher.ts) routes events
 * through `apply()` based on the event's intent.
 */
export function defineProjection<TIntents extends Record<string, CrawcusSpec>>(
  adapter: ProjectionAdapter<TIntents>,
): ProjectionAdapter<TIntents> {
  return adapter;
}
