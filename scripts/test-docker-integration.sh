#!/bin/bash
#
# Test Docker integration locally before pushing
# Usage: ./scripts/test-docker-integration.sh [--rebuild]
#
# This script mirrors the CI/CD docker-build-test workflow, allowing developers
# to verify Docker builds work correctly before committing.
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_TAG="${IMAGE_TAG:-happy-server:local-test}"  # Can be overridden by env variable
CONTAINER_TIMEOUT=30
SECRET="test-secret-32-bytes-minimum"

# Parse arguments
REBUILD=false
SKIP_BUILD=false
for arg in "$@"; do
  case $arg in
    --rebuild)
      REBUILD=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --help)
      echo "Usage: ./scripts/test-docker-integration.sh [--rebuild|--skip-build]"
      echo ""
      echo "Options:"
      echo "  --rebuild     Force rebuild the Docker image (don't use cache)"
      echo "  --skip-build  Skip building image (for CI/CD use)"
      echo "  --help        Show this help message"
      echo ""
      echo "Environment variables:"
      echo "  IMAGE_TAG     Override image tag (default: happy-server:local-test)"
      exit 0
      ;;
  esac
done

echo -e "${BLUE}╭─ Happy Coder Docker Integration Test${NC}"
echo ""

# Step 1: Clean up any existing test containers
echo -e "${YELLOW}[1/3] Cleaning up previous test containers...${NC}"
RUNNING=$(docker ps -q -f "ancestor=$IMAGE_TAG" 2>/dev/null | wc -l)
if [ "$RUNNING" -gt 0 ]; then
  docker ps -q -f "ancestor=$IMAGE_TAG" | xargs docker kill > /dev/null 2>&1
  sleep 1
  echo -e "      ${GREEN}✓${NC} Cleaned up $RUNNING container(s)"
fi
echo ""

# Step 2: Build Docker image (skip if IMAGE_TAG provided from CI)
if [ "$SKIP_BUILD" = false ]; then
  echo -e "${YELLOW}[2/3] Building Docker image...${NC}"
  if [ "$REBUILD" = true ]; then
    echo "      (forcing rebuild, not using cache)"
    docker build -f Dockerfile.server --progress=plain --tag "$IMAGE_TAG" --no-cache . > /dev/null 2>&1
  else
    docker build -f Dockerfile.server --progress=plain --tag "$IMAGE_TAG" . > /dev/null 2>&1
  fi
  echo -e "      ${GREEN}✓${NC} Image built: $IMAGE_TAG"
  echo ""
  STEP_NUM="[3/3]"
else
  # CI provides pre-built image
  echo -e "${YELLOW}[2/3] Using pre-built image: $IMAGE_TAG${NC}"
  echo ""
  STEP_NUM="[3/3]"
fi

# Step 3: Run integration tests
echo -e "${YELLOW}$STEP_NUM Running integration tests...${NC}"
echo ""

# Start the container (no port bindings needed — testing from inside container)
CONTAINER_ID=$(docker run --rm -d \
  -e HANDY_MASTER_SECRET="$SECRET" \
  "$IMAGE_TAG")

echo "      Container: $CONTAINER_ID"

# Wait for server to start (give it time for migrations + initialization)
# Try health check up to 30 times with 1 second intervals
echo -n "      Waiting for server to start... "
for i in $(seq 1 $CONTAINER_TIMEOUT); do
  sleep 1
  HEALTH=$(docker exec $CONTAINER_ID curl -s http://localhost:3005/health 2>/dev/null || true)
  if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo -e "${GREEN}ready!${NC}"
    sleep 2  # Extra buffer after server reports ready
    break
  fi
done

if ! echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "${RED}FAILED (timeout)${NC}"
  echo ""
  echo -e "      ${RED}Container logs:${NC}"
  docker logs $CONTAINER_ID 2>&1 | tail -20 | sed 's/^/      /'
  docker kill $CONTAINER_ID > /dev/null 2>&1
  exit 1
fi

echo ""
echo "      Running checks:"
echo ""

# Test 1: Health endpoint
echo -n "      [1/5] Health check... "
HEALTH=$(docker exec $CONTAINER_ID curl -s http://localhost:3005/health)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  echo "            Response: $HEALTH"
  docker kill $CONTAINER_ID > /dev/null 2>&1
  exit 1
fi

# Test 2: Metrics endpoint
echo -n "      [2/5] Metrics endpoint... "
if docker exec $CONTAINER_ID curl -f http://localhost:9090/metrics > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  docker kill $CONTAINER_ID > /dev/null 2>&1
  exit 1
fi

# Test 3: HTTP routing
echo -n "      [3/5] HTTP routing... "
STATUS=$(docker exec $CONTAINER_ID curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/api/nonexistent)
if [ "$STATUS" = "404" ] || [ "$STATUS" = "401" ]; then
  echo -e "${GREEN}✓${NC} (HTTP $STATUS)"
else
  echo -e "${RED}✗${NC} (HTTP $STATUS)"
  docker kill $CONTAINER_ID > /dev/null 2>&1
  exit 1
fi

# Test 4: No fatal errors
echo -n "      [4/5] No fatal errors... "
ERRORS=$(docker logs $CONTAINER_ID 2>&1 | grep -i "fatal\|panic\|crash" | wc -l)
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  echo "            Errors found:"
  docker logs $CONTAINER_ID 2>&1 | grep -i "fatal\|panic\|crash" | head -5 | sed 's/^/            /'
  docker kill $CONTAINER_ID > /dev/null 2>&1
  exit 1
fi

# Test 5: Migrations
echo -n "      [5/5] Migrations completed... "
if docker logs $CONTAINER_ID 2>&1 | grep -q "Applied.*migration"; then
  MIGRATION_COUNT=$(docker logs $CONTAINER_ID 2>&1 | grep "Applied.*migration" | grep -o "[0-9]*" | head -1)
  echo -e "${GREEN}✓${NC} ($MIGRATION_COUNT migrations)"
else
  echo -e "${RED}✗${NC}"
  docker kill $CONTAINER_ID > /dev/null 2>&1
  exit 1
fi

# Cleanup
docker kill $CONTAINER_ID > /dev/null 2>&1

echo ""
echo -e "${GREEN}╰─ All tests passed! ✓${NC}"
echo ""
echo "Ready to push! Your Docker image is production-ready."
echo ""
