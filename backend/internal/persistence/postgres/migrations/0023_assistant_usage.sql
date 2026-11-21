-- What the setup assistant used, per account, day (Africa/Tunis) and model: question and token
-- counts only, never a question or an answer (docs/setup-assistant.md). For watching cost in the
-- admin console. Goes with the account; older than 400 days is deleted by the retention sweep.
CREATE TABLE IF NOT EXISTS assistant_usage (
    parent_id          UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
    day                DATE NOT NULL,
    model              TEXT NOT NULL,
    questions          BIGINT NOT NULL DEFAULT 0,
    input_tokens       BIGINT NOT NULL DEFAULT 0,
    output_tokens      BIGINT NOT NULL DEFAULT 0,
    cache_read_tokens  BIGINT NOT NULL DEFAULT 0,
    cache_write_tokens BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (parent_id, day, model)
);
CREATE INDEX IF NOT EXISTS assistant_usage_day ON assistant_usage (day);
