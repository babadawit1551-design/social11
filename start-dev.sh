#!/usr/bin/env bash
set -e

# ── Environment ──────────────────────────────────────────────────────────────
export DATABASE_URL="${DATABASE_URL:-postgres://avnadmin:<redacted>@pg-2e7d66da-babadawit1551-aecb.h.aivencloud.com:24648/defaultdb?sslmode=require}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export RABBITMQ_URL="${RABBITMQ_URL:-amqp://localhost:5672}"
export SECRET_KEY="${SECRET_KEY:-dev-secret-change-in-production}"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-00000000000000000000000000000000}"
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"

echo "Starting SMAS services..."
echo "  DATABASE_URL : $DATABASE_URL"
echo "  REDIS_URL    : $REDIS_URL"
echo "  RABBITMQ_URL : $RABBITMQ_URL"
echo ""

# ── Auth Service :8001 ────────────────────────────────────────────────────────
(cd services/auth && npm run dev 2>&1 | sed 's/^/[auth]     /' ) &
AUTH_PID=$!
echo "[start] Auth Service started (PID $AUTH_PID)"

# ── Content Service :8002 ─────────────────────────────────────────────────────
(cd services/content && npm run dev 2>&1 | sed 's/^/[content]  /' ) &
CONTENT_PID=$!
echo "[start] Content Service started (PID $CONTENT_PID)"

# ── Schedule Service :8003 ────────────────────────────────────────────────────
(cd services/schedule && npm run dev 2>&1 | sed 's/^/[schedule] /' ) &
SCHEDULE_PID=$!
echo "[start] Schedule Service started (PID $SCHEDULE_PID)"

# ── Analytics Service :8004 ───────────────────────────────────────────────────
(cd services/analytics && npm run dev 2>&1 | sed 's/^/[analytics]/' ) &
ANALYTICS_PID=$!
echo "[start] Analytics Service started (PID $ANALYTICS_PID)"

# ── Publisher Worker ──────────────────────────────────────────────────────────
(cd workers/publisher && npx ts-node src/index.ts 2>&1 | sed 's/^/[publisher]/' ) &
PUBLISHER_PID=$!
echo "[start] Publisher Worker started (PID $PUBLISHER_PID)"

# ── Frontend :5173 ────────────────────────────────────────────────────────────
(cd frontend && npm run dev 2>&1 | sed 's/^/[frontend] /' ) &
FRONTEND_PID=$!
echo "[start] Frontend started (PID $FRONTEND_PID)"

echo ""
echo "All services running. Frontend: http://localhost:5173"
echo ""
echo "To stop all services:"
echo "  kill $AUTH_PID $CONTENT_PID $SCHEDULE_PID $ANALYTICS_PID $PUBLISHER_PID $FRONTEND_PID"
echo "  # or: pkill -f 'ts-node\|vite'"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait and forward Ctrl+C to all children
trap "echo ''; echo 'Stopping all services...'; kill $AUTH_PID $CONTENT_PID $SCHEDULE_PID $ANALYTICS_PID $PUBLISHER_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

wait
