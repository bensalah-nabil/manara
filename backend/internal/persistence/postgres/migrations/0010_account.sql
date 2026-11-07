-- Password reset links: one hour, single use, stored hashed like sessions.
CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_password_resets_parent ON password_resets(parent_id, created_at DESC);

-- When the silent-phone alert last went out; a later last_seen ends that silence.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS silence_alerted_at TIMESTAMPTZ;
