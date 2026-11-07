-- Release codes (domain/release.go): the secret both the server and the phone
-- hold, from which a parent's one-time release code is computed. Kept in
-- plain form because the server must compute codes from it; a leaked secret
-- alone frees nothing without the phone in hand. NULL for a phone enrolled
-- before release codes existed, until it is created on first use.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS release_secret TEXT;
-- Set once the phone reports holding the secret; until then a code typed on
-- the phone cannot work, and the console says so.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS release_secret_confirmed BOOLEAN NOT NULL DEFAULT false;
