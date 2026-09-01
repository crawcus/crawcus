/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProjectionName } from './ids.js';
import type { LocalisedText } from './locale.js';

/**
 * Base type for an CrawcusSpec field. Field metadata + behaviour
 * (`.required`, `.askHint`, `.dependsOn`, `.contract`, ...) is
 * composed onto the base via the field builder (lands 4b).
 */
export type FieldBaseType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'enum'
  | 'array'
  | 'object'
  | 'reference'
  | 'attachment';

/**
 * Field-level metadata. Compliance annotations (PII level, retention)
 * deliberately do NOT live here — they live in the compliance manifest
 * (one source of truth; cross-checked at build time).
 *
 * Predicate references in `dependsOn` / `validates` are typed against
 * a ReadinessCtx materialised by the runtime. The actual predicate
 * functions are not constrained by core's type system beyond the
 * `(ctx) => boolean` shape; the spec compiler enforces purity.
 */
export interface FieldMetadata {
  readonly required: boolean;
  readonly askHint?: LocalisedText;
  readonly refineHint?: LocalisedText;
  readonly label?: LocalisedText;
  readonly help?: LocalisedText;
  readonly placeholder?: LocalisedText;
  readonly dependsOn?: { readonly when: (ctx: unknown) => boolean };
  readonly askWhen?: { readonly priority: 'early' | 'normal' | 'late' };
  readonly validates?: (value: unknown) => boolean;
  readonly default?: unknown;
  readonly options?: readonly unknown[];
  readonly confidential?: boolean;
}

/**
 * Structural shape for one field. Constructed by the `field` builder
 * (4b); consumed by the CrawcusSpec runtime + Contract evaluator (4b)
 * + compliance manifest validator (4b).
 *
 * The `__field: true` marker disambiguates from inline plain objects
 * passed to `defineCrawcusSpec({ fields: { ... } })`.
 */
export interface FieldSpec {
  readonly __field: true;
  readonly base: FieldBaseType;
  readonly metadata: FieldMetadata;
  /** For `'array'`: the inner FieldSpec. */
  readonly of?: FieldSpec;
  /** For `'object'`: the nested map. */
  readonly shape?: Readonly<Record<string, FieldSpec>>;
  /** For `'reference'`: the projection name. */
  readonly references?: ProjectionName;
  /** For `'attachment'`: accepted MIME types. */
  readonly mime?: readonly string[];
}
