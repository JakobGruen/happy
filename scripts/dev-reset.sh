#!/usr/bin/env bash
# scripts/dev-reset.sh — Complete dev environment reset
#
# Nukes everything and rebuilds from scratch. Use when things are broken
# or you want a guaranteed clean state.
#
# Usage:
#   ./scripts/dev-reset.sh          Full reset (stop → Docker → install → build → seed → start)
#   ./scripts/dev-reset.sh -c -d    Rebuild CLI + restart daemon only
#   ./scripts/dev-reset.sh -s       Restart server + DB only
#   ./scripts/dev-reset.sh -m       Reset Metro only

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}> $1${NC}"; }
ok()   { echo -e "  ${GREEN}✅ $1${NC}"; }
fail() { echo -e "  ${RED}❌ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Complete dev environment reset. Nukes and rebuilds from scratch."
    echo ""
    echo "Options:"
    echo "  -a, --all        Do everything (default if no options)"
    echo "  -w, --wire       Rebuild happy-wire"
    echo "  -c, --cli        Rebuild CLI (implies --wire)"
    echo "  -s, --server     Reset Docker + DB + restart server"
    echo "  -d, --daemon     Restart CLI daemon (dev variant)"
    echo "  -i, --install    Reinstall all dependencies (cache clean + install)"
    echo "  -m, --metro      Reset Metro bundler (kill + clear cache + restart)"
    echo "  -t, --typecheck  Run app typecheck"
    echo "  -h, --help       Show this help"
    echo ""
    echo "Examples:"
    echo "  $0               Full reset (everything from scratch)"
    echo "  $0 -c -d         Rebuild CLI and restart daemon"
    echo "  $0 -s            Reset Docker + DB + restart server"
    echo "  $0 -m            Reset Metro only"
    exit 0
}

DO_WIRE=0; DO_CLI=0; DO_SERVER=0; DO_DAEMON=0; DO_TYPECHECK=0; DO_INSTALL=0; DO_METRO=0
HAD_FLAGS=0; DO_ALL=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        -a|--all)       DO_ALL=1; HAD_FLAGS=1 ;;
        -w|--wire)      DO_WIRE=1; HAD_FLAGS=1 ;;
        -c|--cli)       DO_CLI=1; HAD_FLAGS=1 ;;
        -s|--server)    DO_SERVER=1; HAD_FLAGS=1 ;;
        -d|--daemon)    DO_DAEMON=1; HAD_FLAGS=1 ;;
        -i|--install)   DO_INSTALL=1; HAD_FLAGS=1 ;;
        -m|--metro)     DO_METRO=1; HAD_FLAGS=1 ;;
        -t|--typecheck) DO_TYPECHECK=1; HAD_FLAGS=1 ;;
        -h|--help)      usage ;;
        *)              echo "Unknown option: $1"; usage ;;
    esac
    shift
done

# No flags or --all = do everything
if [[ $HAD_FLAGS -eq 0 ]] || [[ $DO_ALL -eq 1 ]]; then
    DO_INSTALL=1; DO_WIRE=1; DO_CLI=1; DO_SERVER=1; DO_DAEMON=1; DO_METRO=1
fi

# --daemon needs a built CLI — auto-build if dist is missing
if [[ $DO_DAEMON -eq 1 ]] && [[ ! -f packages/happy-cli/dist/index.mjs ]]; then
    warn "CLI not built (dist/index.mjs missing) — adding build step for daemon"
    DO_CLI=1
fi

# --cli implies --wire (dependency)
[[ $DO_CLI -eq 1 ]] && DO_WIRE=1

# Detect package manager (Bun or Yarn)
if command -v bun &>/dev/null && [[ -f "$REPO_ROOT/bun.lock" ]]; then
    PM="bun"
    PM_INSTALL="bun install"
    PM_CACHE_CLEAN="bun pm cache rm"
    ws() { bun run --filter "$1" "${@:2}"; }
else
    PM="yarn"
    PM_INSTALL="yarn install"
    PM_CACHE_CLEAN="yarn cache clean"
    ws() { yarn workspace "$1" "${@:2}"; }
fi

ERRORS=0

# ============================================================
# Phase 1: Stop everything
# ============================================================

step "Stopping running services"
# Dev daemon
ws happy-coder dev:daemon:stop 2>/dev/null || true
# Dev server
fuser -TERM -k 3005/tcp 2>/dev/null || true
# Metro/Expo
pkill -f "expo start" 2>/dev/null || true
fuser -k 8081/tcp 2>/dev/null || lsof -ti:8081 | xargs kill -9 2>/dev/null || true
ok "Services stopped"

# ============================================================
# Phase 2: Docker (Postgres + Redis)
# ============================================================

