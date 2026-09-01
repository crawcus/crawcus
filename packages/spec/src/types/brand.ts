/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Nominal-type brand helper. Zero runtime cost; pure type-level discipline.
 *
 * `Brand<T, K>` is `T` at runtime, but TypeScript treats it as distinct
 * from any other `Brand<T, K2>`. Used to make `IntentId` and `EventId`
 * type-distinguishable even though both are strings underneath.
 */
export type Brand<T, K extends string> = T & { readonly __brand: K };

/**
 * Information-flow taint markers (IFC-lite).
 *
 * A value typed `Tainted<T>` has NOT crossed the PII boundary and may
 * contain raw PII. A value typed `Untainted<T>` has been processed by
 * `tokenisePayload` — only Tokens remain.
 *
 * `writeEvent` accepts only `Untainted<TPayload>`. The only function
 * that produces `Untainted<T>` from `Tainted<T>` is `tokenisePayload`.
 * Customer code that bypasses tokenisation cannot satisfy the
 * `writeEvent` signature — the compiler refuses.
 *
 * Backstopped by ESLint rule `no-untainted-cast` (forbids `as
 * Untainted<…>` outside `packages/core/src/pii/tokenise.ts`).
 */
export type Tainted<T> = T & { readonly __taint: 'tainted' };
export type Untainted<T> = T & { readonly __taint: 'untainted' };
