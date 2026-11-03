ALTER TABLE parents ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- A plain unique index is fine here, no WHERE clause needed -- Postgres
-- already treats NULL as distinct from every other NULL in a unique
-- index, so parents created by cmd/manara-server's -seed flag
-- (docs/roadmap.md's deliberate Phase 2 dev shortcut), which have no
-- email at all, don't collide with each other or with real signups.
CREATE UNIQUE INDEX IF NOT EXISTS idx_parents_email ON parents(email);
