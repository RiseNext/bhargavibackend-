import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Lint configuration.
 *
 * `eslint-config-next` is deliberately NOT used. Its flat-config entry pulls in
 * `@rushstack/eslint-patch`, which throws on ESLint 9 in this setup, and its
 * value here would be small: the Next-specific rules police `next/image`,
 * `next/link` and Core Web Vitals on PUBLIC pages, and this repository serves
 * `/api/*` plus a plain internal admin panel. The public site lives in the
 * frontend repo, which keeps its own lint setup and which D-010 forbids
 * changing. Recorded as a dependency decision per CLAUDE.md §7.
 *
 * The one project-specific rule that matters is **`no-console`**.
 *
 * D-035 requires all output to go through the structured logger, because the
 * logger applies the redaction denylist that keeps a patient's health complaint
 * out of the logs. A stray `console.log(body)` bypasses it entirely — which is
 * exactly what the live frontend stub does today
 * (`console.info("[form:%s] %o", kind, body)`), and precisely the defect this
 * backend exists to replace.
 */
/**
 * Node globals, declared by hand rather than pulling in the `globals` package
 * for one object. The generator is plain `.mjs`, so without these every
 * `process` and `setTimeout` reads as undefined.
 */
const nodeGlobals = {
  process: "readonly",
  Buffer: "readonly",
  console: "readonly",
  fetch: "readonly",
  Response: "readonly",
  Request: "readonly",
  URL: "readonly",
  AbortController: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
  Function: "readonly",
  // Multipart uploads to Cloudinary. Global in Node 18+, but ESLint has no way
  // to know that without being told.
  FormData: "readonly",
  Blob: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      // Next.js generates this and owns its contents.
      "next-env.d.ts",
      // 🔒 The immutable content snapshot. Not code belonging to this repo, and
      // linting it would invite "fixing" it, which D-011 forbids.
      "docs/CURRENT-FRONTEND-CONTENT/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: nodeGlobals },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      // 🔴 The redaction rule. Every log line must go through lib/logger.ts.
      "no-console": "error",
      // Unused code in a security-relevant path is usually a half-finished
      // thought; an underscore prefix is the explicit opt-out.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Scripts talk to an operator on stdout, and `admin:create` must print a
    // generated password exactly once — something the logger would redact.
    files: ["scripts/**", "tests/**", "generator/**", "*.config.mjs", "*.config.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
