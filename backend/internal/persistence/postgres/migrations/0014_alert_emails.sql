-- The one alert email each parent may be owed (domain.AlertEmail). The text is
-- the same for every alert, so alerts that come together share one email, and
-- a send that fails stays owed and is tried again. Times only, no content.
CREATE TABLE IF NOT EXISTS alert_emails (
    parent_id    UUID PRIMARY KEY REFERENCES parents(id) ON DELETE CASCADE,
    reported_at  TIMESTAMPTZ,          -- earliest report not yet emailed; NULL when nothing is owed
    next_try_at  TIMESTAMPTZ,
    tries        INT NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS alert_emails_due ON alert_emails (next_try_at) WHERE reported_at IS NOT NULL;
