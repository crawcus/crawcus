/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FieldSpec } from '../types/field.js';
import type { CrawcusSpec } from '../types/intent.js';

/**
 * Identity function for typed CrawcusSpecs. Runtime no-op; the value
 * is purely in TypeScript inference at authoring time.
 *
 * @example
 * import { defineCrawcusSpec, field } from '@crawcus/core';
 *
 * export default defineCrawcusSpec({
 *   key: 'CreateCourse',
 *   projection: 'Course',
 *   version: 1,
 *   fields: {
 *     title: field.string().required(),
 *   },
 *   readiness: ({ has }) => has('title'),
 * });
 */
export function defineCrawcusSpec<TFields extends Record<string, FieldSpec>>(
  spec: CrawcusSpec<TFields>,
): CrawcusSpec<TFields> {
  return spec;
}
