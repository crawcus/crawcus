/*
 * Copyright 2026 Paul Wander
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Module augmentation for the `canonicalize` npm package.
 *
 * Why this exists: `canonicalize@2.1.0` ships CJS (`module.exports =
 * function`) but its `.d.ts` declares `export default function`. Under
 * TypeScript `module: NodeNext` + `esModuleInterop: true`, the default-
 * import resolution returns the namespace type rather than the callable
 * function — causing `TS2349: This expression is not callable`.
 *
 * This declaration overrides the package's types with the correct
 * CJS-shape `export = function` form so `import canonicalize from
 * 'canonicalize'` returns a callable.
 *
 * Remove when the upstream package fixes its types (tracked in
 * `07-engineering/dependency-picks.md` §3 trigger conditions).
 */
declare module 'canonicalize' {
  function canonicalize(value: unknown): string | undefined;
  export = canonicalize;
}
