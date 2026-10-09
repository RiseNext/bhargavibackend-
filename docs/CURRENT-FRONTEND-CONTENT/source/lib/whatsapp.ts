import { site } from "./site";

type Row = { label: string; value?: string | null };

/**
 * Builds a wa.me deep link carrying the form contents as a prefilled message.
 *
 * This is a handover, not a send: the visitor's own WhatsApp opens with the
 * message composed and they press send. That is what makes it reliable with
 * no mail server — the request arrives from their real number, so the clinic
 * can reply straight back in the same thread.
 *
 * `phone` picks which clinic number receives it (defaults to the main
 * WhatsApp line) — the appointment form passes the chosen branch's number.
 */
export function whatsappUrl(
  heading: string,
  rows: Row[] = [],
  phone: string = site.whatsapp.number,
) {
  const body = rows
    .filter((r) => r.value != null && String(r.value).trim() !== "")
    .map((r) => `*${r.label}:* ${String(r.value).trim()}`);

  // No rows (a plain "ask about X" tap) should not trail a blank line.
  const text = body.length
    ? [`*${heading}*`, "", ...body].join("\n")
    : `*${heading}*`;

  // wa.me wants bare digits — no +, spaces or dashes.
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** `datetime-local` gives "2026-09-25T15:30" — unreadable in a message. */
export function formatDateTime(value?: string) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
