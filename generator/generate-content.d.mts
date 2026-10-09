/** Types for `generate-content.mjs`. See `hours.d.mts` for why these exist. */

/**
 * The generator's input. Loosely typed on purpose: it arrives as parsed JSON
 * over HTTP, and the generator's own `assertUsable` is what validates it — a
 * strict compile-time type here would give a false sense that the runtime shape
 * is guaranteed.
 */
export interface GeneratorSettings {
  /** Populated by GET /api/site-settings; `assertUsable` validates the rest. */
  resolution?: { missingRequired?: readonly string[]; missingMedia?: readonly string[] };
  stats?: readonly unknown[];
  phones?: readonly unknown[];
  branches?: readonly unknown[];
  hours?: unknown;
  /** Identity fields `assertUsable` requires; see GEN-SEO-03. */
  name?: string | null;
  shortName?: string | null;
  email?: string | null;
  priceRange?: string | null;
  tagline?: string | null;
  description?: string | null;
  whatsapp?: { href?: string | null } | null;
}

export interface GeneratorContent {
  settings: GeneratorSettings;
  services: unknown[];
  testimonials: unknown[];
  videos: unknown[];
  gallery: unknown[];
  faqs: unknown[];
  jobs: unknown[];
  contentLists: unknown[];
  /** The 41 page-copy rows (D-024). Emitted into `src/content/page-copy.ts`. */
  contentBlocks: unknown[];
  pageMeta: unknown[];
  posts: unknown[];
}

export declare function createFetcher(options: {
  baseUrl: string | undefined;
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
}): (path: string) => Promise<unknown>;

export declare function fetchContent(
  get: (path: string) => Promise<unknown>,
): Promise<GeneratorContent>;

/** 🔴 R-i — throws rather than letting a broken site build green. */
export declare function assertUsable(content: GeneratorContent): void;

/**
 * 🔴 R-i extended — media URLs that are PRESENT but WRONG.
 *
 * Returns one message per problem: a `demo`-cloud URL, the synthetic
 * `bhw-local/` prefix, or delivery URLs spanning more than one Cloudinary
 * account. Empty array means the media is coherent.
 */
export declare function mediaUrlProblems(content: unknown): string[];

export declare function formatRupees(paise: number): string;

export declare function emitSite(content: GeneratorContent): string;
export declare function emitServices(content: GeneratorContent): string;
export declare function emitTestimonials(content: GeneratorContent): string;
export declare function emitMedia(content: GeneratorContent): string;
export declare function emitCareers(content: GeneratorContent): string;
export declare function emitSiteContent(content: GeneratorContent): string;
export declare function emitPosts(content: GeneratorContent): string;
export declare function emitPageMeta(content: GeneratorContent): string;
/**
 * Only reads `contentBlocks`, so it accepts a partial — which lets the privacy
 * publication-gate tests exercise it without assembling a whole site payload.
 */
export declare function emitPageCopy(
  content: Pick<GeneratorContent, "contentBlocks">,
): string;

/** Relative file path → emitted TypeScript source. */
export declare function generateAll(content: GeneratorContent): Record<string, string>;

export declare function writeFiles(files: Record<string, string>, outDir: string): void;
