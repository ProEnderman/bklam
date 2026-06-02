-- Case-insensitive substring search uses name_search_key (see UnicodeSubstringSearch in Java).
-- PostgreSQL ILIKE with POSIX/C locale only ignores case for ASCII, not Cyrillic.

ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS name_search_key TEXT;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS name_search_key TEXT;

CREATE INDEX IF NOT EXISTS idx_ingredients_name_search_key ON ingredients (name_search_key);
CREATE INDEX IF NOT EXISTS idx_dishes_name_search_key ON dishes (name_search_key);
