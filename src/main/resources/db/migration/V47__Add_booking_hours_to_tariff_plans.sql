ALTER TABLE tariff_plans ADD COLUMN booking_time_from TIME DEFAULT '00:00:00';
ALTER TABLE tariff_plans ADD COLUMN booking_time_to TIME DEFAULT '23:59:59';
