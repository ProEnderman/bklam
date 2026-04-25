-- Add optional painted-cells representation for hall zones (for non-rectangular shapes)
-- Keep x/y/w/h as bounding box for compatibility and quick operations.

ALTER TABLE hall_zones
  ADD COLUMN IF NOT EXISTS cells JSONB;


