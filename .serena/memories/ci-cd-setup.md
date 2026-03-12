# CI/CD Pipeline & Branch Protection (2026-03-12)

## Branch Protection Rules (Main)

All three status checks required to merge to main:
- `docker-build-test` — Docker build validation + migration test
- `typecheck` — TypeScript strict mode
- `test` — All vitest suites

**Enforced:**
- Strict mode: PR must be up-to-date with main
- No force pushes allowed
- No branch deletions allowed
- PR required (no direct main pushes)

## Four Active CI Workflows

### docker-build-test
- **Purpose:** Catch Docker/deployment issues before Coolify
- **What it does:**
  - Validates JSON syntax in all package.json files (caught previous syntax errors)
  - Builds Dockerfile.server with Docker Buildx
  - Verifies built image starts and runs migrations successfully
- **Triggers:** Changes to packages/happy-server/**, Dockerfile.server, or workflow
- **Recent fix:** Added this workflow 2026-03-12 after discovering JSON syntax broke Docker builds

### typecheck
- **Purpose:** Catch TypeScript errors
- **What it does:** Runs TypeScript strict mode on happy-app
- **Triggers:** Changes to packages/happy-app/**, or workflow

### test
- **Purpose:** Validate all unit/integration tests pass
- **What it does:** Runs vitest across all packages
- **Triggers:** Most pushes and PRs

### cli-smoke-test
- **Purpose:** Ensure CLI binary works after build
- **What it does:** Builds CLI, installs globally, tests --help, --version, doctor, daemon status
- **Tests:** Linux + Windows, Node 20 + 24
- **Triggers:** Changes to packages/happy-cli/**, or workflow

## Breaking Changes Workflow

When making code changes that break tests:
1. Create feature branch
2. Make code change + update tests together
3. Push to branch
4. Create PR — both changes in same commit
5. CI runs all workflows
6. If code works with updated tests, all checks pass ✅
7. Merge to main

This is exactly what branch protection enables — code and tests must be in sync.

## Recent Incidents & Fixes (2026-03-12)

**Issue:** JSON syntax error in package.json broken by bad regex replacement
- Error: Escaped quotes in devDependencies section
- Impact: Docker build failed, caught by Coolify logs (too late)
- **Fix:** Added docker-build-test workflow to catch JSON errors at PR stage

**Issue:** pino-pretty unavailable in Docker (require.resolve() fails)
- Root cause: pino-pretty is dev-only pretty-printer, shouldn't be in prod
- **Fix:** Moved to devDependencies, added graceful fallback to console logging

**Issue:** Prisma migrations directory not found in Docker
- Root cause: standalone.ts looking in wrong paths (./prisma instead of ./packages/happy-server/prisma)
- **Fix:** Added correct Docker path to migration lookup candidates

## Key Takeaway

With branch protection + docker-build-test CI:
- Build failures caught in PR, not in production
- Deployment only accepts commits already validated
- Broken JSON, missing migrations, Docker issues all blocked before Coolify sees them
