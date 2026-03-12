# Docker Deployment Integration Testing Strategy

## Problem & Solution
Coolify deployments were failing with "Prisma Client could not locate the Query Engine" errors. CI wasn't catching this because it only verified the build succeeded, not that the server actually works inside the container.

**Solution:** Integration tests run from **inside the container** using `docker exec`, eliminating port binding conflicts with local dev.

## Test Approach (5 Checks)
Tests execute inside running container:
1. Health endpoint returns `"status":"ok"`
2. Metrics endpoint accessible (Prometheus)
3. HTTP routing works (404 on non-existent)
4. No fatal errors in logs
5. Database migrations completed

## Key Files
- `Dockerfile.server`: Added curl to runtime + Prisma binaries in runner stage
- `scripts/test-docker-integration.sh`: Local test script (DRY — reused by CI)
- `scripts/push-and-watch.sh`: Helper for push + real-time CI monitoring
- `.github/workflows/docker-build-test.yml`: Now calls shared test script

## DRY Implementation
Test script shared between local and CI:
```bash
# Local: ./scripts/test-docker-integration.sh
# CI: IMAGE_TAG=happy-server:test ./scripts/test-docker-integration.sh --skip-build
```
Single source of truth prevents test divergence.

## AI-Driven Development Pattern
Agents can now:
```bash
git push origin main && ./scripts/push-and-watch.sh
```
Get immediate terminal notification if CI fails, enabling rapid iteration without context switching.

## Fixed Issues
1. Missing Prisma binaries in runtime image
2. CI didn't validate server actually works
3. Port conflicts with local dev (3005, 9090)
