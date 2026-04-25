-- Полная бронь: одна запись блокирует все остальные мероприятия филиала на это время
ALTER TABLE activities ADD COLUMN IF NOT EXISTS full_venue_lock BOOLEAN NOT NULL DEFAULT FALSE;
