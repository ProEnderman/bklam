-- Add vertices column to hall_zones for storing polygon vertices
ALTER TABLE hall_zones ADD COLUMN IF NOT EXISTS vertices JSONB;
