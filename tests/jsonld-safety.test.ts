/**
 * 🔴 GEN-SEO-01 / GEN-SEO-02 — structured data must be safe and well-formed.
 *
 * Two separate defects, both on every page of the site:
 *
 *  · GEN-SEO-01 — `app/layout.tsx` and `app/about/page.tsx` built the image URL
 *    as `` `${site.url}${site.founder.photo}` ``. Correct while the photo was a
 *    repo-relative path; wrong once the Cloudinary migration (D-018) made it an
 *    absolute URL, producing `https://site.com` prefixed onto
 *    `https://res.cloudinary.com/...`.
 *
 *  · GEN-SEO-02 — four of the six JSON-LD blocks used bare `JSON.stringify`
 *    rather than `serialiseJsonLd`. Admin-editable text therefore reached a
 *    `<script>` element unescaped, so a `</script>` inside any field — an FAQ
 *    answer, a service excerpt, a testimonial quote — would close the tag early
 *    and turn structured data into script injection.
 *
 * The frontend is the consumer, so these import the FRONTEND modules directly.
 */

import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  faqPage,
  organization,
  person,
  serialiseJsonLd,
} from "../../frontend/src/lib/schema";

// ---------------------------------------------------------------------------
// GEN-SEO-01 — absolute URL construction
// ---------------------------------------------------------------------------

describe("GEN-SEO-01 · absoluteUrl is idempotent", () => {
  const SITE = "https://www.bhargavihealthworld.com";

  it("joins a root-relative path", () => {
    expect(absoluteUrl(SITE, "/images/founder.jpg")).toBe(`${SITE}/images/founder.jpg`);
  });

  it("joins a path with no leading slash", () => {
    expect(absoluteUrl(SITE, "images/founder.jpg")).toBe(`${SITE}/images/founder.jpg`);
  });

  it("🔴 leaves an already-absolute Cloudinary URL UNCHANGED", () => {
    const cloudinary =
      "https://res.cloudinary.com/demo/image/upload/v1/bhw/dev/brand/founder.jpg";
    expect(absoluteUrl(SITE, cloudinary)).toBe(cloudinary);
  });

  it("leaves an absolute http URL unchanged", () => {
    expect(absoluteUrl(SITE, "http://example.com/a.png")).toBe("http://example.com/a.png");
  });

  it("never produces a doubled scheme", () => {
    const out = absoluteUrl(SITE, "https://res.cloudinary.com/x.png") ?? "";
    expect(out.match(/https?:\/\//g)).toHaveLength(1);
  });

  it("does not double the separator when the site URL has a trailing slash", () => {
    expect(absoluteUrl(`${SITE}/`, "/images/a.png")).toBe(`${SITE}/images/a.png`);
  });

  it("returns null for a missing image rather than a bare site URL", () => {
    // A bare site URL in an `image` field is worse than omitting it: Google
    // fetches it and gets an HTML page.
    expect(absoluteUrl(SITE, null)).toBeNull();
    expect(absoluteUrl(SITE, "")).toBeNull();
  });

  it("emits a single well-formed image URL for the founder Person node", () => {
    const node = person({
      url: SITE,
      name: "Bhargavi Health World",
      founder: {
        name: "Anjana Bhargavi",
        honorific: "Mrs.",
        role: "Founder",
        qualifications: "ND",
        photo: "https://res.cloudinary.com/demo/image/upload/founder.jpg",
      },
    } as never);

    expect(node?.image).toBe("https://res.cloudinary.com/demo/image/upload/founder.jpg");
    expect(String(node?.image).match(/https?:\/\//g)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GEN-SEO-02 — escaping
// ---------------------------------------------------------------------------

describe("GEN-SEO-02 · serialiseJsonLd survives adversarial admin content", () => {
  /**
   * Every one of these is text an administrator can legitimately type into an
   * FAQ answer, a service excerpt or a testimonial quote.
   */
  const attacks: Array<{ name: string; payload: string }> = [
    { name: "a closing script tag", payload: "</script><script>alert(1)</script>" },
    { name: "an uppercase closing tag", payload: "</SCRIPT><SCRIPT>alert(1)</SCRIPT>" },
    { name: "a spaced closing tag", payload: "</script >" },
    { name: "an HTML comment opener", payload: "<!--<script>" },
    { name: "an ampersand entity", payload: "Tom &amp; Jerry &lt;b&gt;" },
    { name: "a bare ampersand", payload: "acupuncture & acupressure" },
    { name: "double quotes", payload: 'she said "hello"' },
    { name: "apostrophes", payload: "the clinic's hours" },
    { name: "backslashes", payload: "C:\\path\\to\\file" },
    { name: "a newline and tab", payload: "line one\nline two\tindented" },
    { name: "a lone carriage return", payload: "line one\rline two" },
    { name: "unicode line separator", payload: "before\u2028after\u2029end" },
    { name: "a null byte", payload: "null\u0000byte" },
    { name: "Telugu text", payload: "బార్గవి హెల్త్ వर్ల్డ్" },
    { name: "a rupee sign", payload: "₹100 onwards" },
  ];

  for (const { name, payload } of attacks) {
    it(`escapes ${name}`, () => {
      const out = serialiseJsonLd({ "@type": "FAQPage", text: payload });

      // 1. The tag cannot be closed early — this is the actual vulnerability.
      expect(out.toLowerCase()).not.toContain("</script");
      expect(out).not.toContain("<");
      expect(out).not.toContain(">");
      expect(out).not.toContain("&");

      // 2. It is still valid JSON, and the value round-trips EXACTLY. Escaping
      //    that corrupted the content would trade an injection for silently
      //    wrong structured data.
      const parsed = JSON.parse(out) as { text: string };
      expect(parsed.text).toBe(payload);
    });
  }

  it("🔴 an FAQPage built from adversarial answers cannot close its own script tag", () => {
    const node = faqPage([
      { question: "Can I walk in?</script><script>alert(1)</script>", answer: "Yes & always" },
      { question: 'What are your "timings"?', answer: "9 AM – 9 PM <b>daily</b>" },
    ] as never);

    const out = serialiseJsonLd(node);
    expect(out.toLowerCase()).not.toContain("</script");
    expect(() => JSON.parse(out) as unknown).not.toThrow();
  });

  it("an Organization node with an injected name stays inert", () => {
    const node = organization({
      url: "https://example.com",
      name: "</script><img onerror=alert(1)>",
      description: "x",
      logo: null,
      ogImage: null,
      socials: [],
      founder: { name: null, honorific: null, role: null, qualifications: null, photo: null },
    } as never);

    const out = serialiseJsonLd(node);
    expect(out.toLowerCase()).not.toContain("</script");
    expect(out).not.toContain("<img");
  });

  it("leaves ordinary content readable — escaping is not mangling", () => {
    const out = serialiseJsonLd({ name: "Bhargavi Health World", city: "Hyderabad" });
    expect(JSON.parse(out)).toEqual({ name: "Bhargavi Health World", city: "Hyderabad" });
  });
});
