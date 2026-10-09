/**
 * Branch edit screen.
 *
 * The branches list has always rendered an "Edit" link per branch, but this
 * route did not exist, so every one of them answered 404 — a branch's address,
 * phone and opening hours were unreachable through the admin. D-005 and D-006
 * require exactly those to be editable, and Bowenpally's address, geo, maps and
 * hours are all still NULL awaiting client input.
 *
 * Loaded server-side with `loadBranches()` rather than by fetching our own API,
 * so the page renders in one round trip and needs no cookie forwarding; the
 * mutation still goes through `PATCH /api/admin/branches/{id}`, which is where
 * the authorisation, CSRF, invariants and audit live.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/guard";
import { loadBranches } from "@/lib/settings/site-settings";
import { resolveGlobals } from "@/lib/settings/resolve";
import BranchForm from "./BranchForm";

export const dynamic = "force-dynamic";

/** Kept identical to the API's `orderingWarning` — one wording, two surfaces. */
const ORDERING_WARNING =
  "sortOrder and phoneSortOrder are TWO INDEPENDENT orderings. The branch order controls the " +
  "branch list; the phone order controls which phone number appears first across the site — the " +
  "floating call button, the contact hero, and the closing call-to-action all show the first " +
  "number. Changing one does not change the other, and that is deliberate.";

export default async function BranchEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();

  const { id } = await params;

  const branches = await loadBranches();
  const branch = branches.find((b) => b.id === id);
  if (!branch) notFound();

  const { provenance } = resolveGlobals(branches);

  return (
    <>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        <Link href="/admin/branches">← Branches</Link>
      </p>

      <h1 style={{ fontSize: 20, marginTop: 0 }}>{branch.name}</h1>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0 }}>
        Location, phone numbers and opening hours. This branch is never deleted — hide it with
        <strong> Active</strong> instead.
      </p>

      <BranchForm
        row={{ ...branch, createdAt: undefined }}
        provenance={provenance}
        orderingWarning={ORDERING_WARNING}
      />
    </>
  );
}
