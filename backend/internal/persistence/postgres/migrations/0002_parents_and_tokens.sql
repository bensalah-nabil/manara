CREATE TABLE IF NOT EXISTS parent_sessions (
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    token_hash TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_sessions_parent ON parent_sessions(parent_id);

-- Single-use (api-spec/openapi.yaml: "one-time enrollment token") --
-- consumed_at set the moment it's redeemed, checked on every attempt.
CREATE TABLE IF NOT EXISTS enrollment_tokens (
    token_hash TEXT PRIMARY KEY,
    parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    consumed_at TIMESTAMPTZ
);
