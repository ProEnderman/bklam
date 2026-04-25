-- Создаем тестовый ресторан
INSERT INTO restaurants (name, created_at, updated_at) 
VALUES ('Test Restaurant', now(), now())
ON CONFLICT DO NOTHING;

-- Создаем тестового HEAD_ADMIN (пароль: headadmin123)
-- Используем email, так как V14 переименует его в username позже
-- ВАЖНО: Замените хеш ниже на правильный, сгенерированный через:
-- GET http://localhost:8080/api/test/hash?password=headadmin123
INSERT INTO users (email, password_hash, role, restaurant_id, first_name, last_name, is_active, created_at, updated_at)
VALUES (
    'headadmin@gmail.com',
    '$2a$10$ZU65cjQQJ3DVvMkxP//c9usnzkBombPqud6tk2tk5mb/CTjwHk646', -- bcrypt hash для "headadmin123"
    'HEAD_ADMIN',
    NULL,
    'Head',
    'Admin',
    TRUE,
    now(),
    now()
)
ON CONFLICT DO NOTHING;

-- Создаем тестового ADMIN (пароль: admin123)
-- ВАЖНО: Замените хеш ниже на правильный, сгенерированный через:
-- GET http://localhost:8080/api/test/hash?password=admin123
INSERT INTO users (email, password_hash, role, restaurant_id, first_name, last_name, is_active, created_at, updated_at)
SELECT 
    'admin@gmail.com',
    '$2a$10$os8XhRmsacrrBeCWn6BUSOGIewUftJryycrS.ILplujJ8zCRqE2gG', -- bcrypt hash для "admin123"
    'ADMIN',
    r.id,
    'Restaurant',
    'Admin',
    TRUE,
    now(),
    now()
FROM restaurants r
WHERE r.name = 'Test Restaurant'
ON CONFLICT DO NOTHING;

-- Создаем тестового REGULAR_WORKER (пароль: worker123)
-- ВАЖНО: Замените хеш ниже на правильный, сгенерированный через:
-- GET http://localhost:8080/api/test/hash?password=worker123
INSERT INTO users (email, password_hash, role, restaurant_id, first_name, last_name, is_active, created_at, updated_at)
SELECT 
    'worker@gmail.com',
    '$2a$10$kpNSkRGKAEbHimYZBLOoC.6Ya2sdEKpecfNKdb96NH1Dp80y9O1Uy', -- bcrypt hash для "worker123"
    'REGULAR_WORKER',
    r.id,
    'Regular',
    'Worker',
    TRUE,
    now(),
    now()
FROM restaurants r
WHERE r.name = 'Test Restaurant'
ON CONFLICT DO NOTHING;

