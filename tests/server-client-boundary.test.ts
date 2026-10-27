/**
 * 🔴 A SERVER COMPONENT MAY NOT INVOKE A CLIENT MODULE'S EXPORTS.
 *
 * WHAT HAPPENED. The generic image-collection editor was given an adapter so
 * one screen could drive both `service_images` and the home hero's
 * `content_block_items`. The factories were exported from
 * `ImageCollectionEditor.tsx` — a `"use client"` module — and the two Server
 * Components CALLED them to build an `ops` prop. Production threw on every
 * service edit:
 *
 *     Error: Attempted to call serviceImageOps() from the server but
 *     serviceImageOps is on the client. It's not possible to invoke a client
 *     function from the server; it can only be rendered as a Component or
 *     passed to props of a Client Component.
 *
 * The admin service LIST loaded fine, so the regression only appeared on
 * clicking Edit. `/admin/page-copy/home/hero` had the identical defect through
 * `blockItemOps`, and a THIRD, latent since the admin panel was first built:
 * the blog blocks page calls `normaliseBlockRow`, exported from
 * `BlocksEditor.tsx`.
 *
 * WHY NOTHING CAUGHT IT. This is a RUNTIME RSC error, not a type error and not
 * a build error — `next build` succeeds, `tsc` is happy, and the page only
 * throws when it renders. Every admin test in this suite was either API-level
 * (`admin-route-guard`) or source-level about guards and wording. The one test
 * family that renders screens is in the frontend repo, which has no admin.
 *
 * So this is a source-level invariant over the whole `src/app` tree, in the
 * same spirit as `admin-page-guard.test.ts`: the next page added inherits it
 * for free. `tests/admin-screens-render.test.ts` covers the same ground
 * behaviourally by actually rendering the pages.
 *
 * ⚠ WHAT IS STILL ALLOWED, because the rule is about VALUES crossing:
 *   · rendering a Client Component            <Editor … />
 *   · `import type` / `{ type X }`            erased at compile time
 *   · a Client Component importing anything from a neutral module
 * Only a *value* imported from a `"use client"` module into a server file is
 * the defect — and only then if it is used as a value, which is why a bare
 * default-component import is fine.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const APP = resolve(ROOT, "src", "app");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const FILES = walk(APP);
const source = new Map(FILES.map((f) => [f, readFileSync(f, "utf8")]));

/** The `"use client"` directive must be the first statement to count. */
const isClientModule = (file: string): boolean =>
  /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(source.get(file) ?? "");

/** Resolves a relative or `@/`-aliased specifier to a file on disk. */
function resolveSpecifier(fromFile: string, spec: string): string | undefined {
  let base: string;
  if (spec.startsWith("@/")) base = resolve(ROOT, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return undefined; // a package, not ours

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (source.has(candidate)) return candidate;
  }
  // Outside src/app (e.g. src/lib) — never a client module in this codebase,
  // and `src/lib` is asserted free of the directive below.
  return undefined;
}

interface Violation {
  file: string;
  specifier: string;
  bindings: string[];
}

/**
 * Named, non-type bindings imported from a client module by a server file.
 *
 * A DEFAULT import is excluded: that is the component itself, which a Server
 * Component is expressly allowed to render.
 */
function violations(): Violation[] {
  const found: Violation[] = [];

  for (const file of FILES) {
    if (isClientModule(file)) continue;
    const text = source.get(file) ?? "";

    // `import … from "…";` — multi-line, which every real import here is.
    for (const m of text.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
      const clause = m[1] ?? "";
      const spec = m[2] ?? "";

      // `import type { … } from` is wholly erased.
      if (/^\s*type\s/.test(clause)) continue;

      const target = resolveSpecifier(file, spec);
      if (target === undefined || !isClientModule(target)) continue;

      // Only the braced part can carry named value bindings.
      const braced = /\{([\s\S]*?)\}/.exec(clause)?.[1] ?? "";
      const named = braced
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "")
        // `{ type Foo }` is erased; a bare `Foo` is a value.
        .filter((s) => !/^type\s/.test(s));

      if (named.length > 0) {
        found.push({ file: relative(ROOT, file).replace(/\\/g, "/"), specifier: spec, bindings: named });
      }
    }
  }

  return found;
}

