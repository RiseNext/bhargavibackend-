/**
 * One-off scaffolder for the public collection routes (operations 7–21).
 *
 * Fourteen route files that differ only in which loader they call. Generating
 * them keeps the set provably consistent — every one gets the rate limit, the
 * ETag and the cache headers, because they all come from the same template
 * rather than from fourteen chances to forget one.
 *
 * It refuses to overwrite an existing file, so a later hand-edit survives.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const API = resolve(ROOT, "src", "app", "api");

interface RouteSpec {
  /** Path under src/app/api, e.g. "services/[slug]". */
  dir: string;
  /** The generated file body. */
  body: string;
}

const header = (doc: string) => `/**\n${doc}\n */\n\n`;

const routes: RouteSpec[] = [
  {
    dir: "services",
    body:
      header(
        " * GET /api/services — public operation 7.\n" +
          " *\n" +
          " * Feeds the generator's `content/services.ts`. `copyStatus` is deliberately\n" +
          " * absent from the payload: it has zero frontend consumers and is editorial\n" +
          " * state that should never be publicly visible.",
      ) +
      `import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listServices } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/services", "services", async () => ({
  items: await listServices(),
  updatedAt: await latestContentChange(),
}));
`,
  },
  {
    dir: "services/[slug]",
    body:
      header(" * GET /api/services/{slug} — public operation 8.") +
      `import { resourceRoute } from "@/lib/public-read";
import { findService } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = resourceRoute("GET /api/services/{slug}", "services", async (request) => {
  const slug = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const item = await findService(slug);
  return { item, updatedAt: item?.updatedAt };
});
`,
  },
  {
    dir: "testimonials",
    body:
      header(
        " * GET /api/testimonials — public operation 9. Supports `?featured=true`.\n" +
          " *\n" +
          " * 🔴 X-22: `rating` is NOT in the payload. TestimonialCard renders five\n" +
          " * hardcoded stars independent of data, and `rating` is NULL on all 23 rows —\n" +
          " * exposing it invites wiring the stars to it, which would strip them from\n" +
          " * every card.",
      ) +
      `import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listTestimonials } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/testimonials", "testimonials", async (request) => ({
  items: await listTestimonials(new URL(request.url).searchParams.get("featured") === "true"),
  updatedAt: await latestContentChange(),
}));
`,
  },
  {
    dir: "videos",
    body:
      header(
        " * GET /api/videos — public operation 10. Supports `?featured=true`.\n" +
          " *\n" +
          " * Thumbnail and embed URLs are DERIVED from the id by code-owned helpers\n" +
          " * (`youtubeThumb`, `youtubeWatch`), never stored and never sent.",
      ) +
      `import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listVideos } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/videos", "videos", async (request) => ({
  items: await listVideos(new URL(request.url).searchParams.get("featured") === "true"),
  updatedAt: await latestContentChange(),
}));
`,
  },
  {
    dir: "gallery",
    body:
      header(
        " * GET /api/gallery — public operation 11.\n" +
          " *\n" +
          " * `gallery_images.alt` wins over `media.alt_default`: the per-use alt\n" +
          " * describes this placement, the media default is only a fallback.",
      ) +
      `import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listGallery } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/gallery", "gallery", async () => ({
  items: await listGallery(),
  updatedAt: await latestContentChange(),
}));
`,
  },
  {
    dir: "faqs",
    body:
      header(
        " * GET /api/faqs — public operation 12.\n" +
          " *\n" +
          " * Answers are PLAIN TEXT, enforced at the storage boundary, because they are\n" +
          " * serialised into FAQPage JSON-LD where markup would be invalid.",
      ) +
      `import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listFaqs } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/faqs", "faqs", async () => ({
  items: await listFaqs(),
  updatedAt: await latestContentChange(),
}));
`,
  },
  {
    dir: "jobs",
    body:
      header(
        " * GET /api/jobs — public operation 13.\n" +
          " *\n" +
          " * `branch` is the DERIVED display string the frontend already consumes\n" +
          " * (D-015): \"Either branch\" when the flag is set, otherwise the branch name.\n" +
          " * So no frontend change is required.",
      ) +
      `import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listJobs } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/jobs", "jobs", async () => ({
  items: await listJobs(),
  updatedAt: await latestContentChange(),
}));
`,
  },
  {
    dir: "jobs/[slug]",
    body:
      header(" * GET /api/jobs/{slug} — public operation 14.") +
      `import { resourceRoute } from "@/lib/public-read";
import { findJob } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = resourceRoute("GET /api/jobs/{slug}", "jobs", async (request) => {
  const slug = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const item = await findJob(slug);
  return { item, updatedAt: item?.updatedAt };
});
`,
  },
  {
    dir: "content-lists",
    body:
      header(
        " * GET /api/content-lists — public operation 19. Supports `?collection=`.\n" +
          " *\n" +
          " * Five collections in one table: whyChooseUs, process, philosophy,\n" +
          " * achievements, aboutStory. ⚠ `philosophy` lives inside about/page.tsx in the\n" +
          " * live frontend, not a content file — the easiest thing to miss on migration.",
      ) +
      `import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listContentLists, type ContentCollection } from "@/lib/content/public";

export const dynamic = "force-dynamic";

const COLLECTIONS = new Set<ContentCollection>([
  "why_choose_us",
  "process",
  "philosophy",
  "achievements",
  "about_story",
]);

export const GET = collectionRoute("GET /api/content-lists", "content-lists", async (request) => {
  const requested = new URL(request.url).searchParams.get("collection");
  // An unknown filter returns everything rather than 400 — the generator asks
  // for all of them, and a typo should not fail a build.
  const collection =
    requested !== null && COLLECTIONS.has(requested as ContentCollection)
      ? (requested as ContentCollection)
      : undefined;

  return { items: await listContentLists(collection), updatedAt: await latestContentChange() };
});
`,
  },
  {
    dir: "content-blocks",
    body:
      header(
        " * GET /api/content-blocks — public operation 18. Supports `?page=`.\n" +
          " *\n" +
          " * Returns `extra` and the repeating `items[]` groups (D-024). The seeded row\n" +
          " * set is incomplete until seed stage S3, which is gated on 0.12.",
      ) +
      `import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listContentBlocks } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/content-blocks", "content-blocks", async (request) => ({
  items: await listContentBlocks(new URL(request.url).searchParams.get("page") ?? undefined),
  updatedAt: await latestContentChange(),
}));
`,
  },
  {
    dir: "page-meta",
    body:
      header(
        " * GET /api/page-meta — public operation 20.\n" +
          " *\n" +
          " * Nine rows, not eleven: `/services/[slug]` is a generated template whose\n" +
          " * values live in `services.seo_*`, and `not-found` exports no metadata today.",
      ) +
      `import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listPageMeta } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/page-meta", "page-meta", async () => ({
  items: await listPageMeta(),
  updatedAt: await latestContentChange(),
}));
`,
  },
  {
    dir: "page-meta/[page]",
    body:
      header(" * GET /api/page-meta/{page} — public operation 21.") +
      `import { resourceRoute } from "@/lib/public-read";
import { findPageMeta } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = resourceRoute("GET /api/page-meta/{page}", "page-meta", async (request) => {
  const page = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const item = await findPageMeta(page);
  return { item, updatedAt: item?.updatedAt };
});
`,
  },
  {
    dir: "posts",
    body:
      header(
        " * GET /api/posts — public operation 15. Paginated: `?page&limit&tag`.\n" +
          " *\n" +
          " * Only `published` posts with a `published_at` in the past. A draft must never\n" +
          " * be publicly reachable.",
      ) +
      `import { handle, paginated } from "@/lib/http";
import { guardPublicRead, publicReadHeaders } from "@/lib/public-read";
import { listPosts } from "@/lib/content/public";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 50;

export function GET(request: Request): Promise<Response> {
  return handle("GET /api/posts", async () => {
    await guardPublicRead(request, "posts");

    const params = new URL(request.url).searchParams;
    // Clamped rather than rejected: a bad page number should not fail a build.
    const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get("limit") ?? "10") || 10));
    const tag = params.get("tag") ?? undefined;

    const result = await listPosts({ page, limit, ...(tag ? { tag } : {}) });

    return paginated(
      result.items,
      { total: result.total, page: result.page, limit: result.limit },
      { headers: publicReadHeaders() },
    );
  });
}
`,
  },
  {
    dir: "posts/[slug]",
    body:
      header(" * GET /api/posts/{slug} — public operation 16. Returns the post plus its blocks.") +
      `import { resourceRoute } from "@/lib/public-read";
import { findPost } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = resourceRoute("GET /api/posts/{slug}", "posts", async (request) => {
  const slug = decodeURIComponent(new URL(request.url).pathname.split("/").pop() ?? "");
  const item = await findPost(slug);
  return { item, updatedAt: item?.updatedAt };
});
`,
  },
];

let written = 0;
let skipped = 0;

for (const route of routes) {
  const file = resolve(API, route.dir, "route.ts");
  if (existsSync(file)) {
    skipped += 1;
    continue;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, route.body, "utf8");
  written += 1;
  process.stdout.write(`  wrote api/${route.dir}/route.ts\n`);
}

process.stdout.write(
  `\n${String(written)} route file(s) written, ${String(skipped)} already present.\n`,
);
