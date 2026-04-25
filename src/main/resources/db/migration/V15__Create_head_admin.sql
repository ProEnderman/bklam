-- Default HEAD_ADMIN for local/CI (reserved domain local.test). Dev password matches other test seeds; see TEST_ACCOUNTS.md.
-- Optional real mailbox: SEED_PERSONAL_HEAD_ADMIN_* in .env — PersonalHeadAdminSeeder.
INSERT INTO users (username, password_hash, role, restaurant_id, first_name, last_name, is_active, created_at, updated_at)
VALUES (
    'headadmin-primary@local.test',
    '$2a$10$R.OWe2fxsEWzjtaKzMBDh.iidEvNvF6mjXT4t3ZMoVHOzC/DN6fUm',
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
    updated_at = now();


