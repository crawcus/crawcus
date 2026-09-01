/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FieldBaseType, FieldMetadata, FieldSpec } from '../types/field.js';
import type { LocalisedText } from '../types/locale.js';
import type { ProjectionName } from '../types/ids.js';
import type { Contract, FieldContractCtx } from '../contract/types.js';

/**
 * Internal interface for field builders that also carry field-level
 * Contracts. The Contracts are extracted by validators / hashers /
 * audit-bundle renderers; they don't live on the wire-format
 * `FieldSpec` directly (those are pure data).
 *
 * `FieldBuilder<T>` IS a `FieldSpec` structurally — TypeScript treats
 * the class instance as assignable to FieldSpec, with chainable
 * methods coexisting via the prototype (non-enumerable, so they don't
 * leak into JSON serialisation).
 */
export interface FieldBuilder<T> extends FieldSpec {
  required(): FieldBuilder<T>;
  optional(): FieldBuilder<T | undefined>;
  askHint(text: LocalisedText): FieldBuilder<T>;
  refineHint(text: LocalisedText): FieldBuilder<T>;
  label(text: LocalisedText): FieldBuilder<T>;
  help(text: LocalisedText): FieldBuilder<T>;
  placeholder(text: LocalisedText): FieldBuilder<T>;
  dependsOn(opts: { when: (ctx: unknown) => boolean }): FieldBuilder<T>;
  askWhen(opts: { priority: 'early' | 'normal' | 'late' }): FieldBuilder<T>;
  validates(fn: (value: T) => boolean): FieldBuilder<T>;
  defaultValue(value: T | ((ctx: unknown) => T)): FieldBuilder<T>;
  options(values: readonly T[]): FieldBuilder<T>;
  confidential(): FieldBuilder<T>;
  /** v0.2 — attach a named, citable, auditable field-level Contract. */
  contract(c: Contract<FieldContractCtx<T>>): FieldBuilder<T>;
  /** Read-back of accumulated contracts (used by validator + evaluator). */
  readonly __contracts: readonly Contract<FieldContractCtx<T>>[];
}

interface BuilderShape {
  base: FieldBaseType;
  metadata: FieldMetadata;
  of?: FieldSpec;
  shape?: Readonly<Record<string, FieldSpec>>;
  references?: ProjectionName;
  mime?: readonly string[];
  contracts: readonly Contract<FieldContractCtx<unknown>>[];
}

/**
 * Functional builder factory. Each chainable method returns a fresh
 * builder object with updated metadata — never mutates. The `__field`
 * marker satisfies FieldSpec structurally.
 */
function makeBuilder<T>(shape: BuilderShape): FieldBuilder<T> {
  const next = (patch: Partial<BuilderShape>): FieldBuilder<T> =>
    makeBuilder<T>({ ...shape, ...patch });
  const updateMeta = (patch: Partial<FieldMetadata>): FieldBuilder<T> =>
    makeBuilder<T>({ ...shape, metadata: { ...shape.metadata, ...patch } });

  const builder: FieldBuilder<T> = {
    __field: true,
    base: shape.base,
    metadata: shape.metadata,
    ...(shape.of ? { of: shape.of } : {}),
    ...(shape.shape ? { shape: shape.shape } : {}),
    ...(shape.references ? { references: shape.references } : {}),
    ...(shape.mime ? { mime: shape.mime } : {}),
    __contracts: shape.contracts as readonly Contract<FieldContractCtx<T>>[],

    required: () => updateMeta({ required: true }),
    optional: () =>
      makeBuilder<T | undefined>({ ...shape, metadata: { ...shape.metadata, required: false } }),
    askHint: (text) => updateMeta({ askHint: text }),
    refineHint: (text) => updateMeta({ refineHint: text }),
    label: (text) => updateMeta({ label: text }),
    help: (text) => updateMeta({ help: text }),
    placeholder: (text) => updateMeta({ placeholder: text }),
    dependsOn: (opts) => updateMeta({ dependsOn: opts }),
    askWhen: (opts) => updateMeta({ askWhen: opts }),
    validates: (fn) => updateMeta({ validates: fn as (value: unknown) => boolean }),
    defaultValue: (value) => updateMeta({ default: value }),
    options: (values) => updateMeta({ options: values }),
    confidential: () => updateMeta({ confidential: true }),
    contract: (c) =>
      next({
        contracts: [...shape.contracts, c as unknown as Contract<FieldContractCtx<unknown>>],
      }),
  };
  return builder;
}

function emptyMetadata(): FieldMetadata {
  return { required: true };
}

/**
 * The `field` builder factory. Entry point for declaring a typed
 * spec field with chainable metadata + Contracts.
 *
 * @example
 * field.string()
 *   .required()
 *   .askHint({ en: 'What is the course called?' })
 *   .contract({
 *     id: 'title-non-empty',
 *     description: { en: 'Title must be non-empty after trim' },
 *     predicate: ({ fieldValue }) => typeof fieldValue === 'string' && fieldValue.trim().length > 0,
 *   });
 */
export const field = {
  string(): FieldBuilder<string> {
    return makeBuilder<string>({ base: 'string', metadata: emptyMetadata(), contracts: [] });
  },
  number(): FieldBuilder<number> {
    return makeBuilder<number>({ base: 'number', metadata: emptyMetadata(), contracts: [] });
  },
  integer(): FieldBuilder<number> {
    return makeBuilder<number>({ base: 'integer', metadata: emptyMetadata(), contracts: [] });
  },
  boolean(): FieldBuilder<boolean> {
    return makeBuilder<boolean>({ base: 'boolean', metadata: emptyMetadata(), contracts: [] });
  },
  date(): FieldBuilder<Date> {
    return makeBuilder<Date>({ base: 'date', metadata: emptyMetadata(), contracts: [] });
  },
  datetime(): FieldBuilder<Date> {
    return makeBuilder<Date>({ base: 'datetime', metadata: emptyMetadata(), contracts: [] });
  },
  enum<const T extends readonly string[]>(values: T): FieldBuilder<T[number]> {
    return makeBuilder<T[number]>({
      base: 'enum',
      metadata: { ...emptyMetadata(), options: values },
      contracts: [],
    });
  },
  array<T>(of: FieldBuilder<T>): FieldBuilder<T[]> {
    return makeBuilder<T[]>({
      base: 'array',
      metadata: emptyMetadata(),
      of: of,
      contracts: [],
    });
  },
  object<S extends Record<string, FieldBuilder<unknown>>>(
    shape: S,
  ): FieldBuilder<{ [K in keyof S]: S[K] extends FieldBuilder<infer V> ? V : never }> {
    return makeBuilder({
      base: 'object',
      metadata: emptyMetadata(),
      shape: shape as Readonly<Record<string, FieldSpec>>,
      contracts: [],
    });
  },
  reference(projection: ProjectionName | string): FieldBuilder<string> {
    return makeBuilder<string>({
      base: 'reference',
      metadata: emptyMetadata(),
      references: projection as ProjectionName,
      contracts: [],
    });
  },
  attachment(opts: { mime: readonly string[] }): FieldBuilder<string> {
    return makeBuilder<string>({
      base: 'attachment',
      metadata: emptyMetadata(),
      mime: opts.mime,
      contracts: [],
    });
  },
};
