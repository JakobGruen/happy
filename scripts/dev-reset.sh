#!/usr/bin/env bash
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}> $1${NC}"; }
ok()   { echo -e "  ${GREEN}ok: $1${NC}"; }
fail() { echo -e "  ${RED}FAIL: $1${NC}"; }
warn() { echo -e "  ${YELLOW}warn: $1${NC}"; }

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Rebuild packages and restart services."
    echo ""
    echo "Options:"
    echo "  -a, --all        Do everything (default if no options)"
    echo "  -w, --wire       Rebuild happy-wire"
    echo "  -c, --cli        Rebuild CLI (implies --wire)"
    echo "  -s, --server     Restart dev server (port 3005)"
    echo "  -d, --daemon     Restart CLI daemon (dev variant)"
    echo "  -i, --install    Reinstall all dependencies (yarn cache clean + install)"
    echo "  -m, --metro      Reset Metro bundler (kill + reinstall + clear cache + restart)"
    echo "  -t, --typecheck  Run app typecheck"
    echo "  -h, --help       Show this help"
    echo ""
    echo "Examples:"
    echo "  $0               Full reset (install > wire > cli > daemon > server > metro)"
    echo "  $0 -w -c         Rebuild wire + CLI only"
    echo "  $0 -s            Restart server only"
    echo "  $0 -m            Reset Metro only"
    echo "  $0 -i            Reinstall dependencies only"
    echo "  $0 -c -d         Rebuild CLI and restart daemon"
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

# --- Install ---
if [[ $DO_INSTALL -eq 1 ]]; then
    step "Reinstalling dependencies ($PM_CACHE_CLEAN + $PM_INSTALL)"
    if eval "$PM_CACHE_CLEAN" 2>&1 && eval "$PM_INSTALL" 2>&1; then
        ok "Dependencies reinstalled"
    else
        fail "Install failed"; ERRORS=$((ERRORS + 1))
    fi
fi

# --- Wire ---
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

# --- CLI ---
if [[ $DO_CLI -eq 1 ]]; then
    step "Building happy-coder (CLI)"
    if ws happy-coder build 2>&1; then
        ok "CLI built"
    else
        fail "CLI build failed"; ERRORS=$((ERRORS + 1))
    fi
fi

# --- Daemon ---
if [[ $DO_DAEMON -eq 1 ]]; then
    step "Restarting CLI daemon (dev)"
    ws happy-coder dev:daemon:stop 2>&1 || true
    sleep 1
    if ws happy-coder dev:daemon:start 2>&1; then
        ok "Daemon restarted"
    else
        fail "Daemon failed to start"; ERRORS=$((ERRORS + 1))
    fi
fi

# --- Server ---
if [[ $DO_SERVER -eq 1 ]]; then
    step "Restarting dev server (port 3005)"
    SERVER_LOG="/tmp/happy-server-dev-$$.log"
    nohup ws happy-server dev > "$SERVER_LOG" 2>&1 &
    SERVER_PID=$!
    sleep 3
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        ok "Server started (PID $SERVER_PID, log: $SERVER_LOG)"
        tail -5 "$SERVER_LOG" 2>/dev/null | sed 's/^/  /'
    else
        fail "Server failed to start"
        tail -10 "$SERVER_LOG" 2>/dev/null | sed 's/^/  /'
        ERRORS=$((ERRORS + 1))
    fi
fi

# --- Typecheck ---
if [[ $DO_TYPECHECK -eq 1 ]]; then
    step "Running app typecheck"
    if ws happy-app typecheck 2>&1; then
        ok "Typecheck passed"
    else
        fail "Typecheck failed"; ERRORS=$((ERRORS + 1))
    fi
fi

# --- Metro ---
if [[ $DO_METRO -eq 1 ]]; then
    step "Resetting Metro bundler"

    # Kill existing Metro process
    pkill -f "expo start" 2>/dev/null || true
    lsof -ti:8081 | xargs kill -9 2>/dev/null || true
    sleep 1
    ok "Stopped existing Metro process (if any)"

    # Reinstall app deps ($PM_INSTALL already done if DO_INSTALL, but Metro reset is self-sufficient)
    eval "$PM_INSTALL" 2>&1 || { fail "$PM_INSTALL failed"; ERRORS=$((ERRORS + 1)); }

    # Start Metro with cache cleared
    METRO_LOG="/tmp/happy-metro-dev-$$.log"
    nohup ws happy-app start --clear > "$METRO_LOG" 2>&1 &
    METRO_PID=$!
    sleep 3
    if kill -0 "$METRO_PID" 2>/dev/null; then
        ok "Metro started (PID $METRO_PID, log: $METRO_LOG)"
        echo "  To keep it alive: scripts/metro-watchdog.sh"
        echo "  For logs: tail -f $METRO_LOG"
        tail -5 "$METRO_LOG" 2>/dev/null | sed 's/^/  /'
    else
        fail "Metro failed to start"
        tail -10 "$METRO_LOG" 2>/dev/null | sed 's/^/  /'
        ERRORS=$((ERRORS + 1))
    fi
fi

# --- Summary ---
echo ""
if [[ $ERRORS -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}All done!${NC}"
else
    echo -e "${RED}${BOLD}Completed with $ERRORS error(s)${NC}"
    exit 1
fi
