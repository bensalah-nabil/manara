-- Rate limits and the alert throttle, shared by every server instance and kept across restarts
-- (security.md, item 5). rate_hits holds a hash of the key (an email or a client address), never
-- the key itself; both tables only hold rows younger than their window, and the hourly sweep
-- deletes anything older than a day.
CREATE TABLE IF NOT EXISTS rate_hits (
    scope    TEXT NOT NULL,
    key_hash BYTEA NOT NULL,
    at       TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_hits_key ON rate_hits (scope, key_hash, at);
CREATE INDEX IF NOT EXISTS rate_hits_at ON rate_hits (at);

-- One row per problem (device|enforcer|detail) that alerted within the throttle window.
CREATE TABLE IF NOT EXISTS alert_throttle (
    key TEXT PRIMARY KEY,
    at  TIMESTAMPTZ NOT NULL
);
