-- The weekly email (roadmap P8, domain.WeeklyEmail): on Monday morning, "last
-- week's report is ready". On by default; it only goes to a parent with a
-- phone that reported daily usage during the week. Times only, no content.
ALTER TABLE parents ADD COLUMN IF NOT EXISTS weekly_email BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS weekly_emails (
    parent_id    UUID PRIMARY KEY REFERENCES parents(id) ON DELETE CASCADE,
    settled_week TIMESTAMPTZ,          -- start of the last week done with (sent, or nothing to send)
    trying_week  TIMESTAMPTZ,          -- the week tries and next_try_at count for
    next_try_at  TIMESTAMPTZ,
    tries        INT NOT NULL DEFAULT 0
);
