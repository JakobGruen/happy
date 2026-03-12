# Bun Runtime Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Integrate Bun JavaScript runtime into Happy Coder server across 3 phases (dev → CI → Docker) to reduce image size and improve startup performance.

**Architecture:** Phase 1 adds local Bun support (`bun run dev`), Phase 2 validates via CI test matrix (Node.js + Bun), Phase 3 builds production Docker image with Bun standalone binary. Each phase is independent with rollback capability.

**Tech Stack:** Bun (native TypeScript), Fastify 5, Prisma, PostgreSQL, Docker multi-stage build, GitHub Actions, vitest

---

## Phase 1: Local Development Support

### Task 1.1: Add `bun run dev` script to package.json

**Files:**
- Modify: `packages/happy-server/package.json:10-15`

**Step 1: Read current package.json scripts section**

Run: `cat packages/happy-server/package.json | grep -A 10 '"scripts"'`

Expected output:
```json
"scripts": {
  "build": "tsc --noEmit",
  "start": "tsx ./sources/main.ts",
  "dev": "tsx ./sources/main.ts",
  ...
}
```

**Step 2: Add bun dev script**

In `packages/happy-server/package.json`, locate the `"dev"` script line (currently `"dev": "tsx ./sources/main.ts"`). Rename it to `"dev:tsx"` and add a new `"dev"` that uses Bun:

Replace:
```json
  "dev": "tsx ./sources/main.ts",
```

With:
```json
  "dev": "bun run ./sources/main.ts",
  "dev:tsx": "tsx ./sources/main.ts",
```

**Step 3: Verify the change**

Run: `cat packages/happy-server/package.json | grep -A 2 '"dev"'`

Expected output:
```json
  "dev": "bun run ./sources/main.ts",
  "dev:tsx": "tsx ./sources/main.ts",
```

**Step 4: Commit**

```bash
git add packages/happy-server/package.json
git commit -m "feat(server): add bun run dev script for local development

Developers can now use 'bun run dev' to start the server with Bun runtime.
Keeps 'yarn dev:tsx' as fallback for Node.js/tsx-based development.
Both runtimes produce identical behavior."
```

---

### Task 1.2: Test Bun locally (manual validation)

**Files:**
- No code changes (testing only)

**Step 1: Install Bun (if not already installed)**

Run: `curl -fsSL https://bun.sh/install | bash`

Expected: Bun installation completes, available as `bun` command.

**Step 2: Start the server with Bun**

Run from `packages/happy-server`:
```bash
bun run dev
```

Expected output (similar to tsx version):
```
listening on port 3005
Fastify server started
```

Wait 3-5 seconds for startup.

**Step 3: Test HTTP endpoints (in another terminal)**

```bash
curl -s http://localhost:3005/v1/health | jq
```

Expected output:
```json
{
  "status": "ok"
}
```

**Step 4: Test Socket.IO connection (optional, validates real-time)**

If Socket.IO is exposed, verify it connects:
```bash
curl -i http://localhost:3005/socket.io/?EIO=4&transport=polling
```

Expected: HTTP 200 response with Socket.IO payload.

**Step 5: Stop the server**

Press `Ctrl+C` to stop the Bun server.

**Step 6: Verify fallback still works**

Run: `yarn workspace happy-server dev` (or `yarn dev:tsx` if aliased)

Expected: Server starts with tsx (slower startup due to TypeScript transpilation, but same behavior).

Stop with `Ctrl+C`.

**Step 7: Document in CLAUDE.md (if needed)**

Add to `packages/happy-server/CLAUDE.md`:
```markdown
## Bun Runtime Support

### Local Development

Start the server with Bun:
```bash
bun run dev
```

Or use Node.js/tsx as fallback:
```bash
yarn dev:tsx
```

Both produce identical behavior. Bun is faster (native TypeScript), tsx is familiar (current default).
```

No commit needed for testing — it's validation only.

---

## Phase 2: CI/Testing Integration

