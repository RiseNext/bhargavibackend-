import { NextResponse } from "next/server";

/**
 * STUB endpoint for the appointment / contact / newsletter forms.
 *
 * It validates the payload and logs it so the frontend can be built and
 * demoed end-to-end. It does NOT deliver mail yet — the old site used a PHP
 * `mail()` script. Wire this to the client's chosen provider (Resend, SMTP,
 * form service) before launch. See docs/CONTENT-TODO.md.
 */

type Payload = Record<string, string> & { kind?: string };

export async function POST(request: Request) {
  let body: Payload;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const kind = body.kind ?? "contact";

  if (kind === "newsletter") {
    if (!isEmail(body.email)) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 422 },
      );
    }
  } else {
    if (!body.name?.trim() || !body.phone?.trim()) {
      return NextResponse.json(
        { error: "Name and phone number are required." },
        { status: 422 },
      );
    }
    if (body.email && !isEmail(body.email)) {
      return NextResponse.json(
        { error: "That email address doesn't look right." },
        { status: 422 },
      );
    }
  }

  // TODO: replace with real delivery.
  console.info("[form:%s] %o", kind, body);

  return NextResponse.json({ ok: true, kind });
}

function isEmail(value?: string) {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
