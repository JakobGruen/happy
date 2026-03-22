#!/usr/bin/env bash
# Build, install globally, and restart the stable (prod) daemon.
# Usage: bun daemon
#        scripts/rebuild-daemon.sh
#        scripts/rebuild-daemon.sh --skip-build

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI_DIR="$REPO_ROOT/packages/happy-cli"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
step() { echo -e "\n${CYAN}${BOLD}> $1${NC}"; }
ok()   { echo -e "  ${GREEN}ok: $1${NC}"; }
fail() { echo -e "  ${RED}FAIL: $1${NC}"; exit 1; }

# Parse args
SKIP_BUILD=false
for arg in "$@"; do
    case "$arg" in
        --skip-build) SKIP_BUILD=true ;;
        *) echo "Unknown arg: $arg"; exit 1 ;;
    esac
done

if [ "$SKIP_BUILD" = false ]; then
    step "Building happy-wire"
    cd "$REPO_ROOT"
    bun run --filter @jakobgruen/happy-wire build 2>&1 || fail "Wire build failed"
    ok "Wire built"

    step "Building happy-coder (CLI)"
    bun run --filter happy-coder build 2>&1 || fail "CLI build failed"
    ok "CLI built"
fi

step "Packing and installing globally"
cd "$CLI_DIR"
TARBALL=$(npm pack 2>/dev/null | tail -1)
npm install -g "$TARBALL" 2>&1 || fail "Global install failed"
rm -f "$CLI_DIR/$TARBALL"
INSTALLED=$(npm -g ls happy-coder --depth=0 2>/dev/null | grep happy-coder || true)
ok "Installed: $INSTALLED"

# Use the global binary explicitly (workspace node_modules/.bin shadows it)
HAPPY_BIN="$(npm prefix -g)/bin/happy"

step "Restarting stable daemon"
HAPPY_HOME_DIR=~/.happy "$HAPPY_BIN" daemon stop 2>&1 || true
sleep 1
HAPPY_HOME_DIR=~/.happy "$HAPPY_BIN" daemon start 2>&1 || fail "Daemon failed to start"
ok "Daemon restarted"

echo ""
echo -e "${GREEN}${BOLD}All done!${NC}"
HAPPY_HOME_DIR=~/.happy "$HAPPY_BIN" daemon status 2>&1
