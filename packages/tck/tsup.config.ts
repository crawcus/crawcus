import { defineConfig } from 'tsup';

/**
 * @crawcus/tck emits two entries:
 * - `index.ts` — top-level TCK surface (Gherkin coverage helper + barrel)
 * - `fixtures/index.ts` — standalone CRAWCUS conformance fixtures (any
 *   runtime claiming spec compliance must satisfy these). Imported via
 *   `@crawcus/tck/fixtures` per the package `exports` map.
 *
 * Q-CR9 LOCKED 2026-06-02 — first fixture (`disclosure-signal`) ships
 * with this commit; structure ratifies the long-deferred TCK shape.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'fixtures/index': 'src/fixtures/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: {
    compilerOptions: {
      composite: false,
      incremental: false,
    },
  },
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  minify: false,
  target: 'es2022',
});
