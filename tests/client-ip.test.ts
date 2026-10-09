/**
 * 🔴 PUB-03 — every rate-limit bucket is keyed on `clientIp()`.
 *
 * Get it wrong in either direction and a defence turns into a defect:
 *
 *  · too trusting → a visitor spoofs `X-Forwarded-For` and gets unlimited
 *    submissions, or evades the login limiter entirely
 *  · too clever → the function picks a hop that is the same for everybody, and
 *    every visitor on earth shares one 20-per-hour bucket, so real patient
 *    enquiries stop being recorded
 *
 * The live chain is visitor → Vercel → our /api/contact proxy → Railway. The
 * previous implementation read the RIGHT-most hop, which in that chain is the
 * Vercel egress address: constant for all visitors. These tests pin the
 * corrected arithmetic, and they pin it for BOTH possible Railway edge
 * behaviours, because which one Railway does cannot be measured from here.
 */

import { describe, expect, it } from "vitest";
import { CLIENT_IP_HEADER, clientIp } from "@/lib/http";

const VISITOR = "203.0.113.7";
const VERCEL_EGRESS = "198.51.100.42";
const ATTACKER = "192.0.2.1";

function req(headers: Record<string, string>): Request {
  return new Request("https://api.example.test/api/contact", { method: "POST", headers });
}

describe("PUB-03 · the real two-hop chain resolves to the visitor", () => {
  it("🔴 Railway APPENDS its peer: [visitor, vercel-egress] → visitor", () => {
    expect(clientIp(req({ "x-forwarded-for": `${VISITOR}, ${VERCEL_EGRESS}` }))).toBe(VISITOR);
  });

  it("🔴 Railway FORWARDS verbatim: [visitor] → visitor", () => {
    // The same default must be right under either behaviour, because which one
    // Railway does is an external, deployment-only question.
    expect(clientIp(req({ "x-forwarded-for": VISITOR }))).toBe(VISITOR);
  });

  it("does NOT return the shared egress address for the two-hop chain", () => {
    // The actual regression: this returned VERCEL_EGRESS for every visitor.
    expect(clientIp(req({ "x-forwarded-for": `${VISITOR}, ${VERCEL_EGRESS}` })))
      .not.toBe(VERCEL_EGRESS);
  });

  it("gives two different visitors two different buckets", () => {
    const a = clientIp(req({ "x-forwarded-for": `203.0.113.1, ${VERCEL_EGRESS}` }));
    const b = clientIp(req({ "x-forwarded-for": `203.0.113.2, ${VERCEL_EGRESS}` }));
    expect(a).not.toBe(b);
  });

  it("a direct hit with no proxy chain still resolves", () => {
    expect(clientIp(req({ "x-real-ip": VISITOR }))).toBe(VISITOR);
  });

  it("returns undefined when nothing identifies the caller", () => {
    expect(clientIp(req({}))).toBeUndefined();
  });
});

describe("PUB-03 · spoofing and malformed input", () => {
  it("ignores an attacker-prepended hop when our infrastructure appended one", () => {
    // The attacker controls the left of the list; Railway appends to the right.
    const ip = clientIp(
      req({ "x-forwarded-for": `${ATTACKER}, ${VISITOR}, ${VERCEL_EGRESS}` }),
    );
    expect(ip).toBe(VISITOR);
    expect(ip).not.toBe(ATTACKER);
  });

  it("tolerates whitespace and empty entries", () => {
    expect(clientIp(req({ "x-forwarded-for": `  ${VISITOR}  , , ${VERCEL_EGRESS} ` }))).toBe(
      VISITOR,
    );
  });

  it("falls back to a plausible hop rather than the shared unknown bucket", () => {
    // The selected hop is junk; returning undefined would merge this request
    // into the single "unknown" key shared by every unidentifiable caller.
    expect(clientIp(req({ "x-forwarded-for": `not-an-ip, ${VERCEL_EGRESS}` }))).toBe(
      VERCEL_EGRESS,
    );
  });

  it("returns undefined when every entry is junk", () => {
    expect(clientIp(req({ "x-forwarded-for": "nonsense, also-nonsense" }))).toBeUndefined();
  });

  it("strips an IPv4 port", () => {
    expect(clientIp(req({ "x-forwarded-for": `${VISITOR}:51234, ${VERCEL_EGRESS}` }))).toBe(
      VISITOR,
    );
  });

  it("handles an IPv6 visitor", () => {
    const v6 = "2001:db8::1";
    expect(clientIp(req({ "x-forwarded-for": `${v6}, ${VERCEL_EGRESS}` }))).toBe(v6);
  });

  it("an empty header does not throw", () => {
    expect(() => clientIp(req({ "x-forwarded-for": "" }))).not.toThrow();
  });

  it("a very long chain still selects by position, not by luck", () => {
    const chain = ["1.1.1.1", "2.2.2.2", VISITOR, VERCEL_EGRESS].join(", ");
    expect(clientIp(req({ "x-forwarded-for": chain }))).toBe(VISITOR);
  });
});

describe("PUB-03 · the explicit first-party header", () => {
  it("is IGNORED without the backend API key — it must not be browser-settable", () => {
    const ip = clientIp(
      req({ [CLIENT_IP_HEADER]: ATTACKER, "x-forwarded-for": `${VISITOR}, ${VERCEL_EGRESS}` }),
    );
    expect(ip).toBe(VISITOR);
    expect(ip).not.toBe(ATTACKER);
  });

  it("is ignored when the presented key is wrong", () => {
    const ip = clientIp(
      req({
        "x-api-key": "not-the-real-key-but-long-enough",
        [CLIENT_IP_HEADER]: ATTACKER,
        "x-forwarded-for": `${VISITOR}, ${VERCEL_EGRESS}`,
      }),
    );
    expect(ip).not.toBe(ATTACKER);
  });

  it("is honoured when the caller presents the configured key", () => {
    const key = process.env.BACKEND_API_KEY;
    if (key === undefined || key === "") return; // no key configured in this env

    expect(
      clientIp(
        req({
          "x-api-key": key,
          [CLIENT_IP_HEADER]: VISITOR,
          // Deliberately misleading chain: the explicit header wins.
          "x-forwarded-for": `${VERCEL_EGRESS}, ${VERCEL_EGRESS}`,
        }),
      ),
    ).toBe(VISITOR);
  });

  it("falls through to the chain when the declared value is junk", () => {
    const key = process.env.BACKEND_API_KEY;
    if (key === undefined || key === "") return;

    expect(
      clientIp(
        req({
          "x-api-key": key,
          [CLIENT_IP_HEADER]: "not-an-ip",
          "x-forwarded-for": `${VISITOR}, ${VERCEL_EGRESS}`,
        }),
      ),
    ).toBe(VISITOR);
  });
});

describe("PUB-03 · hop count is explicit", () => {
  it("0 hops means the right-most entry is the client", () => {
    expect(clientIp(req({ "x-forwarded-for": `${ATTACKER}, ${VISITOR}` }), 0)).toBe(VISITOR);
  });

  it("2 hops skips two appended entries", () => {
    expect(
      clientIp(req({ "x-forwarded-for": `${VISITOR}, ${VERCEL_EGRESS}, 10.0.0.1` }), 2),
    ).toBe(VISITOR);
  });

  it("a hop count larger than the chain clamps to the left-most entry", () => {
    expect(clientIp(req({ "x-forwarded-for": VISITOR }), 9)).toBe(VISITOR);
  });

  it("a negative hop count cannot read past the end", () => {
    expect(() => clientIp(req({ "x-forwarded-for": VISITOR }), -5)).not.toThrow();
  });
});
