-- What was done from each parent account, and when (security.md, item 1). Deleted with the
-- account, and after 90 days by the retention sweep. device_id has no foreign key: a removed
-- phone's entries stay, since "phone removed" is itself one of them.
CREATE TABLE IF NOT EXISTS audit_log (
    id         BIGSERIAL PRIMARY KEY,
    parent_id  UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    device_id  TEXT NOT NULL DEFAULT '',
    action     TEXT NOT NULL,
    detail     TEXT NOT NULL DEFAULT '',
    at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_parent_at ON audit_log (parent_id, at DESC);