if [[ $DO_SERVER -eq 1 ]] || [[ $DO_ALL -eq 1 ]] || [[ $HAD_FLAGS -eq 0 ]]; then
    step "Resetting Docker services (Postgres + Redis)"
    docker compose -f packages/happy-server/docker-compose.dev.yml down -v 2>/dev/null || true
    docker compose -f packages/happy-server/docker-compose.dev.yml up -d --wait
    ok "Docker services healthy (fresh volumes)"
fi

# ============================================================
# Phase 3: Install dependencies
# ============================================================

if [[ $DO_INSTALL -eq 1 ]]; then
    step "Reinstalling dependencies ($PM)"
    if eval "$PM_CACHE_CLEAN" 2>&1 && eval "$PM_INSTALL" 2>&1; then
        ok "Dependencies reinstalled"
    else
        fail "Install failed"; ERRORS=$((ERRORS + 1))
    fi
fi

# ============================================================
# Phase 4: Build packages
# ============================================================

if [[ $DO_WIRE -eq 1 ]]; then
    step "Building happy-wire"
    if ws @jakobgruen/happy-wire build 2>&1; then
        ok "Wire built"
    else
        fail "Wire build failed"; ERRORS=$((ERRORS + 1))
        if [[ $DO_CLI -eq 1 ]]; then
            warn "Skipping CLI build (wire failed)"; DO_CLI=0
        fi
    fi
fi

if [[ $DO_CLI -eq 1 ]]; then
    step "Building happy-coder (CLI)"
    if ws happy-coder build 2>&1; then
        ok "CLI built"
    else
        fail "CLI build failed"; ERRORS=$((ERRORS + 1))
    fi
fi

# ============================================================
# Phase 5: Database (migrate + seed)
# ============================================================

if [[ $DO_SERVER -eq 1 ]] || [[ $DO_ALL -eq 1 ]] || [[ $HAD_FLAGS -eq 0 ]]; then
    step "Running database migrations"
    (cd packages/happy-server && \
        bunx dotenv -e .env.dev -o -- prisma migrate deploy)
    ok "Migrations applied"

    step "Seeding dev account"
    (cd packages/happy-server && \
        bunx dotenv -e .env.dev -o -- bun run seed:dev)
    ok "Dev account seeded"
fi

# ============================================================
# Phase 6: Start services
# ============================================================

if [[ $DO_SERVER -eq 1 ]]; then
    step "Starting dev server (port 3005)"
    SERVER_LOG="/tmp/happy-server-dev-$$.log"
    # Server's own `dev` script loads .env then .env.dev (tsx --env-file), no inline env needed
    nohup bash -c "$(typeset -f ws); ws happy-server dev" > "$SERVER_LOG" 2>&1 &
    SERVER_PID=$!
    sleep 3
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        ok "Server started (PID $SERVER_PID, log: $SERVER_LOG)"
    else
        fail "Server failed to start — check $SERVER_LOG"
        tail -10 "$SERVER_LOG" 2>/dev/null | sed 's/^/  /'
        ERRORS=$((ERRORS + 1))
    fi
fi

if [[ $DO_DAEMON -eq 1 ]]; then
    step "Starting CLI daemon (dev)"
    sleep 1
    if DEV_AUTH_SECRET=1 ws happy-coder dev:daemon:start 2>&1; then
        ok "Daemon started"
    else
        fail "Daemon failed to start"; ERRORS=$((ERRORS + 1))
    fi
fi

if [[ $DO_TYPECHECK -eq 1 ]]; then
    step "Running app typecheck"
    if ws happy-app typecheck 2>&1; then
        ok "Typecheck passed"
    else
        fail "Typecheck failed"; ERRORS=$((ERRORS + 1))
    fi
fi

if [[ $DO_METRO -eq 1 ]]; then
    step "Starting Expo web (port 8081)"
    METRO_LOG="/tmp/happy-metro-dev-$$.log"
    EXPO_PUBLIC_HAPPY_SERVER_URL=http://localhost:3005 \
    EXPO_PUBLIC_DEV_AUTO_LOGIN=true \
    EXPO_PUBLIC_PIPECAT_URL=http://localhost:8765 \
    EXPO_PUBLIC_PIPECAT_AUTH_SECRET=happy-dev-pipecat-secret \
        nohup bun run --filter happy-app web > "$METRO_LOG" 2>&1 &
    METRO_PID=$!
    sleep 3
    if kill -0 "$METRO_PID" 2>/dev/null; then
        ok "Expo web started (PID $METRO_PID, log: $METRO_LOG)"
    else
        fail "Expo web failed to start — check $METRO_LOG"
        tail -10 "$METRO_LOG" 2>/dev/null | sed 's/^/  /'
        ERRORS=$((ERRORS + 1))
    fi
fi

# ============================================================
# Summary
# ============================================================

echo ""
if [[ $ERRORS -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}🚀 Dev environment reset complete!${NC}"
else
    echo -e "${RED}${BOLD}Completed with $ERRORS error(s)${NC}"
    exit 1
fi
