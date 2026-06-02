-- Align legacy DB rows: same bcrypt as V15 default HEAD_ADMIN, neutral username (idempotent for fresh DBs).
-- Flyway has no tenant session; temporarily disable RLS (table owner).
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
UPDATE users
SET username = 'headadmin-primary@local.test',
    updated_at = now()
WHERE role = 'HEAD_ADMIN'
  AND restaurant_id IS NULL
  AND password_hash = '$2a$10$R.OWe2fxsEWzjtaKzMBDh.iidEvNvF6mjXT4t3ZMoVHOzC/DN6fUm'
  AND username IS DISTINCT FROM 'headadmin-primary@local.test';
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
