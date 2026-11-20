-- Parents asking to join the "Familles pionnières" beta from the public beta page
-- (domain.BetaSignup). Only what booking the setup call needs; deleted after 180 days
-- (domain.BetaSignupRetention) by the retention sweep, and listed on the privacy page.
CREATE TABLE IF NOT EXISTS beta_signups (
    id            TEXT PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL,
    first_name    TEXT NOT NULL,
    whatsapp      TEXT NOT NULL,
    place         TEXT NOT NULL,
    call_language TEXT NOT NULL,
    brand         TEXT NOT NULL,
    model         TEXT NOT NULL DEFAULT '',
    child_age     TEXT NOT NULL,
    worries       TEXT[] NOT NULL DEFAULT '{}',
    slots         TEXT[] NOT NULL DEFAULT '{}',
    page_language TEXT NOT NULL DEFAULT 'fr',
    own_child     BOOLEAN NOT NULL,
    status        TEXT NOT NULL DEFAULT 'new',
    updated_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS beta_signups_created ON beta_signups (created_at);
