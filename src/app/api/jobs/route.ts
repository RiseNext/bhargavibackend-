/**
 * GET /api/jobs — public operation 13.
 *
 * `branch` is the DERIVED display string the frontend already consumes
 * (D-015): "Either branch" when the flag is set, otherwise the branch name.
 * So no frontend change is required.
 */

import { collectionRoute } from "@/lib/public-read";
import { latestContentChange, listJobs } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export const GET = collectionRoute("GET /api/jobs", "jobs", async () => ({
  items: await listJobs(),
  updatedAt: await latestContentChange(),
}));
