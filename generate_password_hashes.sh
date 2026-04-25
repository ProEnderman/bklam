#!/bin/bash
# Подсказка: хеши через запущенный backend
echo "Генерация bcrypt: запустите приложение и вызовите /api/test/hash?password=..."
echo ""
echo "Примеры:"
echo "  curl \"http://localhost:8080/api/test/hash?password=admin123\""
echo "  curl \"http://localhost:8080/api/test/hash?password=worker123\""
echo ""
echo "Миграции: V13 (test users), V15 (headadmin-primary@local.test). См. TEST_ACCOUNTS.md"
