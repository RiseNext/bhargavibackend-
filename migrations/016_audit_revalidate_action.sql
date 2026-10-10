-- 016 · `revalidate` joins the audit action vocabulary (D-042)
--
-- D-042 publishes content by invalidating the frontend's cache tags instead of
-- rebuilding the site. That attempt is audited exactly like `deploy_hook` was,
-- because the failure it has to make visible is identical: content saved
-- correctly and never shown, with every status surface reporting success.
--
-- 🔴 WHY THIS MIGRATION IS NOT OPTIONAL. `audit_log_action_known` is a CHECK
-- constraint, and `audit()` runs inside `revalidateTags`, whose caller is
-- `revalidateForReasonDetached` — fire-and-forget, with a `.catch()`. Writing
-- an unlisted action would therefore raise a constraint violation that the
-- detached caller swallows: every publish would appear to work, nothing would
-- be recorded, and the dashboard would show no revalidation history at all.
-- The exact shape of the bug this whole effort exists to remove.
--
-- `action` is deliberately `text` + CHECK rather than an enum, precisely so the
-- vocabulary can grow this way (see 002_identity.sql). `view_message` was added
-- the same way after D-035.
--
-- Additive and reversible: the constraint is replaced by a strictly wider one,
-- so every existing row still satisfies it and no data is read or written.
-- Rollback is the inverse ALTER, and is safe while no `revalidate` row exists.

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_known;

ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_known CHECK (
  action IN (
    'create', 'update', 'delete', 'publish', 'unpublish', 'reorder',
    'login', 'login_failed', 'logout', 'password_change',
    'export', 'resume_download', 'view_message',
    'deploy_hook', 'revalidate', 'seed', 'purge'
  )
);
