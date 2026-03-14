#!/usr/bin/env bash
# Rebuild and restart the stable (prod) daemon.
# Usage: scripts/rebuild-daemon.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
step() { echo -e "\n${CYAN}${BOLD}> $1${NC}"; }
ok()   { echo -e "  ${GREEN}ok: $1${NC}"; }
fail() { echo -e "  ${RED}FAIL: $1${NC}"; exit 1; }

# Ensure happy-coder is globally linked to local repo
CLI_PKG="$REPO_ROOT/packages/happy-cli"
GLOBAL_LINK="$(npm root -g)/happy-coder"
if [ ! -L "$GLOBAL_LINK" ] || [ "$(readlink -f "$GLOBAL_LINK")" != "$(readlink -f "$CLI_PKG")" ]; then
    step "Linking happy-coder globally"
    npm link --prefix "$CLI_PKG" 2>&1 || fail "npm link failed"
    ok "Linked $(which happy) → $CLI_PKG"
else
    ok "Global link already correct"
fi

step "Building happy-wire"
bun run --filter @jakobgruen/happy-wire build 2>&1 || fail "Wire build failed"
ok "Wire built"

step "Building happy-coder (CLI)"
bun run --filter happy-coder build 2>&1 || fail "CLI build failed"
ok "CLI built"

step "Restarting stable daemon"
happy daemon stop 2>&1 || true
sleep 1
happy daemon start 2>&1 || fail "Daemon failed to start"
ok "Daemon restarted"

echo ""
echo -e "${GREEN}${BOLD}All done!${NC}"
happy daemon status 2>&1
