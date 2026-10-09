/**
 * Read-only verification of the real Neon database against the approved
 * canonical counts (D-036) and the branch-ordering decisions (D-013 / D-029).
 *
 * 🔴 Reads only. Nothing here writes, truncates or drops — this database is
 * real project data, and the destructive test helpers are confined to
 * localhost by the guard in `tests/setup.ts`.
 */

import { withNeon } from "./_neon-verify.mjs";

const EXPECTED = {
  branches: 2,
  services: 10,
  testimonials: 23,
  videos: 19,
  faqs: 6,
  jobs: 6,
  stats: 4,
  social_links: 3,
  page_meta: 9,
  content_list_items: 19,
  site_settings: 1,
};

await withNeon(async (q) => {
  const rows = await q(`
    SELECT 'branches' t, count(*)::int n FROM branches
    UNION ALL SELECT 'services', count(*)::int FROM services
    UNION ALL SELECT 'testimonials', count(*)::int FROM testimonials
    UNION ALL SELECT 'videos', count(*)::int FROM videos
    UNION ALL SELECT 'faqs', count(*)::int FROM faqs
    UNION ALL SELECT 'jobs', count(*)::int FROM jobs
    UNION ALL SELECT 'stats', count(*)::int FROM stats
    UNION ALL SELECT 'social_links', count(*)::int FROM social_links
    UNION ALL SELECT 'page_meta', count(*)::int FROM page_meta
    UNION ALL SELECT 'content_list_items', count(*)::int FROM content_list_items
    UNION ALL SELECT 'site_settings', count(*)::int FROM site_settings
    UNION ALL SELECT 'gallery_images', count(*)::int FROM gallery_images
    UNION ALL SELECT 'media', count(*)::int FROM media
    UNION ALL SELECT 'content_blocks', count(*)::int FROM content_blocks
    UNION ALL SELECT 'content_block_items', count(*)::int FROM content_block_items
    UNION ALL SELECT 'submissions', count(*)::int FROM submissions
    UNION ALL SELECT 'applications', count(*)::int FROM applications
    UNION ALL SELECT 'blog_posts', count(*)::int FROM blog_posts
    UNION ALL SELECT 'admin_users', count(*)::int FROM admin_users
    ORDER BY 1`);

  let bad = 0;
  console.log("=== Neon row counts ===");
  for (const r of rows) {
    const want = EXPECTED[r.t];
    const mark = want === undefined ? " " : r.n === want ? "✓" : "✗";
    if (want !== undefined && r.n !== want) bad++;
    console.log(`  ${mark} ${r.t.padEnd(20)} ${String(r.n).padStart(3)}${want !== undefined ? `  (expected ${want})` : ""}`);
  }

  const b = await q(`SELECT name, is_primary, sort_order, phone_sort_order,
      (address_line1 IS NULL) addr_null, (lat IS NULL AND lng IS NULL) geo_null,
      (maps_url IS NULL) maps_null, (hours IS NULL) hours_null
    FROM branches ORDER BY sort_order`);

  console.log("\n=== branches — Bowenpally's gaps must be PRESERVED, never invented ===");
  for (const r of b) {
    console.log(`  ${r.name.padEnd(14)} is_primary=${r.is_primary} sort=${r.sort_order} phone_sort=${r.phone_sort_order}`);
    console.log(`      address=${r.addr_null ? "NULL" : "set"}  geo=${r.geo_null ? "NULL" : "set"}  maps=${r.maps_null ? "NULL" : "set"}  hours=${r.hours_null ? "NULL" : "set"}`);
  }

  const o = await q(`SELECT (SELECT name FROM branches ORDER BY sort_order LIMIT 1) b0,
                            (SELECT name FROM branches ORDER BY phone_sort_order LIMIT 1) p0`);
  const okOrder = o[0].b0 === "Chikkadpally" && o[0].p0 === "Bowenpally";
  console.log(`\n  ${okOrder ? "✓" : "✗"} D-013  branches[0]=${o[0].b0}  phones[0]=${o[0].p0}  (want Chikkadpally / Bowenpally)`);
  if (!okOrder) bad++;

  const stages = await q(`SELECT stage FROM _seed_stages ORDER BY stage`);
  console.log(`\n  seed stages applied: ${stages.map((s) => s.stage).join(", ") || "(none)"}`);

  console.log(bad === 0 ? "\nRESULT: ✅ all checked counts match\n" : `\nRESULT: 🔴 ${bad} mismatch(es)\n`);
  if (bad > 0) process.exitCode = 1;
});
