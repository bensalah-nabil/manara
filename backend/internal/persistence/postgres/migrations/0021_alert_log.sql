-- One row per alert sent to a parent, for the admin dashboard's count (docs/admin-console.md,
-- part 2): its kind, the phone, and whether every destination accepted it. No content. Kept 90 days.
CREATE TABLE IF NOT EXISTS alert_log (
    id         BIGSERIAL PRIMARY KEY,
    kind       TEXT NOT NULL,
    device_id  TEXT NOT NULL DEFAULT '',
    delivered  BOOLEAN NOT NULL,
    at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_log_at ON alert_log (at);
