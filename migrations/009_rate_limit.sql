-- M009 · rate_limit_hits
--
-- Depends on: M001.  Seed: none.  Rollback: drop the table.
--
-- The database fallback for rate limiting. Redis is preferred (REDIS_URL), but
-- the limiter must work without it — and on the public submission endpoint it
-- FAILS OPEN (P-015): a limiter outage must never cost the clinic a lead.

CREATE TABLE rate_limit_hits (
  id           bigserial PRIMARY KEY,
  -- e.g. "ip:1.2.3.4:contact"
  bucket_key   text NOT NULL,
  window_start timestamptz NOT NULL,
  count        int NOT NULL DEFAULT 0,

  CONSTRAINT rate_limit_count_non_negative CHECK (count >= 0)
);

-- The unique key is what makes the increment a single atomic upsert rather than
-- a read-modify-write race between concurrent requests.
CREATE UNIQUE INDEX rate_limit_bucket_window_key
  ON rate_limit_hits (bucket_key, window_start);
CREATE INDEX rate_limit_window_idx ON rate_limit_hits (window_start);
