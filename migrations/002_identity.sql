-- M002 · identity: admin_users, admin_sessions, audit_log
--
-- Depends on: M001.  Seed: NONE committed — admin accounts are created by CLI
-- (`npm run admin:create`) so no default credential can ever ship.
-- Rollback: drop the three tables.

-- ---------------------------------------------------------------------------
-- admin_users
-- ---------------------------------------------------------------------------

CREATE TABLE admin_users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                citext NOT NULL,
  -- Argon2id (@node-rs/argon2). The column is wide text because a PHC string
  -- encodes its own parameters, so a cost change needs no migration.
  password_hash        text NOT NULL,
  name                 text NOT NULL,
  role                 admin_role NOT NULL DEFAULT 'admin',
  is_active            boolean NOT NULL DEFAULT true,
  last_login_at        timestamptz,
  failed_login_count   int NOT NULL DEFAULT 0,
  locked_until         timestamptz,
  password_changed_at  timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_users_email_not_blank CHECK (length(trim(email::text)) > 0),
  CONSTRAINT admin_users_failed_login_count_sane CHECK (failed_login_count >= 0)
);

-- citext makes this case-insensitive, which is what "no duplicate account"
-- actually means for an email address.
CREATE UNIQUE INDEX admin_users_email_key ON admin_users (email);

-- ---------------------------------------------------------------------------
-- admin_sessions
-- ---------------------------------------------------------------------------
-- Server-side sessions rather than stateless JWTs (P-011): with 1–2 users,
-- instant revocation matters more than statelessness when the protected data is
-- patient enquiries.

CREATE TABLE admin_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  -- 🔴 A hash, never the raw token. A database read must not yield a usable
  -- session cookie.
  token_hash   text NOT NULL,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  ip           inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX admin_sessions_token_hash_key ON admin_sessions (token_hash);
CREATE INDEX admin_sessions_user_expires_idx ON admin_sessions (user_id, expires_at);
CREATE INDEX admin_sessions_expires_idx ON admin_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES admin_users (id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity_type text,
  entity_id   text,
  -- Changed fields only. 🔴 Never a full `message` body, never key material,
  -- never resume contents (§36).
  diff        jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- `text` + CHECK rather than an enum because the action vocabulary grows:
  -- `view_message` was added by D-035 after this table was first designed.
  CONSTRAINT audit_log_action_known CHECK (
    action IN (
      'create', 'update', 'delete', 'publish', 'unpublish', 'reorder',
      'login', 'login_failed', 'logout', 'password_change',
      'export', 'resume_download', 'view_message',
      'deploy_hook', 'seed', 'purge'
    )
  )
);

CREATE INDEX audit_log_created_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_id, created_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity_type, entity_id);

-- Append-only enforcement.
--
-- The design requires "no UPDATE/DELETE grant". A plain REVOKE does not achieve
-- that: Neon hands us an owner role, and an owner's implicit rights cannot be
-- revoked from itself. A trigger enforces the property regardless of role, which
-- is the difference between a documented intention and an actual guarantee.
--
-- DELETE is permitted only for the retention job, which must opt in explicitly
-- by setting `bhw.allow_audit_purge` for its transaction. UPDATE is never
-- permitted — an audit trail that can be edited is not an audit trail.
CREATE FUNCTION audit_log_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit_log is append-only: UPDATE is not permitted';
  END IF;

  IF TG_OP = 'DELETE'
     AND coalesce(current_setting('bhw.allow_audit_purge', true), 'off') <> 'on' THEN
    RAISE EXCEPTION
      'audit_log is append-only: DELETE requires SET LOCAL bhw.allow_audit_purge = ''on'' (retention job only)';
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER audit_log_append_only_trg
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
