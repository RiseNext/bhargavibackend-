import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

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
