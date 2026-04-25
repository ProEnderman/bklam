-- Переименовываем колонку email в username
ALTER TABLE users RENAME COLUMN email TO username;

-- Переименовываем индекс
DROP INDEX IF EXISTS idx_users_email;
CREATE INDEX idx_users_username ON users(username);

-- Обновляем данные: заменяем старые email-адреса на правильные email-адреса
UPDATE users SET username = 'headadmin@gmail.com' WHERE username = 'headadmin@test.com';
UPDATE users SET username = 'admin@gmail.com' WHERE username = 'admin@test.com';
UPDATE users SET username = 'worker@gmail.com' WHERE username = 'worker@test.com';

