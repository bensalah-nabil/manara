-- Changes that loosen a phone's rules and wait out its cooling-off delay (domain/cooling_off.go).
-- One per phone and kind. applied_at is set when the change reaches the phone; an applied release
-- stays a week, so the console may show the offline release code, then the sweep deletes it.
CREATE TABLE IF NOT EXISTS pending_changes (
    device_id      UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    kind           TEXT NOT NULL,
    policy_json    JSONB,
    release_params JSONB,
    loosens        TEXT[] NOT NULL DEFAULT '{}',
    requested_at   TIMESTAMPTZ NOT NULL,
    apply_at       TIMESTAMPTZ NOT NULL,
    applied_at     TIMESTAMPTZ,
    PRIMARY KEY (device_id, kind)
);

CREATE INDEX IF NOT EXISTS pending_changes_due ON pending_changes (apply_at) WHERE applied_at IS NULL;
