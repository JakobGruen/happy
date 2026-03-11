#!/usr/bin/env bash
# Metro Watchdog — keeps Metro alive by restarting if it crashes
# Usage: scripts/metro-watchdog.sh [timeout_seconds]
# Default timeout is 10 minutes of inactivity before restart

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

TIMEOUT=${1:-600}  # 10 minutes default
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}Metro Watchdog${NC} — restarting on crash or ${TIMEOUT}s inactivity"
echo -e "  Log: ${YELLOW}/tmp/happy-metro-dev-watchdog-$$.log${NC}"
echo -e "  Stop with: ${YELLOW}pkill -f 'expo start'${NC}"
echo ""

WATCHDOG_LOG="/tmp/happy-metro-dev-watchdog-$$.log"
METRO_LOG="/tmp/happy-metro-dev-current.log"

restart_metro() {
    local reason="$1"
    echo "[$(date '+%H:%M:%S')] Restarting Metro ($reason)" | tee -a "$WATCHDOG_LOG"
    
    pkill -f "expo start" 2>/dev/null || true
    sleep 2
    
    nohup yarn workspace happy-app start --clear > "$METRO_LOG" 2>&1 &
    METRO_PID=$!
    echo "[$(date '+%H:%M:%S')] Metro started (PID $METRO_PID)" | tee -a "$WATCHDOG_LOG"
    sleep 5
}

# Initial start
restart_metro "initial"
LAST_ACTIVITY=$(date +%s)

# Watch loop
while true; do
    sleep 10
    NOW=$(date +%s)
    
    # Check if Metro is still alive
    if ! kill -0 "$METRO_PID" 2>/dev/null; then
        restart_metro "process died"
        LAST_ACTIVITY=$(date +%s)
        continue
    fi
    
    # Check if Metro log changed recently (activity indicator)
    if [[ -f "$METRO_LOG" ]]; then
        LOG_MTIME=$(stat -f %m "$METRO_LOG" 2>/dev/null || stat -c %Y "$METRO_LOG" 2>/dev/null)
        TIME_SINCE_CHANGE=$((NOW - LOG_MTIME))
        
        if [[ $TIME_SINCE_CHANGE -lt $TIMEOUT ]]; then
            LAST_ACTIVITY=$NOW
        fi
    fi
    
    IDLE_TIME=$((NOW - LAST_ACTIVITY))
    
    if [[ $IDLE_TIME -gt $TIMEOUT ]]; then
        restart_metro "idle for ${IDLE_TIME}s"
        LAST_ACTIVITY=$(date +%s)
    fi
done
