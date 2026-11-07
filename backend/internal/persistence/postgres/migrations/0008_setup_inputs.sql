-- Guided setup's inputs, all typed in the console so the phone can stay on
-- its Wireless debugging screen (ADR-0005). The QR name and password and the
-- pairing code are only useful on the phone's own Wi-Fi while its pairing
-- screen is open, and are cleared as soon as the phone leaves the pairing step.
ALTER TABLE device_setup ADD COLUMN IF NOT EXISTS pairing_name TEXT;
ALTER TABLE device_setup ADD COLUMN IF NOT EXISTS pairing_password TEXT;
ALTER TABLE device_setup ADD COLUMN IF NOT EXISTS pairing_code TEXT;
-- Bumped on every code the parent sends, so the phone tries each one once,
-- even when the parent sends the same digits again.
ALTER TABLE device_setup ADD COLUMN IF NOT EXISTS pairing_code_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE device_setup ADD COLUMN IF NOT EXISTS finish_requested BOOLEAN NOT NULL DEFAULT false;