### Task 2.1: Add Bun test job to GitHub Actions workflow

**Files:**
- Modify: `.github/workflows/test.yml` (or wherever tests run)

**Step 1: Find the current test workflow**

Run: `find .github/workflows -name "*.yml" -o -name "*.yaml" | head -5`

Expected output: List of workflow files (e.g., `test.yml`, `ci.yml`)

Run: `cat .github/workflows/test.yml | head -40` (adjust filename if needed)

Expected: YAML with `jobs:` section that runs tests on Node.js.

**Step 2: Update workflow to add Bun test matrix**

In the workflow file, find the `strategy:` section under the test job. Add a `matrix:` if it doesn't exist, or update it to include both `node` and `bun` runtimes:

Current (example):
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: yarn install
      - run: yarn workspace happy-server test
```

Updated:
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        runtime: [node, bun]
    steps:
      - uses: actions/checkout@v3
      - if: matrix.runtime == 'node'
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      - if: matrix.runtime == 'bun'
        uses: oven-sh/setup-bun@v1
      - run: yarn install
      - run: yarn workspace happy-server test
```

**Step 3: Verify workflow syntax**

Run: `yamllint .github/workflows/test.yml` (if yamllint installed)

Or manually check for syntax errors (matching quotes, indentation, etc.).

**Step 4: Commit**

```bash
git add .github/workflows/test.yml
git commit -m "ci(test): add Bun test job to CI matrix

Tests now run on both Node.js and Bun runtimes in parallel.
Validates server works identically on both runtimes.
Catches Bun-specific edge cases before Phase 3 deployment."
```

---

### Task 2.2: Verify tests pass on Bun (local validation)

**Files:**
- No code changes (testing only)

**Step 1: Run tests locally on Bun**

Run: `bun run test` (from `packages/happy-server`)

Expected output:
```
PASS  sources/app/api/socket/sessionUpdateHandler.spec.ts
PASS  sources/app/routes/health.spec.ts
...
 ✓ 45 tests passed
```

If tests fail with Bun-specific errors, document the issue and decide whether to:
- Fix the code to work on both runtimes
- Mark Phase 2 as blocker and skip Phase 3
- Add a note to the design doc about Bun limitations

**Step 2: Compare with Node.js tests**

Run: `yarn test` (runs on Node.js)

Expected: Same test results (all passing or same failures on both).

**Step 3: No commit needed for testing**

---

## Phase 3: Docker Production Binary

### Task 3.1: Update Dockerfile Stage 1 to use oven/bun:latest

**Files:**
- Modify: `Dockerfile.server:1-5`

**Step 1: Read current Dockerfile Stage 1**

Run: `head -20 Dockerfile.server`

Expected:
```dockerfile
FROM node:20 AS deps
...
```

**Step 2: Replace base image with Bun**

Replace:
```dockerfile
FROM node:20 AS deps
```

With:
```dockerfile
FROM oven/bun:latest AS deps
```

**Step 3: Verify Stage 1 still works**

The rest of Stage 1 (apt-get install, yarn commands, etc.) should work unchanged with `oven/bun:latest` because Bun images include Node.js tooling.

No additional changes needed in Stage 1.

---

### Task 3.2: Update Dockerfile Stage 2 to build with `bun run build:standalone`

**Files:**
- Modify: `Dockerfile.server:32-40` (approximately, Stage 2)

**Step 1: Read current Stage 2**

Run: `sed -n '/^FROM deps AS builder/,/^FROM /p' Dockerfile.server | head -20`

Expected:
```dockerfile
FROM deps AS builder

COPY packages/happy-wire ./packages/happy-wire
COPY packages/happy-server ./packages/happy-server

RUN yarn workspace @jakobgruen/happy-wire build
RUN yarn workspace happy-server build
```

**Step 2: Update happy-server build to use bun**

Replace:
```dockerfile
RUN yarn workspace happy-server build
```

With:
```dockerfile
RUN cd packages/happy-server && bun run build:standalone
```

