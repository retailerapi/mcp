import { defineConfig } from 'tsup';

// Bundle to ESM. The `index.ts` entry is the bin script — it gets a shebang
// banner so users can run it via `npx @retailerapi/mcp` or as a stdio child
// process from Claude Desktop / Cursor.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  dts: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
