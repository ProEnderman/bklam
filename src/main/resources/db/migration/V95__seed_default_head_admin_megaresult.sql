-- Default HEAD_ADMIN for production (and all envs): megaresult2020@gmail.com.
-- Password hash: bcrypt via Spring BCryptPasswordEncoder (same as PasswordHashGenerator).
-- Flyway runs without tenant session; RLS would block writes on users.
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

INSERT INTO users (username, password_hash, role, restaurant_id, first_name, last_name, is_active, created_at, updated_at)
VALUES (
    'megaresult2020@gmail.com',
    '$2a$10$3ERvQw/eUXHvcgrvLLqY9.yma4Y06CkBpS6YuA86qyRmvSnz7.VuO',
    'HEAD_ADMIN',
    NULL,
    'Head',
    'Admin',
    TRUE,
    now(),
    now()
)
ON CONFLICT (username) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    restaurant_id = EXCLUDED.restaurant_id,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    is_active = TRUE,
    updated_at = now();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
