/**
 * Deterministic seed identifiers.
 *
 * Seeds must be idempotent (DB design §8, rule 5). Several seeded tables have no
 * natural unique key — `testimonials`, `gallery_images`, `content_list_items`,
 * `content_block_items` — so a re-run would duplicate them.
 *
 * Deriving the primary key from a stable natural key solves that uniformly:
 * every stage can `ON CONFLICT (id) DO UPDATE`, and a later stage can find the
 * row it needs to backfill by recomputing the same id rather than querying by
 * content. The snapshot is immutable, so these keys are stable by construction.
 *
 * RFC 4122 version 5 (SHA-1, name-based) under a fixed project namespace.
 */

import { createHash } from "node:crypto";

/** Fixed, arbitrary, and recorded here so it is never regenerated. */
const NAMESPACE = "6f9b1d2a-5c3e-4f8a-9b7c-2e1d4a6b8c05";

function namespaceBytes(): Buffer {
  return Buffer.from(NAMESPACE.replace(/-/g, ""), "hex");
}

/** UUIDv5 of `name` within the project namespace. */
export function seedId(name: string): string {
  const hash = createHash("sha1")
    .update(namespaceBytes())
    .update(Buffer.from(name, "utf8"))
    .digest();

  const bytes = Buffer.from(hash.subarray(0, 16));

  // Version 5 in the high nibble of byte 6; RFC 4122 variant in byte 8.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** Namespaced helpers, so a service and a job with the same slug never collide. */
export const branchId = (slug: string) => seedId(`branch:${slug}`);
export const serviceId = (slug: string) => seedId(`service:${slug}`);
export const testimonialId = (sortOrder: number) => seedId(`testimonial:${String(sortOrder)}`);
export const videoId = (youtubeId: string) => seedId(`video:${youtubeId}`);
export const galleryId = (sortOrder: number) => seedId(`gallery:${String(sortOrder)}`);
export const faqId = (sortOrder: number) => seedId(`faq:${String(sortOrder)}`);
export const jobId = (slug: string) => seedId(`job:${slug}`);
export const socialId = (platform: string) => seedId(`social:${platform}`);
export const statId = (label: string) => seedId(`stat:${label}`);
export const contentListId = (collection: string, sortOrder: number) =>
  seedId(`content_list:${collection}:${String(sortOrder)}`);
export const pageMetaId = (page: string) => seedId(`page_meta:${page}`);
export const contentBlockId = (page: string, slot: string) =>
  seedId(`content_block:${page}.${slot}`);
export const contentBlockItemId = (page: string, slot: string, group: string, sortOrder: number) =>
  seedId(`content_block_item:${page}.${slot}.${group}:${String(sortOrder)}`);
/** Keyed on the source asset path so S2 can match an upload back to its row. */
export const mediaId = (assetPath: string) => seedId(`media:${assetPath}`);
