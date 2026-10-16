import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  resolve: { alias: { buffer: 'buffer/' } },
  define: { global: 'globalThis' },
  build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
  test: { include: ['test/**/*.test.ts'] },
} as never);
