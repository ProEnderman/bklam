-- Добавляем версионирование карты для оптимистичной блокировки
ALTER TABLE hall_maps
ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_hall_maps_version ON hall_maps(version);

-- Устанавливаем начальную версию для существующих карт
UPDATE hall_maps SET version = 1 WHERE version = 0;

