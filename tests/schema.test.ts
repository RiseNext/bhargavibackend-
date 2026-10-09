/**
 * JSON-LD verification — E18, and the gating rules that stop the site
 * overstating what the clinic has.
 *
 * The load-bearing assertions:
 *  · Bowenpally gets NO `MedicalClinic` node (D-029 — it has no address or geo)
 *  · `JobPosting` is absent for all six placeholder roles (P-016)
 *  · `FAQPage` answers stay plain text
 *  · a `</script>` in content cannot break out of the tag
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeDb, seedStageS1 } from "./helpers/db";
import { closeDb } from "@/lib/db";
import { buildSiteSettings } from "@/lib/settings/site-settings";
import { listFaqs, listJobs } from "@/lib/content/public";
import {
  blogPosting,
  breadcrumbList,
  faqPage,
  jobPosting,
  medicalClinic,
  openingHours,
  organization,
  postalAddress,
  serialiseJsonLd,
  siteGraph,
  type SchemaSite,
} from "../generator/schema";

const FULL_ADDRESS = {
  line1: "H. No 1-8-539/1/a, Metro Pillar No-1115",
  line2: "Near Pista House, Chikkadpally",
  city: "Hyderabad",
  state: "Telangana",
  postalCode: "500020",
  country: "IN",
};

function site(overrides: Partial<SchemaSite> = {}): SchemaSite {
  return {
    url: "https://www.bhargavihealthworld.com",
    name: "Bhargavi Health World",
    description: "Holistic wellness care",
    email: "clinic@example.test",
    priceRange: "₹100–1000",
    logo: "/images/brand/bhargavi-mark.png",
    ogImage: "/images/brand/og-card.png",
    address: FULL_ADDRESS,
    geo: { lat: 17.4, lng: 78.49 },
    hoursStructured: [{ day: 1, windows: [{ open: "09:00", close: "21:00" }] }],
    socials: [{ href: "https://facebook.test/x" }],
    branches: [],
    founder: {
      name: "Anjana Bhargavi",
      honorific: "Mrs.",
      qualifications: "BA, B.Ed, MA, Diploma in Acupuncture",
      role: "Founder Acupuncture",
      photo: "/images/team/anjana-bhargavi.jpg",
    },
    ...overrides,
  };
}

describe("postalAddress · a partial address is not emitted", () => {
  it("emits a complete address", () => {
    const out = postalAddress(FULL_ADDRESS);
    expect(out?.addressLocality).toBe("Hyderabad");
    expect(out?.postalCode).toBe("500020");
    expect(out?.streetAddress).toContain("Metro Pillar");
  });

  it("returns undefined when line1, city or postalCode is missing", () => {
    // The same hasValue rule D-029 uses. A half address in structured data is a
    // Google Business Profile mismatch — worse than no address.
    expect(postalAddress({ ...FULL_ADDRESS, line1: null })).toBeUndefined();
    expect(postalAddress({ ...FULL_ADDRESS, city: null })).toBeUndefined();
    expect(postalAddress({ ...FULL_ADDRESS, postalCode: null })).toBeUndefined();
    expect(postalAddress(null)).toBeUndefined();
  });

  it("defaults the country rather than omitting it", () => {
    expect(postalAddress({ ...FULL_ADDRESS, country: null })?.addressCountry).toBe("IN");
  });
});

describe("openingHoursSpecification", () => {
  it("groups the seven identical days into one specification", () => {
    const hours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      windows: [{ open: "09:00", close: "21:00" }],
    }));

    const out = openingHours(hours);
    expect(out).toHaveLength(1);
    expect(out?.[0]?.dayOfWeek).toHaveLength(7);
    expect(out?.[0]?.opens).toBe("09:00");
    expect(out?.[0]?.closes).toBe("21:00");
  });

  it("emits one entry per window on a split shift", () => {
    const out = openingHours([
      {
        day: 2,
        windows: [
          { open: "10:00", close: "13:30" },
          { open: "16:00", close: "19:30" },
        ],
      },
    ]);
    expect(out).toHaveLength(2);
  });

  it("omits closed days entirely rather than emitting an empty range", () => {
    const out = openingHours([
      { day: 1, windows: [{ open: "09:00", close: "21:00" }] },
      { day: 0, windows: [] },
    ]);
    expect(out).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("Sunday");
  });

  it("returns undefined when nothing is open", () => {
    expect(openingHours([{ day: 1, windows: [] }])).toBeUndefined();
    expect(openingHours(null)).toBeUndefined();
  });
});

describe("🔴 D-029 · per-branch MedicalClinic is gated on address AND geo", () => {
  const chikkadpally = {
    name: "Chikkadpally",
    phone: "+91 98663 76203",
    address: FULL_ADDRESS,
    geo: { lat: 17.4, lng: 78.49 },
    hours: [{ day: 1, windows: [{ open: "09:00", close: "21:00" }] }],
    mapsUrl: "https://maps.app.goo.gl/x",
  };

  const bowenpally = {
    name: "Bowenpally",
    phone: "+91 70751 57013",
    // 🔴 Exactly the live situation: no address, no geo, no hours, no map.
    address: null,
    geo: null,
    hours: null,
    mapsUrl: null,
  };

  it("emits a node for the branch that has both", () => {
    const node = medicalClinic(site(), chikkadpally);
    expect(node?.["@type"]).toBe("MedicalClinic");
    expect(node?.telephone).toBe("+91 98663 76203");
    expect(node?.address).toBeDefined();
    expect(node?.geo).toBeDefined();
  });

  it("emits NOTHING for Bowenpally", () => {
    // The alternative — a node with an empty PostalAddress — mismatches the
    // Google Business Profile and is worse than no node at all.
    expect(medicalClinic(site(), bowenpally)).toBeUndefined();
  });

  it("requires BOTH — an address without coordinates is still gated", () => {
    expect(medicalClinic(site(), { ...bowenpally, address: FULL_ADDRESS })).toBeUndefined();
    expect(
      medicalClinic(site(), { ...bowenpally, geo: { lat: 1, lng: 2 } }),
    ).toBeUndefined();
  });

  it("the site graph therefore contains one clinic node, not two", () => {
    const graph = siteGraph(site({ branches: [chikkadpally, bowenpally] }));
    const nodes = graph["@graph"] as Array<Record<string, unknown>>;

    const clinics = nodes.filter((n) => n["@type"] === "MedicalClinic");
    expect(clinics).toHaveLength(1);
    expect(clinics[0]?.name).toContain("Chikkadpally");

    // And nothing in the graph mentions Bowenpally.
    expect(JSON.stringify(graph)).not.toContain("Bowenpally");
  });

  it("cross-references the organisation rather than duplicating it", () => {
    const graph = siteGraph(site({ branches: [chikkadpally] }));
    const nodes = graph["@graph"] as Array<Record<string, unknown>>;

    expect(nodes.filter((n) => n["@type"] === "Organization")).toHaveLength(1);
    const clinic = nodes.find((n) => n["@type"] === "MedicalClinic");
    expect(clinic?.parentOrganization).toEqual({
      "@id": "https://www.bhargavihealthworld.com#organization",
    });
  });

  it("includes the founder as a Person linked to the organisation", () => {
    const nodes = siteGraph(site())["@graph"] as Array<Record<string, unknown>>;
    const founder = nodes.find((n) => n["@type"] === "Person");
    expect(founder?.name).toBe("Anjana Bhargavi");
    expect(founder?.honorificPrefix).toBe("Mrs.");
  });
});

describe("organization", () => {
  it("resolves relative image paths to absolute URLs", () => {
    const out = organization(site());
    expect(out.logo).toBe(
      "https://www.bhargavihealthworld.com/images/brand/bhargavi-mark.png",
    );
  });

  it("leaves an already-absolute URL alone — media moves to Cloudinary", () => {
    const out = organization(
      site({ logo: "https://res.cloudinary.com/demo/image/upload/v1/logo.png" }),
    );
    expect(out.logo).toBe("https://res.cloudinary.com/demo/image/upload/v1/logo.png");
  });

  it("omits an empty property rather than emitting null", () => {
    const out = organization(site({ email: null, description: null, socials: [] }));
    expect(out).not.toHaveProperty("email");
    expect(out).not.toHaveProperty("description");
    expect(out).not.toHaveProperty("sameAs");
  });
});

describe("FAQPage", () => {
  it("emits a Question per FAQ", () => {
    const out = faqPage([
      { question: "Q1?", answer: "A1." },
      { question: "Q2?", answer: "A2." },
    ]);
    expect((out?.mainEntity as unknown[]).length).toBe(2);
  });

  it("drops an answer containing markup rather than emitting invalid data", () => {
    const out = faqPage([
      { question: "Good?", answer: "Plain." },
      { question: "Bad?", answer: "<b>Markup</b>" },
    ]);
    expect((out?.mainEntity as unknown[]).length).toBe(1);
    expect(JSON.stringify(out)).not.toContain("Markup");
  });

  it("returns undefined when nothing is usable", () => {
    expect(faqPage([])).toBeUndefined();
    expect(faqPage([{ question: "Q?", answer: "<p>x</p>" }])).toBeUndefined();
  });
});

describe("BreadcrumbList · S-3", () => {
  it("builds a trail with positions", () => {
    const out = breadcrumbList("https://x.test", [
      { name: "Home", href: "/" },
      { name: "Services", href: "/services" },
      { name: "Acupuncture" },
    ]);

    const list = out?.itemListElement as Array<Record<string, unknown>>;
    expect(list).toHaveLength(3);
    expect(list[0]?.position).toBe(1);
    expect(list[1]?.item).toBe("https://x.test/services");
    // The current page carries no `item`, per Google's guidance.
    expect(list[2]).not.toHaveProperty("item");
  });

  it("returns undefined for a single crumb — that is not a trail", () => {
    expect(breadcrumbList("https://x.test", [{ name: "Home", href: "/" }])).toBeUndefined();
  });
});

describe("🔴 P-016 · JobPosting is gated on isPlaceholder", () => {
  const job = {
    slug: "acupuncture-therapist",
    title: "Acupuncture Therapist",
    excerpt: "Run your own treatment room.",
    type: "Full-time",
    branch: "Chikkadpally",
    isPlaceholder: true,
    updatedAt: "2026-10-08T00:00:00.000Z",
  };

  it("emits NOTHING for a placeholder role", () => {
    // Google penalises markup for listings that are not real vacancies.
    expect(jobPosting(site(), job)).toBeUndefined();
  });

  it("emits a posting once the role is real", () => {
    const out = jobPosting(site(), { ...job, isPlaceholder: false });
    expect(out?.["@type"]).toBe("JobPosting");
    expect(out?.title).toBe("Acupuncture Therapist");
    expect(out?.employmentType).toBe("FULL_TIME");
    expect(out?.jobLocation).toBeDefined();
  });

  it("omits jobLocation when no usable address exists", () => {
    const out = jobPosting(site({ address: null }), { ...job, isPlaceholder: false });
    expect(out).not.toHaveProperty("jobLocation");
  });
});

describe("BlogPosting", () => {
  const post = {
    slug: "first",
    title: "First post",
    excerpt: "x",
    cover: null,
    author: "Anjana Bhargavi",
    publishedAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  };

  it("emits a posting for a published post", () => {
    const out = blogPosting(site(), post);
    expect(out?.["@type"]).toBe("BlogPosting");
    expect(out?.datePublished).toBe("2026-10-01T00:00:00.000Z");
    expect(out?.dateModified).toBe("2026-10-02T00:00:00.000Z");
  });

  it("emits nothing without a publication date", () => {
    expect(blogPosting(site(), { ...post, publishedAt: null })).toBeUndefined();
  });
});

describe("🔴 serialisation cannot break out of the script tag", () => {
  it("escapes a closing script tag in content", () => {
    const out = serialiseJsonLd({ name: "</script><script>alert(1)</script>" });

    // Without this, structured data becomes an injection point.
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("\\u003c");
    // And it is still valid JSON that parses back to the original string.
    expect((JSON.parse(out) as { name: string }).name).toBe(
      "</script><script>alert(1)</script>",
    );
  });

  it("escapes angle brackets and ampersands everywhere", () => {
    const out = serialiseJsonLd({ a: "<b>", c: "x & y" });
    expect(out).not.toMatch(/[<>&]/);
  });
});

// ---------------------------------------------------------------------------
// Against the real seeded data
// ---------------------------------------------------------------------------

describeDb("E18 · JSON-LD from seeded data", () => {
  beforeAll(async () => {
    await seedStageS1();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("produces exactly one clinic node from the two seeded branches", async () => {
    const settings = await buildSiteSettings();

    const graph = siteGraph({
      url: "https://www.bhargavihealthworld.com",
      name: settings.name,
      description: settings.description,
      email: settings.email,
      priceRange: settings.priceRange,
      logo: settings.logo,
      ogImage: settings.ogImage,
      address: settings.address,
      geo: settings.geo,
      hoursStructured: settings.hours,
      socials: settings.socials,
      branches: settings.branches.map((b) => ({
        name: b.name,
        phone: b.phone,
        address: b.address,
        geo: b.geo,
        hours: b.hours,
        mapsUrl: b.mapsUrl,
      })),
      founder: settings.founder,
    });

    const nodes = graph["@graph"] as Array<Record<string, unknown>>;
    const clinics = nodes.filter((n) => n["@type"] === "MedicalClinic");

    // Asserted against REAL rows: Bowenpally is seeded with all-NULL location
    // data, so the gating rule has something to gate.
    expect(clinics).toHaveLength(1);
    expect(clinics[0]?.name).toContain("Chikkadpally");
    expect(JSON.stringify(graph)).not.toContain("Bowenpally");
  });

  it("emits no JobPosting at all — all six seeded roles are placeholders", async () => {
    const jobs = await listJobs();
    expect(jobs).toHaveLength(6);

    for (const job of jobs) {
      expect(job.isPlaceholder).toBe(true);
      expect(
        jobPosting(site(), {
          slug: job.slug,
          title: job.title,
          excerpt: job.excerpt,
          type: job.type,
          branch: job.branch,
          isPlaceholder: job.isPlaceholder,
          updatedAt: job.updatedAt,
        }),
        job.slug,
      ).toBeUndefined();
    }
  });

  it("emits all six seeded FAQs — every answer is plain text", async () => {
    const faqs = await listFaqs();
    const out = faqPage(faqs);
    expect((out?.mainEntity as unknown[]).length).toBe(6);
  });
});
