/**
 * What an administrator is told after a successful save.
 *
 * 🔴 THE MESSAGE THIS REPLACES. Every admin form said, unconditionally:
 *
 *     "Saved. A site rebuild has been queued — changes appear in a couple of
 *      minutes."
 *
 * It said it whether or not a rebuild could be triggered at all. With
 * `VERCEL_DEPLOY_HOOK_URL` unset on the production backend, no rebuild was ever
 * queued, nothing reached the public website, and the sentence above was the
 * only feedback the administrator got — so content was edited, confirmed, and
 * silently never published. The honest distinction the system can actually
 * make (and which CLAUDE.md §8 asks for) is between:
 *
 *   · saved to the database, and a rebuild is on its way, and
 *   · saved to the database, and nothing will publish it.
 *
 * Both are reported from `X-Publishing-Configured`, which the admin API sets on
 * every response from the live value of the publishing configuration — not from
 * a build-time constant, so the message follows the deployment's real state.
 *
 * 🔴 AND THE WORDING MUST FOLLOW THE MECHANISM. The sentence above promised a
 * REBUILD, because a rebuild was the only publish path when it was written
 * (D-016). D-042/D-043 made cache-tag revalidation the primary path: it
 * publishes in seconds and needs no deployment. Two things went wrong while the
 * notice still assumed a rebuild:
 *
 *   · a backend with `REVALIDATE_SECRET` and no `VERCEL_DEPLOY_HOOK_URL`
 *     published correctly and still showed the red "NOT published" warning on
 *     every save — the original defect inverted, and just as corrosive, because
 *     an editor told their work is lost when it is live stops reading the panel;
 *   · "changes appear in a couple of minutes" sent someone away for two minutes
 *     when the change was already live, or already failed.
 *
 * So `X-Publishing-Mechanism` names which publisher is active and the wording
 * follows it. An absent header is treated as a rebuild, which is what an older
 * backend mid-rollout actually has.
 *
 * ⚠ Deliberately NOT claimed here: "live and verified". The backend triggers a
 * publish and, for the rebuild path, cannot observe whether Vercel finished it,
 * so a form promising "it is live" would be the same lie in a new place. The
 * dashboard's Publishing panel is where sync state is reported, because that is
 * the surface that can compare the last successful publish against the last
 * content change.
 */

/** What the backend says can publish. Mirrors `PublishingMechanism`. */
export type SaveMechanism = "revalidate" | "deploy-hook" | "both" | "none";

/** Reads the admin API's publishing-capability header off any response. */
export function publishingConfiguredFrom(response: Response): boolean {
  // Absent header ⇒ assume configured, so an older backend during a rollout
  // keeps the previous wording rather than crying wolf.
  const header = response.headers.get("X-Publishing-Configured");
  return header === null ? true : header === "1";
}

/** Which publisher is live, for the wording. Absent ⇒ the pre-D-042 rebuild. */
export function publishingMechanismFrom(response: Response): SaveMechanism {
  const header = response.headers.get("X-Publishing-Mechanism");
  return header === "revalidate" || header === "both" || header === "none"
    ? header
    : "deploy-hook";
}

export default function SaveNotice({
  configured,
  mechanism = "deploy-hook",
}: {
  configured: boolean;
  mechanism?: SaveMechanism;
}) {
  if (configured) {
    // The fast path publishes by invalidating the website's cache, so there is
    // no build to wait for and saying there is would be wrong.
    const fast = mechanism === "revalidate" || mechanism === "both";
    return (
      <p style={{ color: "var(--ok)", fontSize: 13 }}>
        {fast
          ? "Saved and published — the website updates within a few seconds. Reload the public page to see it."
          : "Saved. A site rebuild has been queued — changes appear in a couple of minutes."}
      </p>
    );
  }

  return (
    <p
      role="alert"
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid var(--danger)",
        borderRadius: "var(--radius)",
        color: "var(--danger)",
        fontSize: 13,
      }}
    >
      <strong>Saved to the database — but NOT published.</strong> Automatic publishing is not
      configured on this server, so this change will <strong>not</strong> appear on the public
      website. Nothing you do in the admin panel can fix this; the backend needs either
      <code> REVALIDATE_SECRET</code> (the fast path, the same value as on the website) or
      <code> VERCEL_DEPLOY_HOOK_URL</code> (a full rebuild). Your edit is safe and will go live
      once one of those is set.
    </p>
  );
}
