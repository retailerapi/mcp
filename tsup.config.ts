import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const PKG = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
  name: string;
};

// Bundle to ESM. The `index.ts` entry is the bin script — it gets a shebang
// banner so users can run it via `npx @retailerapi/mcp` or as a stdio child
// process from Claude Desktop / Cursor.
//
// `define` replaces __PKG_VERSION__ / __PKG_NAME__ at compile time so server.ts
// and client.ts never drift from package.json. Bumping the version anywhere
// other than package.json is impossible by construction.
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
  define: {
    __PKG_VERSION__: JSON.stringify(PKG.version),
    __PKG_NAME__: JSON.stringify(PKG.name),
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
});
