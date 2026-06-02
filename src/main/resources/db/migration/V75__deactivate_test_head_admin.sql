-- Deactivate the V13 test HEAD_ADMIN (headadmin@gmail.com) so the primary seed user from V15 is the active duplicate HEAD_ADMIN for dev.
-- Flyway has no tenant session; temporarily disable RLS (table owner).
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
UPDATE users SET is_active = false WHERE username = 'headadmin@gmail.com' AND role = 'HEAD_ADMIN';
ALTER TABLE users ENABLE ROW LEVEL SECURITY;