import { defineConfig, type Plugin } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * 🔴 Strip a `#!` line from a plain `.mjs` module before vite-node evaluates it.
 *
 * The cross-repo generator suites import the FRONTEND's copy of
 * `scripts/generate-content.mjs` — the file Vercel actually runs — so that a
 * divergence between the two copies fails a test rather than a deploy. Vite
 * runs esbuild only on `.ts`/`.tsx`/`.jsx`, never on `.mjs`, so a `.mjs`
 * module reaches `vm.Script` byte-for-byte. Both generators open with
 * `#!/usr/bin/env node`, which Node understands and `vm.Script` does not, so
 * the frontend copy threw `SyntaxError: Invalid or unexpected token` on line 1
 * and four assertions failed for a reason that had nothing to do with the code
 * under test. (The backend's own copy survived only because its path is inside
 * the Vite root and reaches a different loader branch — the same latent trap,
 * one layer away.)
 *
 * Deliberately narrow: `.mjs` only, the first line only, and the newline is
 * kept so every later line number still matches the file on disk.
 */
function stripShebang(): Plugin {
  return {
    name: "bhw:strip-shebang",
    enforce: "pre",
    transform(code, id) {
      if (!/\.mjs(?:\?.*)?$/.test(id) || !code.startsWith("#!")) return null;
      return { code: code.replace(/^#![^\n]*/, ""), map: null };
    },
  };
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests share one Postgres database; running files in parallel
    // would let one suite's truncate wipe another's fixtures mid-assertion.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["tests/setup.ts"],
  },
  plugins: [stripShebang()],
  // `generator/emphasis.tsx` is JSX, and its test asserts that the parser
  // returns React ELEMENTS rather than markup — which is the property that
  // stops it becoming a second XSS path. The automatic runtime means the file
  // needs no `import React`, matching how the frontend compiles it.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