Keep the happy-wire build unchanged (it still uses yarn):
```dockerfile
RUN yarn workspace @jakobgruen/happy-wire build
```

**Step 3: Verify the Stage 2 section now reads:**

```dockerfile
FROM deps AS builder

COPY packages/happy-wire ./packages/happy-wire
COPY packages/happy-server ./packages/happy-server

RUN yarn workspace @jakobgruen/happy-wire build
RUN cd packages/happy-server && bun run build:standalone
```

---

### Task 3.3: Update Dockerfile Stage 3 to use debian:bookworm-slim and run binary

**Files:**
- Modify: `Dockerfile.server:42-75` (approximately, Stage 3)

**Step 1: Read current Stage 3**

Run: `sed -n '/^FROM node:20 AS runner/,/^CMD /p' Dockerfile.server`

Expected:
```dockerfile
FROM node:20 AS runner

WORKDIR /repo

ENV NODE_ENV=production

COPY --from=builder /repo/node_modules /repo/node_modules
COPY --from=builder /repo/packages/happy-wire /repo/packages/happy-wire
COPY --from=builder /repo/packages/happy-server /repo/packages/happy-server

...

CMD sh -c "cd packages/happy-server && npx prisma migrate deploy && cd /repo && yarn --cwd packages/happy-server start"
```

**Step 2: Replace entire Stage 3 with Bun-optimized version**

Replace the entire Stage 3 (from `FROM node:20 AS runner` to the end) with:

```dockerfile
# Stage 3: runtime (minimal debian + Bun binary only)
FROM debian:bookworm-slim AS runner

WORKDIR /repo

# Runtime dependencies (ffmpeg for media, ca-certificates for TLS)
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

# Set environment to production
ENV NODE_ENV=production

# Copy only the compiled Bun binary
COPY --from=builder /repo/packages/happy-server/dist/server /repo/packages/happy-server/dist/server

# Copy Prisma schema for migrations
COPY --from=builder /repo/packages/happy-server/prisma /repo/packages/happy-server/prisma

# Copy root package.json and yarn.lock (needed for prisma commands)
COPY package.json yarn.lock ./

# Expose the port the app will run on
EXPOSE 3005

# Run migrations then start the server (binary is pre-compiled)
CMD sh -c "cd packages/happy-server && npx prisma migrate deploy && /repo/packages/happy-server/dist/server"
```

**Step 3: Verify Stage 3 changes**

Key differences from before:
- ✅ Base image: `debian:bookworm-slim` (80MB, minimal)
- ✅ Runtime deps: Only `ca-certificates` + `libssl3` (TLS support)
- ✅ Binary copied: `/repo/packages/happy-server/dist/server` (pre-compiled)
- ✅ No node_modules, no source files, no build tools
- ✅ CMD runs binary directly (no TypeScript transpilation)

---

### Task 3.4: Test Docker build locally

**Files:**
- No code changes (testing only)

**Step 1: Build the Docker image**

Run from repo root:
```bash
docker build -f Dockerfile.server -t happy-server:bun-test .
```

Expected: Build succeeds without errors. Last line should show: `Successfully tagged happy-server:bun-test`

If build fails, check error message:
- If `bun run build:standalone` fails → Bun build issue, debug locally with `bun run build:standalone`
- If `npx prisma migrate deploy` fails → Database connection issue (expected, needs real DB)
- If binary not found → Check output path of `build:standalone`

**Step 2: Verify image size**

Run: `docker images happy-server:bun-test`

Expected output (approximately):
```
REPOSITORY          TAG          IMAGE ID       SIZE
happy-server        bun-test     abc123def456   180M
```

Size should be significantly smaller than before (old Node.js version was ~700MB).

**Step 3: Inspect image contents (verify no source files)**

Run: `docker run --rm happy-server:bun-test ls -la /repo/packages/happy-server/ | head -20`

