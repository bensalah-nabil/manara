-- Guided setup progress, one row per phone. Account lists hold names and types
-- only and are emptied SetupAccountRetention after the last update.
CREATE TABLE IF NOT EXISTS device_setup (
    device_id UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    step TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    initial_accounts JSONB NOT NULL DEFAULT '[]',
    current_accounts JSONB NOT NULL DEFAULT '[]',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
