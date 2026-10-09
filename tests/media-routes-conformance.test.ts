/**
 * E7 / E12 / E18 — the route-level properties, checked against the source.
 *
 * These are structural rather than behavioural on purpose. The dangerous
 * failures in an upload flow are not "the happy path broke" — a failing happy
 * path is loud. They are: a rejection that forgets to destroy the asset, a
 * reference treated as an authorisation token, a private URL stored in a row, a
 * resume handed out without an audit entry. Each of those is a line that is
 * *absent*, and absence is what a conformance test can see.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

const read = (relative: string): string =>
  existsSync(resolve(ROOT, relative)) ? readFileSync(resolve(ROOT, relative), "utf8") : "";

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const MEDIA = {
  signature: "src/app/api/admin/media/signature/route.ts",
  confirm: "src/app/api/admin/media/confirm/route.ts",
  list: "src/app/api/admin/media/route.ts",
  signedUrl: "src/app/api/admin/media/[id]/signed-url/route.ts",
  del: "src/app/api/admin/media/[id]/route.ts",
};

const RESUME = {
  create: "src/app/api/applications/route.ts",
  signature: "src/app/api/applications/[reference]/upload-signature/route.ts",
  confirm: "src/app/api/applications/[reference]/confirm/route.ts",
  adminUrl: "src/app/api/admin/applications/[id]/resume-signed-url/route.ts",
  adminDelete: "src/app/api/admin/applications/[id]/resume/route.ts",
};

describe("🔴 E7 · all five approved media operations exist", () => {
  for (const [name, path] of Object.entries(MEDIA)) {
    it(`${name} is implemented`, () => {
      expect(read(path), path).not.toBe("");
    });
  }

  it("every media route requires an admin session", () => {
    for (const path of Object.values(MEDIA)) {
      expect(stripComments(read(path)), path).toMatch(/requireAdmin(Mutation)?\(/);
    }
  });

  it("every MUTATING media route requires CSRF via requireAdminMutation", () => {
    for (const path of [MEDIA.signature, MEDIA.confirm, MEDIA.del]) {
      expect(stripComments(read(path)), path).toContain("requireAdminMutation");
    }
  });

  it("🔴 the API secret is never sent to the browser", () => {
    // The signature endpoint is the only one that touches the secret, and it
    // does so inside signParams. A route that read apiSecret directly would be
    // one edit away from putting it in a response body.
    for (const path of Object.values(MEDIA)) {
      expect(stripComments(read(path)), path).not.toMatch(/apiSecret/);
    }
  });

  it("no route uses an unsigned upload preset (D-014)", () => {
    for (const path of Object.values(MEDIA)) {
      expect(stripComments(read(path)), path).not.toMatch(/upload_preset/);
    }
  });
});

describe("🔴 D-039 C-1 · a rejected upload is DESTROYED, never orphaned", () => {
  it("media confirm destroys the asset on every rejection path", () => {
    const src = stripComments(read(MEDIA.confirm));
    expect(src).toContain("destroyAsset");
    // One shared `reject()` helper, so a new check cannot forget the cleanup.
    expect(src).toMatch(/const reject = async/);
    expect(src).toMatch(/reject\("too large"/);
  });

  it("resume confirm destroys the asset on rejection and records WHY", () => {
    const src = stripComments(read(RESUME.confirm));
    expect(src).toContain("destroyAsset");
    expect(src).toContain("resume_upload_rejected_at");
    expect(src).toContain("resume_rejection_reason");
  });

  it("media confirm enforces the size limit itself", () => {
    // Cloudinary does not (D-039 C-1), so if this line goes, nothing enforces it.
    expect(stripComments(read(MEDIA.confirm))).toContain("MAX_BYTES.image");
  });

  it("neither signature route sends max_bytes", () => {
    for (const path of [MEDIA.signature, RESUME.signature]) {
      const src = stripComments(read(path));
      // Referencing MAX_BYTES to tell the browser the limit is fine; sending it
      // to Cloudinary as a parameter is not.
      expect(src, path).not.toMatch(/max_bytes\s*:/);
    }
  });
});

describe("🔴 E12 · a reference is not an authorisation token (X-33)", () => {
  it("the public resume routes are rate-limited with referenceLookup", () => {
    for (const path of [RESUME.signature, RESUME.confirm]) {
      const src = stripComments(read(path));
      expect(src, path).toContain("LIMITS.referenceLookup");
      expect(src, path).toContain("rateLimited");
    }
  });

  it("🔴 the public resume routes never require or create a session", () => {
    for (const path of [RESUME.signature, RESUME.confirm, RESUME.create]) {
      const src = stripComments(read(path));
      expect(src, path).not.toMatch(/\brequireAdmin\(/);
      expect(src, path).not.toMatch(/createSession|setSessionCookie/);
    }
  });

  it("🔴 confirm verifies the public_id from the DATABASE, not the request", () => {
    const src = stripComments(read(RESUME.confirm));
    // This is the property that makes a guessed reference useless: the caller
    // cannot choose which asset is attached to an application.
    expect(src).toContain("resume_public_id");
    expect(src).toMatch(/expectedPublicId:\s*expected/);
  });

  it("confirm refuses when no upload was authorised", () => {
    expect(stripComments(read(RESUME.confirm))).toMatch(
      /No upload has been authorised/i,
    );
  });

  it("the signature route refuses a second authorisation", () => {
    // Otherwise a guesser could replace a real applicant's pending upload.
    expect(stripComments(read(RESUME.signature))).toMatch(
      /already been authorised/i,
    );
  });

  it("neither public route returns anything about the application", () => {
    const src = stripComments(read(RESUME.signature));
    // No applicant data in the response — it would make a guessable reference
    // an enumeration oracle.
    expect(src).not.toMatch(/\bname\b\s*:/);
    expect(src).not.toMatch(/phone/);
  });

  it("confirm returns no asset handle at all", () => {
    const src = stripComments(read(RESUME.confirm));
    expect(src).toMatch(/respond\(\{\s*ok:\s*true,\s*confirmed:\s*true\s*\}/);
  });
});

describe("🔴 E12 · resume retrieval is admin-only, joined, and audited", () => {
  it("the admin resume URL route requires an admin session", () => {
    expect(stripComments(read(RESUME.adminUrl))).toMatch(/requireAdmin\(/);
  });

  it("🔴 prevents IDOR by JOINING media to the application", () => {
    const src = stripComments(read(RESUME.adminUrl));
    // Reading a media id from the request instead would let any admin-session
    // holder fetch any applicant's CV by naming its row.
    expect(src).toMatch(/JOIN media m ON m\.id = a\.resume_media_id/);
    expect(src).toMatch(/WHERE a\.id = \$1/);
  });

  it("🔴 audits as resume_download BEFORE minting the URL", () => {
    const src = stripComments(read(RESUME.adminUrl));
    expect(src).toContain('action: "resume_download"');
    expect(src.indexOf("audit(")).toBeLessThan(src.indexOf("privateUrl("));
  });

  it("uses private_download_url, not a sign_url delivery URL (D-039 C-3)", () => {
    const upload = stripComments(read("src/lib/cloudinary/upload.ts"));
    expect(upload).toContain("private_download_url");
    expect(upload).not.toMatch(/sign_url:\s*true/);
  });

  it("the signed URL is short-lived", () => {
    for (const path of [RESUME.adminUrl, MEDIA.signedUrl]) {
      expect(stripComments(read(path)), path).toMatch(/TTL_SECONDS = \d{1,3}\b/);
    }
  });

  it("deleting a resume destroys the file, not just the row", () => {
    const src = stripComments(read(RESUME.adminDelete));
    expect(src).toContain("softDeleteMedia");
    expect(src).toContain("destroyAsset");
  });

  it("🔴 a private asset never has its URL persisted", () => {
    const media = stripComments(read("src/lib/media/index.ts"));
    expect(media).toMatch(/isPublic \? \(r\.secure_url \?\? null\) : null/);
  });

  it("the bounded read cancels the stream rather than downloading the file", () => {
    const upload = stripComments(read("src/lib/cloudinary/upload.ts"));
    expect(upload).toContain('Range: "bytes=0-7"');
    expect(upload).toContain("reader.cancel()");
  });

  it("the media library still lists private assets (seeing ≠ disclosing)", () => {
    expect(stripComments(read(MEDIA.list))).toMatch(/visibility/);
  });

  it("🔴 no email is sent anywhere in the resume flow (D-038)", () => {
    for (const path of Object.values(RESUME)) {
      const src = stripComments(read(path));
      expect(src, path).not.toMatch(/sendMail|Resend|nodemailer/);
    }
  });
});

describe("🔴 E18 · BreadcrumbList is emitted once, from the rendered trail", () => {
  const FRONTEND = resolve(ROOT, "..", "frontend");
  const fe = (relative: string): string => {
    const p = resolve(FRONTEND, relative);
    return existsSync(p) ? readFileSync(p, "utf8") : "";
  };

  it("PageHero emits it from the same array it renders", () => {
    const src = fe("src/components/ui/PageHero.tsx");
    expect(src).not.toBe("");
    expect(src).toContain("breadcrumbList(");
    expect(src).toContain("application/ld+json");
    // 🔴 Derived from `breadcrumb`, so the markup cannot describe a hierarchy
    // the visitor does not see.
    expect(src).toMatch(/breadcrumb\.map\(\(crumb\) => \(\{ name: crumb\.label/);
  });

  /**
   * 🔴 ONE emitter per page — which is not the same as one emitter overall.
   *
   * The seven list pages inherit theirs from `PageHero`, so they must NOT also
   * emit it or the page would carry two conflicting graphs. The service detail
   * page renders its OWN breadcrumb nav (the trail ends in the service title,
   * so it cannot use the shared banner) and therefore MUST emit its own.
   *
   * An earlier version of this test asserted "no page emits it", which was
   * simply wrong about the service pages — they rendered a visible trail with
   * no markup at all, the exact gap E18 existed to close.
   */
  const PAGE_HERO_PAGES = [
    "about",
    "blog",
    "contact",
    "gallery",
    "services",
    "testimonials",
    "videos",
  ];

  it("🔴 the PageHero pages do not emit it themselves — no double graph", () => {
    for (const p of PAGE_HERO_PAGES) {
      expect(fe(`src/app/${p}/page.tsx`), p).not.toContain("breadcrumbList(");
    }
  });

  it("🔴 the service detail page DOES emit it — it has no PageHero", () => {
    const src = fe("src/app/services/[slug]/page.tsx");
    expect(src).toContain("breadcrumbList(");
    // Comments stripped: the comment EXPLAINING why this page does not use
    // PageHero names it, and would satisfy the check it is meant to fail.
    expect(stripComments(src)).not.toContain("PageHero");
    // Its three names must be the ones the nav renders, not invented ones.
    expect(src).toMatch(/\{ name: "Home", href: "\/" \}/);
    expect(src).toMatch(/\{ name: "Services", href: "\/services" \}/);
    expect(src).toMatch(/\{ name: service\.title \}/);
  });

  it("the URL is environment-aware", () => {
    expect(fe("src/components/ui/PageHero.tsx")).toContain("site.url");
    expect(fe("src/lib/site.ts")).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("a trail shorter than two crumbs emits nothing", () => {
    // A lone "Home" is not a hierarchy, and marking it up would be noise.
    expect(fe("src/lib/schema.ts")).toMatch(/crumbs\.length < 2.*return undefined/s);
  });

  it("every page that renders breadcrumbs does so through PageHero", () => {
    // That is what makes "only pages with breadcrumbs" true by construction.
    const pages = ["about", "blog", "contact", "gallery", "services", "testimonials", "videos"];
    for (const p of pages) {
      expect(fe(`src/app/${p}/page.tsx`), p).toContain("PageHero");
    }
  });
});
