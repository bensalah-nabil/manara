-- The phone's own checklist before guided setup (Wi-Fi, Developer options...), latest only.
CREATE TABLE IF NOT EXISTS setup_readiness (
    device_id UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    readiness JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
