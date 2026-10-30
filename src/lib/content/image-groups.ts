/**
 * Which page-copy slots own an IMAGE COLLECTION — and therefore must always
 * offer the image editor, even when the collection is currently empty.
 *
 * 🔴 THE REGRESSION THIS FILE EXISTS TO PREVENT. The slot editor derived its
 * list of image groups from the rows it found:
 *
 *     const imageGroups = await loadImageGroups(row.id);   // [] when none exist
 *     {imageGroups.map((g) => <ImageCollectionEditor … />)}
 *
 * `home.hero` holds ONE image row in production (D-041). Removing it emptied
 * the derived list, so `.map` rendered nothing and the whole image-management
 * section — previews, reorder, main-image, alt text AND the "Add an image" box
 * that lives inside it — vanished from the screen. The only control that could
 * undo the removal was inside the component that disappeared, so the homepage
 * photograph became unmanageable from the admin panel and no amount of
 * reloading brought it back. A self-sealing dead end.
 *
 * A collection is a property of the SLOT, not of the rows that happen to be in
 * it today. Declaring it here means an empty collection renders an empty
 * editor — which is a screen an administrator can act on.
 *
 * ⚠ NOTHING HERE IS INVENTED — same rule as `extra-allowlist.ts`. Every entry
 * is a group a frontend component actually reads, cross-checked against the
 * seed derivation:
 *
 *   · `home.hero.images`  — `frontend/src/components/sections/Hero.tsx:32`,
 *     `copy.items("home", "hero", "images")`. One row today (D-041); the
 *     founder portrait beside it is derived from `site.founder.*` and is
 *     deliberately NOT a row.
 *   · `home.intro.images` — `frontend/src/components/sections/HomeSections.tsx:48-49`,
 *     `copy.item("home", "intro", "images", 0)` and `(…, 1)`. Two rows.
 *
 *   Both appear in `scripts/seed/content-blocks.ts` `deriveImageItems()`, whose
 *   `GROUPS` constant lists exactly these two slots and no others.
 *
 * 🔴 ADDING A SLOT HERE DOES NOT CREATE A COLLECTION. It only makes an existing
 * one reachable when empty. A slot no component reads would offer an upload
 * that publishes to nowhere — which is what D-040 and `verify:page-copy` exist
 * to catch. Add the consumer first.
 */

/** Declared image groups, keyed `page.slot`, or by bare slot for single-slot pages. */
export const IMAGE_GROUPS: Record<string, readonly string[]> = {
  "home.hero": ["images"],
  "home.intro": ["images"],
};

export function declaredImageGroups(page: string, slot: string): readonly string[] {
  return IMAGE_GROUPS[`${page}.${slot}`] ?? IMAGE_GROUPS[slot] ?? [];
}

/**
 * The groups the slot editor should render: every DECLARED group, plus any
 * group that actually holds rows.
 *
 * 🔴 THE UNION IS THE POINT, in both directions.
 *
 *   · A declared group with no rows still renders — an empty editor with its
 *     "Add an image" box, which is the case that broke.
 *   · An UNDECLARED group that holds rows still renders. Hiding it would make
 *     live content invisible and unmanageable, which is a worse version of the
 *     same bug: the row would keep publishing with no way to reach it. If one
 *     shows up here that no component reads, the fix is to add the consumer or
 *     delete the row deliberately — not to let the screen pretend it is absent.
 *
 * Declared groups come first and in declaration order, so the screen's layout
 * does not depend on what the database happens to contain. Generic in the row
 * type to keep this module free of any client-component import.
 */
export function mergeImageGroups<T>(
  declared: readonly string[],
  found: ReadonlyArray<{ key: string; rows: T[] }>,
): Array<{ key: string; rows: T[] }> {
  const byKey = new Map(found.map((g) => [g.key, g.rows]));
  const keys = [...new Set([...declared, ...found.map((g) => g.key)])];
  return keys.map((key) => ({ key, rows: byKey.get(key) ?? [] }));
}
