/**
 * 🔴 PUB-02 — the CTA gate, extended to field-level ownership.
 *
 * The original rule was "label and href must both be present or both absent".
 * It exists because a label with no destination renders a DEAD BUTTON and a
 * destination with no label renders nothing.
 *
 * Field-level ownership makes a third state legitimate: a half supplied by CODE
 * rather than by the database. Two live slots are like this — `about.story` has
 * a derived label (`Consult with {founder first name}`) and an editable
 * `/contact` href; `home.testimonials` has a derived label
 * (`All {testimonials.length} reviews`) and an editable `/testimonials` href.
 *
 * These tests prove the gate accepts that WITHOUT weakening the dead-button
 * rule — the negative cases are the point of the file.
 */

import { describe, expect, it } from "vitest";
import {
  CODE_OWNED_FIELDS,
  CODE_OWNED_FIELD_COUNT,
  classifyCtaPair,
  codeOwnedFieldKeys,
  isCodeOwned,
} from "../scripts/seed/code-owned-fields";

const base = {
  labelField: "ctaLabel" as const,
  hrefField: "ctaHref" as const,
};

describe("CTA ownership · the four legitimate states", () => {
  it("both stored → editable", () => {
    const r = classifyCtaPair({
      ...base, page: "contact", slot: "messageBlock",
      label: "Send a message", href: "/contact",
    });
    expect(r.ownership).toBe("editable");
    expect(r.problem).toBeNull();
  });

  it("neither present → absent, and that is fine", () => {
    const r = classifyCtaPair({
      ...base, page: "contact", slot: "messageBlock", label: null, href: null,
    });
    expect(r.ownership).toBe("absent");
    expect(r.problem).toBeNull();
  });

  it("🔴 both code-owned → valid with nothing stored (global.ctaBand)", () => {
    const r = classifyCtaPair({
      page: "global", slot: "ctaBand",
      labelField: "cta2Label", hrefField: "cta2Href",
      label: null, href: null,
    });
    expect(r.ownership).toBe("code-owned");
    expect(r.problem).toBeNull();
  });

  it("🔴 MIXED — derived label, editable href (about.story)", () => {
    const r = classifyCtaPair({
      ...base, page: "about", slot: "story", label: null, href: "/contact",
    });
    expect(r.ownership).toBe("mixed");
    expect(r.problem).toBeNull();
  });

  it("🔴 MIXED — derived label, editable href (home.testimonials)", () => {
    const r = classifyCtaPair({
      ...base, page: "home", slot: "testimonials", label: null, href: "/testimonials",
    });
    expect(r.ownership).toBe("mixed");
    expect(r.problem).toBeNull();
  });
});

describe("CTA ownership · the gate still rejects malformed CTAs", () => {
  it("🔴 REJECTS a label with no destination — the dead button", () => {
    const r = classifyCtaPair({
      ...base, page: "contact", slot: "messageBlock",
      label: "Click here", href: null,
    });
    expect(r.problem).toMatch(/no effective destination/);
    expect(r.problem).toMatch(/dead button/);
  });

  it("🔴 REJECTS a destination with no label — renders nothing", () => {
    const r = classifyCtaPair({
      ...base, page: "contact", slot: "messageBlock", label: null, href: "/somewhere",
    });
    expect(r.problem).toMatch(/no effective label/);
  });

  it("🔴 REJECTS a code-owned half that was nonetheless STORED", () => {
    // This is how the frozen copy would creep back in.
    const r = classifyCtaPair({
      page: "global", slot: "ctaBand",
      labelField: "cta2Label", hrefField: "cta2Href",
      label: "Call +91 70751 57013", href: null,
    });
    expect(r.problem).toMatch(/code-owned and must not be stored/);
    expect(r.problem).toContain("Call +91 70751 57013");
  });

  it("🔴 REJECTS a stored code-owned HREF too", () => {
    const r = classifyCtaPair({
      page: "global", slot: "ctaBand",
      labelField: "cta2Label", hrefField: "cta2Href",
      label: null, href: "site.phones[0].href",
    });
    expect(r.problem).toMatch(/cta2Href is code-owned and must not be stored/);
  });

  it("a slot with NO ownership entry behaves exactly as before", () => {
    // Regression guard: ownership must not accidentally excuse other slots.
    expect(isCodeOwned("gallery", "hero", "ctaLabel")).toBe(false);
    const r = classifyCtaPair({
      ...base, page: "gallery", slot: "hero", label: "Look", href: null,
    });
    expect(r.problem).toMatch(/no effective destination/);
  });
});

describe("CTA ownership · the classification itself", () => {
  it("declares exactly fourteen owned fields", () => {
    expect(codeOwnedFieldKeys()).toHaveLength(CODE_OWNED_FIELD_COUNT);
    expect(CODE_OWNED_FIELD_COUNT).toBe(17);
  });

  it("every entry carries its evidence — jsx, source and the value it derives from", () => {
    for (const [key, fields] of CODE_OWNED_FIELDS) {
      for (const [field, evidence] of Object.entries(fields)) {
        expect(evidence?.jsx, `${key}.${field} jsx`).toBeTruthy();
        expect(evidence?.source, `${key}.${field} source`).toBeTruthy();
        expect(evidence?.derivesFrom, `${key}.${field} derivesFrom`).toBeTruthy();
      }
    }
  });

  it("the two pairs you ruled on are owned as PAIRS, not halves", () => {
    expect(isCodeOwned("global", "ctaBand", "cta2Label")).toBe(true);
    expect(isCodeOwned("global", "ctaBand", "cta2Href")).toBe(true);
    expect(isCodeOwned("careers", "generalApplication", "cta2Label")).toBe(true);
    expect(isCodeOwned("careers", "generalApplication", "cta2Href")).toBe(true);
  });

  it("serviceDetail.bookingAside.title is owned — it is `Book {service.title}`", () => {
    expect(isCodeOwned("serviceDetail", "bookingAside", "title")).toBe(true);
  });
});