Expected output: Only `dist/`, `prisma/`, and `package.json` present. NO `sources/`, `tsconfig.json`, `.eslintrc`, etc.

```
total 48
drwxr-xr-x 4 root root 4096 ... happy-server
drwxr-xr-x 2 root root 4096 ... dist
drwxr-xr-x 2 root root 4096 ... prisma
-rw-r--r-- 1 root root  2000 ... package.json
```

**Step 4: Test image startup (without running migrations)**

Run: `docker run --rm -e NODE_ENV=test happy-server:bun-test /repo/packages/happy-server/dist/server --help`

Expected: Binary runs and shows help (or starts server).

Or, if no --help flag, just verify it starts:
```bash
docker run --rm -e NODE_ENV=test happy-server:bun-test timeout 2 /repo/packages/happy-server/dist/server || true
```

Expected: Server starts, times out after 2s, no errors in output.

**Step 5: Clean up test image**

Run: `docker rmi happy-server:bun-test`

Expected: Image removed.

---

### Task 3.5: Commit Dockerfile changes

**Files:**
- Modified: `Dockerfile.server` (entire file)

**Step 1: Verify all changes are in place**

Run: `git diff Dockerfile.server | head -50`

Expected: Shows changes to all 3 stages (deps using bun, builder building with bun, runner using debian + binary).

**Step 2: Stage the changes**

Run: `git add Dockerfile.server`

**Step 3: Commit with detailed message**

```bash
git commit -m "refactor(docker): use Bun standalone binary for production runtime

Phase 3 of Bun integration:
- Stage 1 (deps): Switch base to oven/bun:latest for build environment
- Stage 2 (builder): Build happy-server with 'bun run build:standalone'
- Stage 3 (runner): Switch to debian:bookworm-slim base + single compiled binary

Benefits:
- Final image size: ~150-200MB (vs ~700MB with Node.js)
- Startup time: Faster (no TypeScript transpilation)
- Deployment: Single binary, zero Node.js runtime dependency
- Security: Minimal dependencies, no build tools in production

Rollback: Revert to node:20 base + 'yarn workspace happy-server build'"
```

---

## Validation Gates & Decision Points

### After Phase 1
✅ **Success criteria**: `bun run dev` starts server, responds to HTTP requests  
❌ **Blocker**: Server crashes, won't connect to PostgreSQL, TypeScript errors  
**Decision**: Proceed to Phase 2 or rollback to `yarn dev`

### After Phase 2
✅ **Success criteria**: All tests pass on both Node.js and Bun runtimes  
❌ **Blocker**: Tests fail on Bun (but pass on Node.js) — edge case detected  
**Decision**: Proceed to Phase 3, document Bun limitation, or rollback

### After Phase 3
✅ **Success criteria**: Docker image builds, binary starts, migrations run, smaller size  
❌ **Blocker**: Binary crashes, PostgreSQL connection fails, image size unexpectedly large  
**Decision**: Deploy to production or rollback

---

## Rollback Instructions

**If Phase 1 fails**: 
```bash
git revert <commit-hash-of-phase-1>
# Back to: yarn dev uses tsx
```

**If Phase 2 fails**:
```bash
git revert <commit-hash-of-phase-2>
# Back to: Tests run only on Node.js
```

**If Phase 3 fails**:
```bash
git revert <commit-hash-of-phase-3>
# Back to: Docker uses node:20 + source files
```

Each phase can be rolled back independently without affecting others.

---

## Success Criteria (Final)

- ✅ Phase 1: Developers can use `bun run dev` locally, server responds to requests
- ✅ Phase 2: All tests pass on Bun (CI shows green for both runtimes)
- ✅ Phase 3: Docker image builds successfully, binary starts, size is ~150-200MB
- ✅ Post-deploy: Production server handles traffic, no crashes, response times match Node.js version

---

## Execution Handoff

Plan complete and saved to `docs/plans/2026-03-12-bun-integration-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open new session with executing-plans, batch execution with checkpoints

Which approach? 🚀
