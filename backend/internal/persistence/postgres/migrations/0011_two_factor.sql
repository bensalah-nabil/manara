-- Two-step sign-in (docs/security.md): the authenticator secret, a secret being
-- set up, and the last 30-second step accepted, so a code works only once.
ALTER TABLE parents ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS totp_pending TEXT;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS totp_last_step BIGINT NOT NULL DEFAULT 0;

-- Recovery codes, hashed, each usable once.
CREATE TABLE IF NOT EXISTS recovery_codes (
    code_hash TEXT PRIMARY KEY,
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recovery_codes_parent ON recovery_codes(parent_id);

-- A sign-in waiting for its second step, hashed, for a few minutes.
CREATE TABLE IF NOT EXISTS login_challenges (
    token_hash TEXT PRIMARY KEY,
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