describe("🔴 server/client component boundary", () => {
  it("finds the app tree and some client modules at all", () => {
    // A scanner that matched nothing would pass this file silently.
    expect(FILES.length).toBeGreaterThan(30);
    expect(FILES.filter(isClientModule).length).toBeGreaterThan(5);
  });

  it("no Server Component imports a VALUE from a \"use client\" module", () => {
    const bad = violations();
    const report = bad
      .map((v) => `  ${v.file}\n    imports { ${v.bindings.join(", ")} } from "${v.specifier}"`)
      .join("\n");

    expect(
      bad,
      bad.length === 0
        ? ""
        : "A Server Component cannot invoke a client module's exports — this is the\n" +
          "production error 'Attempted to call X() from the server but X is on the\n" +
          "client'. Either pass serializable props and let the Client Component call\n" +
          "its own handler, or move genuinely server-safe logic into a neutral module\n" +
          `that has no "use client" directive.\n\n${report}\n`,
    ).toEqual([]);
  });

  /*
   * ⚠ Comments stripped before the NEGATIVE assertions.
   *
   * Each fixed file documents the error it used to throw, quoting
   * `serviceImageOps()` by name. A scanner that reads comments flags the
   * explanation as the offence, fails loudest on the file that was just fixed,
   * and makes deleting the reasoning the obvious way to go green.
   */
  const code = (file: string): string =>
    (source.get(file) ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  it("the three known offenders are fixed in the way the rule requires", () => {
    // Serializable data crosses for the two image editors…
    const service = code(resolve(APP, "admin", "content", "[collection]", "[id]", "page.tsx"));
    expect(service).toMatch(/target=\{\{\s*kind:\s*"service"/);
    expect(service).not.toMatch(/\bserviceImageOps\s*\(/);

    const slot = code(resolve(APP, "admin", "page-copy", "[page]", "[slot]", "page.tsx"));
    expect(slot).toMatch(/kind:\s*"blockItem"/);
    expect(slot).not.toMatch(/\bblockItemOps\s*\(/);

    // …and the pure mapping moved to a neutral module instead.
    const blocks = code(resolve(APP, "admin", "content", "posts", "[id]", "blocks", "page.tsx"));
    expect(blocks).toMatch(/from "\.\/block-row"/);
    expect(blocks).not.toMatch(/normaliseBlockRow[^;]*from\s*"\.\/BlocksEditor"/);
    expect(isClientModule(resolve(APP, "admin", "content", "posts", "[id]", "blocks", "block-row.ts"))).toBe(
      false,
    );
  });

  it("the request builders stayed on the client, where they belong", () => {
    // They describe browser fetches, so relocating them would have been the
    // wrong fix even though it would also have silenced the error.
    const editor =
      source.get(resolve(APP, "admin", "_components", "ImageCollectionEditor.tsx")) ?? "";
    expect(isClientModule(resolve(APP, "admin", "_components", "ImageCollectionEditor.tsx"))).toBe(true);
    expect(editor).toMatch(/function serviceImageOps\(/);
    expect(editor).toMatch(/function blockItemOps\(/);
    // Not exported any more — an exported factory is what the server reached for.
    expect(editor).not.toMatch(/export function serviceImageOps\(/);
    expect(editor).not.toMatch(/export function blockItemOps\(/);
  });

  it("src/lib stays free of the client directive, so server code may use it freely", () => {
    const lib = walk(resolve(ROOT, "src", "lib"));
    const clientish = lib.filter((f) =>
      /^\s*(?:\/\*[\s\S]*?\*\/\s*)?["']use client["']/.test(readFileSync(f, "utf8")),
    );
    expect(clientish.map((f) => relative(ROOT, f))).toEqual([]);
  });
});
