#!/bin/bash

# Скрипт для тестирования API через curl
# Убедитесь, что бэкенд запущен на http://localhost:8080

BASE_URL="http://localhost:8080/api"

echo "=== Тестирование API Restaurant Management ==="
echo ""

# 1. Ingredients
echo "1. Тестирование Ingredients..."
echo "GET /api/ingredients"
curl -s "$BASE_URL/ingredients?page=0&size=10" | jq '.' || echo "Ошибка"
echo ""

echo "POST /api/ingredients"
INGREDIENT_RESPONSE=$(curl -s -X POST "$BASE_URL/ingredients" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Тестовый ингредиент",
    "unit": "G",
    "stockQty": 1000,
    "minQty": 100
  }')
echo "$INGREDIENT_RESPONSE" | jq '.'
INGREDIENT_ID=$(echo "$INGREDIENT_RESPONSE" | jq -r '.id')
echo ""

echo "GET /api/ingredients/$INGREDIENT_ID"
curl -s "$BASE_URL/ingredients/$INGREDIENT_ID" | jq '.'
echo ""

# 2. Dishes
echo "2. Тестирование Dishes..."
echo "GET /api/dishes"
curl -s "$BASE_URL/dishes?page=0&size=10" | jq '.' || echo "Ошибка"
echo ""

echo "POST /api/dishes"
DISH_RESPONSE=$(curl -s -X POST "$BASE_URL/dishes" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Тестовое блюдо",
    "price": 250.50,
    "isActive": true
  }')
echo "$DISH_RESPONSE" | jq '.'
DISH_ID=$(echo "$DISH_RESPONSE" | jq -r '.id')
echo ""

# 3. Recipe
echo "3. Тестирование Recipe..."
echo "PUT /api/dishes/$DISH_ID/recipe"
curl -s -X PUT "$BASE_URL/dishes/$DISH_ID/recipe" \
  -H "Content-Type: application/json" \
  -d "{
    \"ingredients\": [
      {
        \"ingredientId\": $INGREDIENT_ID,
        \"qtyPerDish\": 100
      }
    ]
  }" | jq '.' || echo "Ошибка"
echo ""

echo "GET /api/dishes/$DISH_ID/recipe"
curl -s "$BASE_URL/dishes/$DISH_ID/recipe" | jq '.'
echo ""

# 4. Stock
echo "4. Тестирование Stock..."
echo "POST /api/stock/in"
curl -s -X POST "$BASE_URL/stock/in" \
  -H "Content-Type: application/json" \
  -d "{
    \"ingredientId\": $INGREDIENT_ID,
    \"qty\": 500,
    \"note\": \"Тестовое поступление\"
  }" | jq '.'
echo ""

echo "GET /api/stock/movements"
curl -s "$BASE_URL/stock/movements?page=0&size=10" | jq '.' || echo "Ошибка"
echo ""

# 5. Orders
echo "5. Тестирование Orders..."
echo "POST /api/orders"
ORDER_RESPONSE=$(curl -s -X POST "$BASE_URL/orders" \
  -H "Content-Type: application/json")
echo "$ORDER_RESPONSE" | jq '.'
ORDER_ID=$(echo "$ORDER_RESPONSE" | jq -r '.id')
echo ""

echo "POST /api/orders/$ORDER_ID/items"
curl -s -X POST "$BASE_URL/orders/$ORDER_ID/items" \
  -H "Content-Type: application/json" \
  -d "{
    \"dishId\": $DISH_ID,
    \"qty\": 2
  }" | jq '.'
echo ""

echo "GET /api/orders/$ORDER_ID"
curl -s "$BASE_URL/orders/$ORDER_ID" | jq '.'
echo ""

echo "POST /api/orders/$ORDER_ID/close"
curl -s -X POST "$BASE_URL/orders/$ORDER_ID/close" \
  -H "Content-Type: application/json" | jq '.'
echo ""

# 6. Analytics
echo "6. Тестирование Analytics..."
TODAY=$(date +%Y-%m-%d)
LAST_MONTH=$(date -d "1 month ago" +%Y-%m-%d)

echo "GET /api/analytics/revenue?from=$LAST_MONTH&to=$TODAY"
curl -s "$BASE_URL/analytics/revenue?from=$LAST_MONTH&to=$TODAY" | jq '.'
echo ""

echo "GET /api/analytics/top-dishes?from=$LAST_MONTH&to=$TODAY"
curl -s "$BASE_URL/analytics/top-dishes?from=$LAST_MONTH&to=$TODAY" | jq '.'
echo ""

echo "=== Тестирование завершено ==="

