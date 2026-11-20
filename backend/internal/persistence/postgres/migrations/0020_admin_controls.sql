-- Admin console actions (docs/admin-console.md, part 1, 2026-11-20).
-- A suspended parent can't sign in or use a session; their phones keep their rules.
ALTER TABLE parents ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- Settings the admin console changes at run time: which Manara version phones are offered, and
-- the notice shown at the top of every parent's console. One JSON value per key.
CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  TEXT NOT NULL DEFAULT ''
);
