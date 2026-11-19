-- What each admin looked at or did in the admin console (docs/admin-console.md), and when.
-- admin_id is the Microsoft Entra object id. Kept a year by the retention sweep. No foreign
-- key on target: an account that has since been deleted stays named in the entries about it.
CREATE TABLE IF NOT EXISTS admin_log (
    id          BIGSERIAL PRIMARY KEY,
    admin_id    TEXT NOT NULL,
    admin_name  TEXT NOT NULL DEFAULT '',
    action      TEXT NOT NULL,
    target      TEXT NOT NULL DEFAULT '',
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_log_at ON admin_log (at DESC);
