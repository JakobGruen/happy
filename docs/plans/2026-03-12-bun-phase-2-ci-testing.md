# Bun Phase 2: CI Testing — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Validate that the full test suite passes on Bun runtime, proving the server works on Bun before moving to Phase 3 (Docker binary).

**Architecture:** Run tests on Bun locally first, then add Bun test job to CI pipeline. No code changes needed—vitest works identically on both Node.js and Bun.

**Tech Stack:**
- Bun 1.x (latest)
- Vitest (unchanged, runs on Bun)
- Docker Postgres (test infrastructure from Phase 1)
- Node.js 20 (fallback, for comparison)

---

## Task 1: Test Bun Installation & Setup

**Files:**
- None to modify (setup only)

**Step 1: Install Bun locally**

```bash
curl -fsSL https://bun.sh/install | bash
```

Expected: Bun installed to `~/.bun/bin/bun`

**Step 2: Verify Bun installation**

```bash
~/.bun/bin/bun --version
```

Expected output: `x.y.z` (e.g., `1.0.0`)

**Step 3: Add Bun to PATH for convenience**

```bash
export PATH="$HOME/.bun/bin:$PATH"
bun --version
```

Or add to your shell profile (`~/.bashrc` or `~/.zshrc`):

```bash
export PATH="$HOME/.bun/bin:$PATH"
```

**Step 4: Commit**

No code changes needed for this step.

---

## Task 2: Run Tests on Bun Locally

**Files:**
- None to modify

**Step 1: Navigate to server package**

```bash
cd packages/happy-server
```

**Step 2: Install dependencies with Bun** (optional, yarn lock should work)

```bash
bun install
```

Or skip if yarn dependencies are already installed.

**Step 3: Run full test suite on Bun**

```bash
bun run test
```

Expected output:

```
Test Files  3 passed (3)
     Tests  47 passed (47)
```

Or at minimum, sessionUpdateHandler.spec.ts should pass:

```bash
bun run test sources/app/api/socket/sessionUpdateHandler.spec.ts
```

Expected output:

```
✓ sources/app/api/socket/sessionUpdateHandler.spec.ts (7 tests)
Test Files  1 passed (1)
     Tests  7 passed (7)
```

**Step 4: Verify Docker cleanup on Bun**

After tests complete:

```bash
docker ps | grep postgres
```

Expected: No test containers lingering (only production containers like coolify-db if running).

**Step 5: Document outcome**

If tests pass on Bun:
- ✅ Server works on Bun runtime
- ✅ Proceed to Task 3 (add CI job)
- ✅ Ready for Phase 3 (Docker binary)

If tests fail on Bun only (pass on Node.js):
- ❌ Found Bun edge case
- ⚠️ Document error, defer Phase 3 until fixed
- Rollback Phase 2, stay on Node.js for now

If tests fail on both:
- ❌ Code bug, not Bun-specific
- Fix in implementation, retest on Node.js first, then Bun

---

## Task 3: Add Bun Test Job to GitHub Actions

**Files:**
- Modify: `.github/workflows/test.yml` (or equivalent CI config)

**Step 1: Understand current CI setup**

Check if GitHub Actions workflow exists:

```bash
ls -la .github/workflows/
```

Look for `test.yml`, `ci.yml`, or similar.

**Step 2: Review current Node.js test job**

Read the existing workflow to understand:
- When tests run (on PR, push to main, etc.)
- How dependencies are installed
- Test command and environment setup

**Step 3: Add Bun test job alongside Node.js**

Edit `.github/workflows/test.yml` to add a test matrix:

```yaml
jobs:
  test:
    strategy:
      matrix:
        runtime: [node, bun]
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: happy_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        if: matrix.runtime == 'node'
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: yarn

      - name: Setup Bun
        if: matrix.runtime == 'bun'
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: |
          if [[ "${{ matrix.runtime }}" == "node" ]]; then
            yarn install --frozen-lockfile
          else
            bun install --frozen-lockfile
          fi

      - name: Run tests (${{ matrix.runtime }})
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/happy_test
        run: |
          cd packages/happy-server
          if [[ "${{ matrix.runtime }}" == "node" ]]; then
            yarn test
          else
            bun run test
          fi
```

**Step 4: Commit CI configuration**

```bash
git add .github/workflows/test.yml
git commit -m "ci(testing): add Bun test job alongside Node.js

- Run full test suite on both Node.js and Bun runtimes
- Both must pass before merging
- Validates server works on Bun before Phase 3"
```

**Step 5: Push and verify CI runs**

```bash
git push
```

Check GitHub Actions tab to verify:
- ✅ Node.js test job passes
- ✅ Bun test job passes
- ✅ Both runtimes pass Docker Postgres integration tests

---

## Task 4: Decision Point & Next Steps

**Verification Checklist:**

Before proceeding to Phase 3:

- [ ] `bun run test` passes locally on happy-server
- [ ] All 7 sessionUpdateHandler tests pass on Bun
- [ ] Docker cleanup works on Bun (no stray containers)
- [ ] GitHub Actions CI has Bun test job
- [ ] Both Node.js and Bun test jobs pass in CI

**Outcomes:**

**✅ All tests pass on Bun**
- Decision: Proceed to Phase 3 (Docker Bun binary build)
- Next: Implement `build:standalone` Bun compilation step
- Timeline: ~1 hour for Docker build refactor

**❌ Tests fail on Bun only**
- Decision: Defer Phase 3, investigate Bun edge case
- Next: Debug failing test, document issue
- Rollback: Revert CI Bun job, stay on Node.js
- Risk: Low (CI remains passing, fallback available)

**❌ Tests fail on both**
- Decision: This indicates a code bug, not Bun-specific
- Next: Fix the failing test on Node.js first
- Then retry on Bun
- Expected: Failure on Node.js should identify root cause

---

## Summary of Phase 2

| Task | Status | Outcome |
|------|--------|---------|
| 1. Install Bun | Pending | Bun available locally and in CI |
| 2. Run tests on Bun | Pending | All tests pass on Bun runtime |
| 3. Add CI job | Pending | GitHub Actions test matrix includes Bun |
| 4. Decision | Gate | Decide: Proceed to Phase 3 or rollback? |

**Timeline**: ~1-2 hours (test runs locally, CI integration)

**Risk**: Low — parallel test job, both Node.js and Bun must pass, no blocking changes

**Next Phase**: Phase 3 — Docker Bun binary build (refactor Dockerfile, build standalone binary, optimize image size to 150-200MB)

