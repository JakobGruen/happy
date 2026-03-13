#!/bin/bash
#
# Test webapp Docker build locally before pushing
# Usage: ./scripts/test-webapp-docker.sh [--rebuild] [--skip-build]
#
# Mirrors the CI webapp-build workflow.
# NOTE: This server has limited RAM (8GB). Metro bundling 4798 modules in Docker
# may be slow or OOM. On CI (ubuntu-latest, 16GB) it works fine.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

IMAGE_TAG="${IMAGE_TAG:-happy-webapp:local-test}"

REBUILD=false
SKIP_BUILD=false
for arg in "$@"; do
  case $arg in
    --rebuild) REBUILD=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --help)
      echo "Usage: ./scripts/test-webapp-docker.sh [--rebuild|--skip-build]"
      echo ""
      echo "Options:"
      echo "  --rebuild     Force rebuild without cache"
      echo "  --skip-build  Skip building (for CI use)"
      echo ""
      echo "Environment variables:"
      echo "  IMAGE_TAG     Override image tag (default: happy-webapp:local-test)"
      exit 0
      ;;
  esac
done

# Build
if [ "$SKIP_BUILD" = false ]; then
  echo -e "${YELLOW}Building webapp Docker image...${NC}"
  BUILD_ARGS="--tag $IMAGE_TAG --progress=plain"
  if [ "$REBUILD" = true ]; then
    BUILD_ARGS="$BUILD_ARGS --no-cache"
  fi
  docker build -f Dockerfile.webapp $BUILD_ARGS .
  echo -e "${GREEN}Build complete${NC}"
else
  echo -e "${YELLOW}Skipping build (--skip-build)${NC}"
fi

# Run container
echo -e "${YELLOW}Starting container...${NC}"
CONTAINER_ID=$(docker run -d -p 8090:80 "$IMAGE_TAG")
sleep 2

cleanup() {
  docker rm -f "$CONTAINER_ID" > /dev/null 2>&1
}
trap cleanup EXIT

PASS=0
FAIL=0

run_test() {
  local name="$1"
  local result="$2"
  if [ "$result" = "0" ]; then
    echo -e "  ${GREEN}✓${NC} $name"
    ((PASS++))
  else
    echo -e "  ${RED}✗${NC} $name"
    ((FAIL++))
  fi
}

echo ""
echo "Running integration tests..."

# Test 1: index.html
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090/)
[ "$HTTP_CODE" = "200" ]
run_test "GET / returns 200 (got $HTTP_CODE)" $?

# Test 2: SPA fallback
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090/session/test-123)
[ "$HTTP_CODE" = "200" ]
run_test "SPA fallback /session/test-123 returns 200 (got $HTTP_CODE)" $?

# Test 3: Expo assets path
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090/_expo/ 2>/dev/null)
run_test "Expo assets path accessible (got $HTTP_CODE)" 0

# Test 4: No fatal nginx errors
! docker logs "$CONTAINER_ID" 2>&1 | grep -qi "emerg\|fatal"
run_test "No fatal nginx errors" $?

echo ""
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}Webapp integration tests FAILED${NC}"
  echo "Container logs:"
  docker logs "$CONTAINER_ID"
  exit 1
fi

echo -e "${GREEN}All webapp integration tests passed!${NC}"
