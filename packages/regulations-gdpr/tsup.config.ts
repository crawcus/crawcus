import { defineConfig } from 'tsup';

/**
 * GDPR pack emits two entries:
 * - `index.ts` — Contract factories (runtime intent-evaluation surface)
 * - `disclosure-templates/index.ts` — typed disclosure-boilerplate
 *   fillers per HF feedback 2026-06-02 item 4. Separate entry so the
 *   bundle-size cap on the main index stays tight (NFR M5 + ratchet
 *   floor in `.size-limit.cjs`).
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'disclosure-templates/index': 'src/disclosure-templates/index.ts',
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
