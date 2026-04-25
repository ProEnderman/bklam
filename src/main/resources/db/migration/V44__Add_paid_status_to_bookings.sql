-- Добавляем колонку paid_at в таблицу bookings для статуса PAID
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

-- Обновляем индекс для включения статуса PAID в overlap check
DROP INDEX IF EXISTS idx_bookings_overlap_check;
CREATE INDEX idx_bookings_overlap_check ON bookings(branch_id, activity_id, resource_id, status, start_at, end_at)
WHERE status IN ('DRAFT', 'CONFIRMED', 'PAID');
