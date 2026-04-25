-- Join table for many-to-many: reservation <-> hall_tables
CREATE TABLE reservation_tables (
    reservation_id BIGINT NOT NULL REFERENCES table_reservations(id) ON DELETE CASCADE,
    table_id       BIGINT NOT NULL REFERENCES hall_tables(id),
    PRIMARY KEY (reservation_id, table_id)
);

CREATE INDEX idx_reservation_tables_reservation ON reservation_tables(reservation_id);
CREATE INDEX idx_reservation_tables_table      ON reservation_tables(table_id);

-- Migrate existing single-table data into the new join table
INSERT INTO reservation_tables (reservation_id, table_id)
SELECT id, table_id FROM table_reservations WHERE table_id IS NOT NULL;

-- Drop old single-table column and its indexes
DROP INDEX IF EXISTS idx_table_reservations_table_id;
DROP INDEX IF EXISTS idx_table_reservations_overlap_check;
ALTER TABLE table_reservations DROP COLUMN table_id;
