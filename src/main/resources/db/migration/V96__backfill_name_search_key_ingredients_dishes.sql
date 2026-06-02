-- Excel/stock import uses name_search_key with LIKE; NULL keys excluded rows from that predicate.
-- Backfill with DB lower(trim); Hibernate @PrePersist/@PreUpdate keeps keys aligned on future saves.
UPDATE ingredients SET name_search_key = lower(trim(name)) WHERE name_search_key IS NULL;

UPDATE dishes SET name_search_key = lower(trim(name)) WHERE name_search_key IS NULL;
