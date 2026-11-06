-- What the parent confirmed before getting this code (legal-and-ethics.md).
-- NULL on tokens from before this existed and on the -seed dev shortcut.
ALTER TABLE enrollment_tokens ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ;
ALTER TABLE enrollment_tokens ADD COLUMN IF NOT EXISTS attestation_version TEXT;
ALTER TABLE enrollment_tokens ADD COLUMN IF NOT EXISTS phone_brand TEXT;
