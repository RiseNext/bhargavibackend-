/**
 * The declared-image-group registry and the merge that keeps an emptied
 * collection reachable.
 *
 * 🔴 THE INCIDENT. `/admin/page-copy/[page]/[slot]` built its list of image
 * editors from the rows in the database. `home.hero` holds ONE image row
 * (D-041), so removing it produced an empty list, `.map` rendered nothing, and
 * the whole image-management section — previews, reorder, main image, alt text
 * and the "Add an image" box inside it — disappeared. The control that could
 * undo the removal was inside the component that vanished.
 *
 * `tests/admin-screens-render.test.ts` covers the rendered screen, but it is
 * opt-in and costs minutes. These are the millisecond guards that run in every
 * `npm test`: the registry must keep naming the slots the frontend reads, and
 * the merge must never drop a group.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  IMAGE_GROUPS,
  declaredImageGroups,
  mergeImageGroups,
} from "../src/lib/content/image-groups";

const FRONTEND = resolve(import.meta.dirname, "..", "..", "frontend", "src");

describe("the declared image-group registry", () => {
  it("declares home.hero and home.intro — the two slots with image collections", () => {
    expect(declaredImageGroups("home", "hero")).toEqual(["images"]);
    expect(declaredImageGroups("home", "intro")).toEqual(["images"]);
  });

  it("declares nothing for a slot that has no image collection", () => {
    expect(declaredImageGroups("about", "story")).toEqual([]);
    expect(declaredImageGroups("contact", "map")).toEqual([]);
  });

  /**
   * 🔴 NOTHING HERE MAY BE INVENTED — the `extra-allowlist` rule. A declared
   * group that no component reads would offer an upload publishing to nowhere;
   * worse, it would make the empty state warn about a rebuild failure that
   * would not actually happen.
   *
   * Checked against the real frontend source rather than a copied list, so a
   * component that stops reading a group fails this instead of leaving a
   * phantom editor behind.
   */
  it("every declared group is actually read by a frontend component", () => {
    const sources = ["components/sections/Hero.tsx", "components/sections/HomeSections.tsx"]
      .map((f) => readFileSync(resolve(FRONTEND, f), "utf8"))
      .join("\n");

    for (const [slotKey, groups] of Object.entries(IMAGE_GROUPS)) {
      const [page, slot] = slotKey.split(".");
      for (const group of groups) {
        // `copy.items("home", "hero", "images")` or `copy.item("home", "intro", "images", 0)`
        const reader = new RegExp(
          `copy\\.items?\\(\\s*"${page}"\\s*,\\s*"${slot}"\\s*,\\s*"${group}"`,
        );
        expect(
          reader.test(sources),
          `${slotKey}.${group} is declared but no frontend component reads it`,
        ).toBe(true);
      }
    }
  });

  /**
   * The other direction: a group the frontend reads but the registry omits is
   * the original bug waiting to happen again on a different slot.
   */
  it("every image group a frontend component reads is declared", () => {
    for (const file of ["components/sections/Hero.tsx", "components/sections/HomeSections.tsx"]) {
      const src = readFileSync(resolve(FRONTEND, file), "utf8");
      const calls = src.matchAll(
        /copy\.items?\(\s*"([a-zA-Z]+)"\s*,\s*"([a-zA-Z]+)"\s*,\s*"(images)"/g,
      );
      for (const [, page, slot, group] of calls) {
        expect(
          declaredImageGroups(page as string, slot as string),
          `${String(page)}.${String(slot)}.${String(group)} is read by ${file} but not declared — ` +
            "emptying it would hide the editor",
        ).toContain(group);
      }
    }
  });
});

describe("mergeImageGroups", () => {
  const row = (id: string) => ({ id });

  it("🔴 renders a declared group that holds NO rows — the regression itself", () => {
    expect(mergeImageGroups(["images"], [])).toEqual([{ key: "images", rows: [] }]);
  });

  it("keeps the rows of a declared group that has them", () => {
    const found = [{ key: "images", rows: [row("a"), row("b")] }];
    expect(mergeImageGroups(["images"], found)).toEqual([
      { key: "images", rows: [row("a"), row("b")] },
    ]);
  });

  /**
   * An undeclared group holding live rows must still render. Hiding it would be
   * the same defect with the sign flipped: the rows would keep publishing with
   * no screen able to reach them.
   */
  it("still renders an UNDECLARED group that holds rows", () => {
    const merged = mergeImageGroups([], [{ key: "surprise", rows: [row("a")] }]);
    expect(merged).toEqual([{ key: "surprise", rows: [row("a")] }]);
  });

  it("orders declared groups first and in declaration order", () => {
    const merged = mergeImageGroups(
      ["images", "secondary"],
      [{ key: "surprise", rows: [row("x")] }, { key: "secondary", rows: [row("y")] }],
    );
    expect(merged.map((g) => g.key)).toEqual(["images", "secondary", "surprise"]);
  });

  it("never duplicates a group that is both declared and found", () => {
    const merged = mergeImageGroups(["images"], [{ key: "images", rows: [row("a")] }]);
    expect(merged).toHaveLength(1);
  });

  it("returns nothing for a slot with neither declared nor found groups", () => {
    expect(mergeImageGroups([], [])).toEqual([]);
  });
});
