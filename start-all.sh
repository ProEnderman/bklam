#!/bin/bash
# ─────────────────────────────────────────────
#  BKLAM — запуск всех сервисов одной командой
# ─────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Подгрузка .env (секреты для Java и Python, в т.ч. FORECAST_INTERNAL_JWT_SECRET_B64)
if [ -f "$ROOT/.env" ]; then
  set -a
  source "$ROOT/.env"
  set +a
fi
# PORT=8080 из .env нужен только бэкенду; убираем из окружения, чтобы Vite/NestJS не заняли 8080
unset PORT

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

cleanup() {
  echo ""
  echo -e "${CYAN}Останавливаю все сервисы...${NC}"
  kill $PID_BACKEND $PID_FORECAST $PID_TELEGRAM $PID_FRONTEND 2>/dev/null
  wait $PID_BACKEND $PID_FORECAST $PID_TELEGRAM $PID_FRONTEND 2>/dev/null
  echo -e "${GREEN}Все сервисы остановлены.${NC}"
}
trap cleanup EXIT INT TERM

echo -e "${BOLD}${CYAN}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║          B K L A M   Start           ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── Освобождаем порты (все PIDs по каждому порту, затем ждём) ─────
for port in 8080 8090 3001 3000; do
  pids=$(lsof -ti:$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo -e "  ${CYAN}Порт $port занят — завершаю процессы: $pids${NC}"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done
# Ждём освобождения портов (макс. 15 сек)
for port in 8080 8090 3001 3000; do
  n=0
  while [ $n -lt 15 ] && lsof -ti:$port >/dev/null 2>&1; do
    sleep 1
    n=$((n + 1))
  done
  if lsof -ti:$port >/dev/null 2>&1; then
    echo -e "  ${RED}Порт $port всё ещё занят. Закройте процесс вручную: lsof -ti:$port | xargs kill -9${NC}"
    exit 1
  fi
done

# ── 1. Java Backend (Spring Boot) ─────────────
# Упорно освобождаем 8080 (иногда процесс не падает с первого раза)
for _ in 1 2 3 4 5; do
  pids=$(lsof -ti:8080 2>/dev/null || true)
  [ -z "$pids" ] && break
  echo -e "  ${CYAN}Освобождаю 8080 (PID: $pids)${NC}"
  echo "$pids" | xargs kill -9 2>/dev/null || true
  sleep 2
done
if lsof -ti:8080 >/dev/null 2>&1; then
  echo -e "  ${RED}Не удалось освободить 8080. Выполните: lsof -ti:8080 | xargs kill -9${NC}"
  exit 1
fi
echo -e "${CYAN}[1/4]${NC} Запуск Java Backend (порт 8080, profile dev → DEV_DB_URL + .env через Gradle)..."
cd "$ROOT"
# Совпадает с ./gradlew devBootRun README: профиль dev, merge .env, ensureDevDatabase при необходимости
SPRING_PROFILES_ACTIVE=dev PORT=8080 ./gradlew bootRun > logs/backend.log 2>&1 &
PID_BACKEND=$!
echo -e "       PID: $PID_BACKEND  |  лог: logs/backend.log"
# Даём бэкенду время первым занять 8080 (Spring Boot поднимается 10–20 с), затем стартуем Node-сервисы
echo -e "  ${CYAN}Ожидаю старт бэкенда (20 с), затем запущу остальные сервисы...${NC}"
sleep 20

# ── 2. Python Forecasting Service ─────────────
echo -e "${CYAN}[2/4]${NC} Запуск Forecast Service (порт 8090)..."
cd "$ROOT/forecasting"
if [ ! -d "venv" ]; then
  echo "       Создаю виртуальное окружение..."
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt > /dev/null 2>&1
else
  source venv/bin/activate
fi
python api.py > "$ROOT/logs/forecast.log" 2>&1 &
PID_FORECAST=$!
echo -e "       PID: $PID_FORECAST  |  лог: logs/forecast.log"

# ── 3. Telegram Payment Service (NestJS) ──────
echo -e "${CYAN}[3/4]${NC} Запуск Telegram Payment Service (порт 3001)..."
cd "$ROOT/telegram-payment-service"
if [ ! -d "node_modules" ]; then
  echo "       Устанавливаю зависимости..."
  npm install > /dev/null 2>&1
fi
# Явно PORT=3001: иначе из .env подтягивается PORT=8080 и NestJS занимает порт бэкенда
PORT=3001 npm run start:dev > "$ROOT/logs/telegram.log" 2>&1 &
PID_TELEGRAM=$!
echo -e "       PID: $PID_TELEGRAM  |  лог: logs/telegram.log"

# ── 4. Frontend (Vite dev server) ─────────────
echo -e "${CYAN}[4/4]${NC} Запуск Frontend (порт 3000)..."
cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
  echo "       Устанавливаю зависимости..."
  npm install > /dev/null 2>&1
fi
# Явно PORT=3000, иначе из .env подтягивается PORT=8080 и Vite занимает порт бэкенда
PORT=3000 npm run dev > "$ROOT/logs/frontend.log" 2>&1 &
PID_FRONTEND=$!
echo -e "       PID: $PID_FRONTEND  |  лог: logs/frontend.log"

# ── Ожидание готовности ───────────────────────
echo ""

wait_for() {
  local name="$1" url="$2" pid="$3" max="$4" log="$5"
  local elapsed=0
  printf "  ⏳ %s ..." "$name"
  while [ $elapsed -lt $max ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo -e " ${RED}ОШИБКА (процесс завершился)${NC}"
      return 0
    fi
    if curl -sf --max-time 2 "$url" > /dev/null 2>&1; then
      echo -e " ${GREEN}✔ готов (${elapsed}с)${NC}"
      return 0
    fi
    # Fallback: check log for "started" pattern
    if [ -n "$log" ] && [ -f "$log" ]; then
      if grep -qi "started\|running on port\|application startup complete" "$log" 2>/dev/null; then
        echo -e " ${GREEN}✔ готов (${elapsed}с)${NC}"
        return 0
      fi
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo -e " ${RED}таймаут (${max}с) — возможно работает, проверьте лог${NC}"
  return 0
}

echo -e "${CYAN}Ожидание готовности сервисов:${NC}"
wait_for "Backend  (8080)" "http://localhost:8080/swagger-ui.html" $PID_BACKEND 120 "$ROOT/logs/backend.log"
wait_for "Forecast (8090)" "http://localhost:8090/docs" $PID_FORECAST 30 "$ROOT/logs/forecast.log"
wait_for "Telegram (3001)" "http://localhost:3001/telegram/status" $PID_TELEGRAM 30 "$ROOT/logs/telegram.log"
wait_for "Frontend (3000)" "http://localhost:3000" $PID_FRONTEND 30 "$ROOT/logs/frontend.log"

echo ""
echo -e "${BOLD}${GREEN}  ✔ Все сервисы запущены!${NC}"
echo ""
echo -e "  ${BOLD}Backend:${NC}    http://localhost:8080"
echo -e "  ${BOLD}Forecast:${NC}   http://localhost:8090"
echo -e "  ${BOLD}Telegram:${NC}   http://localhost:3001"
echo -e "  ${BOLD}Frontend:${NC}   http://localhost:3000"
echo ""
echo -e "  Логи: logs/{backend,forecast,telegram,frontend}.log"
echo -e "  ${CYAN}Ctrl+C${NC} для остановки всех сервисов"
echo ""

wait
