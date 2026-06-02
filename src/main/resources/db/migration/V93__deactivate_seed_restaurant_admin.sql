-- V13 seed ADMIN for Test Restaurant: keep row for FK/history, but hide from active admin lists (use platform "Add admin" for real demos).
-- Flyway has no tenant session; temporarily disable RLS (table owner).
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
UPDATE users SET is_active = false
WHERE username = 'admin@gmail.com' AND role = 'ADMIN';
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
