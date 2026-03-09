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
    echo "  -t, --typecheck  Run app typecheck"
    echo "  -h, --help       Show this help"
    echo ""
    echo "Examples:"
    echo "  $0               Full reset (wire > cli > daemon > server)"
    echo "  $0 -w -c         Rebuild wire + CLI only"
    echo "  $0 -s            Restart server only"
    echo "  $0 -d            Restart daemon only"
    echo "  $0 -c -d         Rebuild CLI and restart daemon"
    exit 0
}

DO_WIRE=0; DO_CLI=0; DO_SERVER=0; DO_DAEMON=0; DO_TYPECHECK=0
HAD_FLAGS=0; DO_ALL=0

while [[ $# -gt 0 ]]; do
    case "$1" in
        -a|--all)       DO_ALL=1; HAD_FLAGS=1 ;;
        -w|--wire)      DO_WIRE=1; HAD_FLAGS=1 ;;
        -c|--cli)       DO_CLI=1; HAD_FLAGS=1 ;;
        -s|--server)    DO_SERVER=1; HAD_FLAGS=1 ;;
        -d|--daemon)    DO_DAEMON=1; HAD_FLAGS=1 ;;
        -t|--typecheck) DO_TYPECHECK=1; HAD_FLAGS=1 ;;
        -h|--help)      usage ;;
        *)              echo "Unknown option: $1"; usage ;;
    esac
    shift
done

# No flags or --all = do everything
if [[ $HAD_FLAGS -eq 0 ]] || [[ $DO_ALL -eq 1 ]]; then
    DO_WIRE=1; DO_CLI=1; DO_SERVER=1; DO_DAEMON=1
fi

# --daemon needs a built CLI — auto-build if dist is missing
if [[ $DO_DAEMON -eq 1 ]] && [[ ! -f packages/happy-cli/dist/index.mjs ]]; then
    warn "CLI not built (dist/index.mjs missing) — adding build step for daemon"
    DO_CLI=1
fi

# --cli implies --wire (dependency)
[[ $DO_CLI -eq 1 ]] && DO_WIRE=1

ERRORS=0

# --- Wire ---
if [[ $DO_WIRE -eq 1 ]]; then
    step "Building happy-wire"
    if yarn workspace @jakobgruen/happy-wire build 2>&1; then
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
    if yarn workspace happy-coder build 2>&1; then
        ok "CLI built"
    else
        fail "CLI build failed"; ERRORS=$((ERRORS + 1))
    fi
fi

# --- Daemon ---
if [[ $DO_DAEMON -eq 1 ]]; then
    step "Restarting CLI daemon (dev)"
    yarn workspace happy-coder dev:daemon:stop 2>&1 || true
    sleep 1
    if yarn workspace happy-coder dev:daemon:start 2>&1; then
        ok "Daemon restarted"
    else
        fail "Daemon failed to start"; ERRORS=$((ERRORS + 1))
    fi
fi

# --- Server ---
if [[ $DO_SERVER -eq 1 ]]; then
    step "Restarting dev server (port 3005)"
    SERVER_LOG="/tmp/happy-server-dev-$$.log"
    nohup yarn workspace happy-server dev > "$SERVER_LOG" 2>&1 &
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
    if yarn workspace happy-app typecheck 2>&1; then
        ok "Typecheck passed"
    else
        fail "Typecheck failed"; ERRORS=$((ERRORS + 1))
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
