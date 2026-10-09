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
 * every response from the live value of the hook configuration — not from a
 * build-time constant, so the message follows the deployment's real state.
 *
 * ⚠ Deliberately NOT claimed here: "live and verified". The backend queues a
 * rebuild and cannot observe whether Vercel finished it, so a form promising
 * "it is live" would be the same lie in a new place. The dashboard's Publishing
 * panel is where sync state is reported, because that is the surface that can
 * compare the last successful rebuild against the last content change.
 */

/** Reads the admin API's publishing-capability header off any response. */
export function publishingConfiguredFrom(response: Response): boolean {
  // Absent header ⇒ assume configured, so an older backend during a rollout
  // keeps the previous wording rather than crying wolf.
  const header = response.headers.get("X-Publishing-Configured");
  return header === null ? true : header === "1";
}

export default function SaveNotice({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <p style={{ color: "var(--ok)", fontSize: 13 }}>
        Saved. A site rebuild has been queued — changes appear in a couple of minutes.
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
      website. Nothing you do in the admin panel can fix this; it needs
      <code> VERCEL_DEPLOY_HOOK_URL</code> set on the backend. Your edit is safe and will go live
      with the next rebuild once that is done.
    </p>
  );
}
