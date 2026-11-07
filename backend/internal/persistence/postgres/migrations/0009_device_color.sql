-- The color the parent picks for a child's phone in the console (domain.DeviceColors);
-- empty until one is chosen. The child's name goes in the existing label column.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '';
