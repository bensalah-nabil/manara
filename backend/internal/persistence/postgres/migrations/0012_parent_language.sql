-- The language the parent reads the console and emails in: en, fr or ar.
ALTER TABLE parents ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
