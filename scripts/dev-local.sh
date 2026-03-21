#!/usr/bin/env bash
# scripts/dev-local.sh — Unified local dev environment
#
# Usage:
#   ./scripts/dev-local.sh          Start everything (Docker, seed, daemon, server, web)
#   ./scripts/dev-local.sh down     Stop everything
#   ./scripts/dev-local.sh reset    Wipe DB, re-seed
#   ./scripts/dev-local.sh restart-cli     Rebuild CLI + restart daemon
#   ./scripts/dev-local.sh restart-server  Restart server
#   ./scripts/dev-local.sh restart-app     Restart Expo web

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}> $1${NC}"; }
ok()   { echo -e "  ${GREEN}✅ $1${NC}"; }
fail() { echo -e "  ${RED}❌ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }

# --- Down ---
do_down() {
    step "Stopping all dev services"

    # Stop daemon
    bun run --filter happy-coder dev:daemon:stop 2>/dev/null || true
    ok "Daemon stopped"

    # Kill server
    fuser -TERM -k 3005/tcp 2>/dev/null || true
    ok "Server stopped"

    # Kill Metro/Expo
    fuser -TERM -k 8081/tcp 2>/dev/null || true
    ok "Metro stopped"

    # Stop Docker services
    docker compose -f packages/happy-server/docker-compose.dev.yml down 2>/dev/null || true
    ok "Docker services stopped"

    echo -e "\n${GREEN}${BOLD}All stopped.${NC}"
}

# --- Reset ---
do_reset() {
    step "Resetting database"

    # Drop and recreate
    docker compose -f packages/happy-server/docker-compose.dev.yml exec -T postgres \
        psql -U postgres -c "DROP DATABASE IF EXISTS handy;" 2>/dev/null || true
    docker compose -f packages/happy-server/docker-compose.dev.yml exec -T postgres \
        psql -U postgres -c "CREATE DATABASE handy;" 2>/dev/null || true
    ok "Database dropped and recreated"

    # Re-run migrations
    (cd packages/happy-server && \
        DATABASE_URL=postgresql://postgres:postgres@localhost:5432/handy \
        bunx prisma migrate deploy)
    ok "Migrations applied"

    # Re-seed
    (cd packages/happy-server && \
        DATABASE_URL=postgresql://postgres:postgres@localhost:5432/handy \
        HANDY_MASTER_SECRET=happy-dev-master-secret-not-for-production \
        bun run seed:dev)
    ok "Dev account seeded"
    echo -e "\n${GREEN}${BOLD}Database reset complete.${NC}"
}

# --- Up (default) ---
do_up() {
    step "Starting Docker services (Postgres + Redis)"
    docker compose -f packages/happy-server/docker-compose.dev.yml up -d --wait
    ok "Docker services healthy"

    step "Running database migrations"
    (cd packages/happy-server && \
        DATABASE_URL=postgresql://postgres:postgres@localhost:5432/handy \
        bunx prisma migrate deploy)
    ok "Migrations applied"

    step "Seeding dev account"
    (cd packages/happy-server && \
        DATABASE_URL=postgresql://postgres:postgres@localhost:5432/handy \
        HANDY_MASTER_SECRET=happy-dev-master-secret-not-for-production \
        bun run seed:dev)
    ok "Dev account ready"

    step "Building wire + CLI"
    bun run --filter @jakobgruen/happy-wire build
    ok "Wire built"
    bun run --filter happy-coder build
    ok "CLI built"

    step "Starting CLI daemon"
    # Stop existing daemon if running
    bun run --filter happy-coder dev:daemon:stop 2>/dev/null || true
    sleep 1
    # Start daemon with dev auth + local server
    DEV_AUTH_SECRET=1 \
    HAPPY_SERVER_URL=http://localhost:3005 \
    HAPPY_HOME_DIR=~/.happy-dev-local \
        bun run --filter happy-coder dev:daemon:start
    ok "Daemon started"

    step "Starting server (port 3005)"
    SERVER_LOG="/tmp/happy-server-dev-$$.log"
    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/handy \
    HANDY_MASTER_SECRET=happy-dev-master-secret-not-for-production \
    REDIS_URL=redis://localhost:6380 \
        nohup bun run --filter happy-server dev > "$SERVER_LOG" 2>&1 &
    SERVER_PID=$!
    sleep 3
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        ok "Server started (PID $SERVER_PID, log: $SERVER_LOG)"
    else
        fail "Server failed to start — check $SERVER_LOG"
        tail -10 "$SERVER_LOG" 2>/dev/null | sed 's/^/  /'
        exit 1
    fi

    step "Starting Expo web (port 8081)"
    METRO_LOG="/tmp/happy-metro-dev-$$.log"
    EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 \
    EXPO_PUBLIC_DEV_AUTO_LOGIN=true \
        nohup bun run --filter happy-app web > "$METRO_LOG" 2>&1 &
    METRO_PID=$!
    sleep 3
    if kill -0 "$METRO_PID" 2>/dev/null; then
        ok "Expo web started (PID $METRO_PID, log: $METRO_LOG)"
    else
        fail "Expo web failed to start — check $METRO_LOG"
        tail -10 "$METRO_LOG" 2>/dev/null | sed 's/^/  /'
        exit 1
    fi

    echo ""
    echo -e "${GREEN}${BOLD}🚀 Dev environment ready!${NC}"
    echo ""
    echo "  App:    http://localhost:8081"
    echo "  Server: http://localhost:3005"
    echo "  DB:     postgresql://postgres:postgres@localhost:5432/handy"
    echo ""
    echo "  Server log: $SERVER_LOG"
    echo "  Metro log:  $METRO_LOG"
    echo ""
    echo "  bun dev:restart:cli     Rebuild CLI + restart daemon"
    echo "  bun dev:restart:server  Restart server"
    echo "  bun dev:restart:app     Restart Expo web"
    echo "  bun dev:down            Stop everything"
    echo "  bun dev:db:reset        Wipe DB + re-seed"
}

# --- Restart: CLI ---
do_restart_cli() {
    step "Rebuilding CLI + restarting daemon"
    bun run --filter @jakobgruen/happy-wire build
    bun run --filter happy-coder build
    ok "Wire + CLI built"

    bun run --filter happy-coder dev:daemon:stop 2>/dev/null || true
    sleep 1
    DEV_AUTH_SECRET=1 \
    HAPPY_SERVER_URL=http://localhost:3005 \
    HAPPY_HOME_DIR=~/.happy-dev-local \
        bun run --filter happy-coder dev:daemon:start
    ok "Daemon restarted"
}

# --- Restart: Server ---
do_restart_server() {
    step "Restarting server"
    fuser -TERM -k 3005/tcp 2>/dev/null || true
    sleep 1
    SERVER_LOG="/tmp/happy-server-dev-$$.log"
    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/handy \
    HANDY_MASTER_SECRET=happy-dev-master-secret-not-for-production \
    REDIS_URL=redis://localhost:6380 \
        nohup bun run --filter happy-server dev > "$SERVER_LOG" 2>&1 &
    SERVER_PID=$!
    sleep 3
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        ok "Server restarted (PID $SERVER_PID, log: $SERVER_LOG)"
    else
        fail "Server failed to start — check $SERVER_LOG"
        exit 1
    fi
}

# --- Restart: App ---
do_restart_app() {
    step "Restarting Expo web"
    fuser -TERM -k 8081/tcp 2>/dev/null || true
    sleep 1
    METRO_LOG="/tmp/happy-metro-dev-$$.log"
    EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 \
    EXPO_PUBLIC_DEV_AUTO_LOGIN=true \
        nohup bun run --filter happy-app web > "$METRO_LOG" 2>&1 &
    METRO_PID=$!
    sleep 3
    if kill -0 "$METRO_PID" 2>/dev/null; then
        ok "Expo web restarted (PID $METRO_PID, log: $METRO_LOG)"
    else
        fail "Expo web failed to start — check $METRO_LOG"
        exit 1
    fi
}

# --- Main ---
case "${1:-up}" in
    up)              do_up ;;
    down)            do_down ;;
    reset)           do_reset ;;
    restart-cli)     do_restart_cli ;;
    restart-server)  do_restart_server ;;
    restart-app)     do_restart_app ;;
    *)               echo "Usage: $0 [up|down|reset|restart-cli|restart-server|restart-app]"; exit 1 ;;
esac
