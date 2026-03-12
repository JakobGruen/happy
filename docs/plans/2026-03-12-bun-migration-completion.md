# Bun Migration — Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the Bun package manager migration across all parts of Happy Coder — update docs, verify all packages work with Bun, remove Yarn-only artifacts, and ensure smooth local development and production deployment.

**Architecture:** The migration is mostly complete at the package manager level (`bun@1.3.10` in root `package.json`, `bun.lock` present, `Dockerfile.server` using Bun standalone binary). Work remaining: (1) audit & fix all local dev scripts to use Bun CLI, (2) verify all packages build/run with Bun, (3) update all documentation, (4) clean up or deprecate old Yarn-based Dockerfile, (5) validate CI/CD.

**Tech Stack:** Bun 1.3.10, Node.js fallback detection, Bash shell scripts.

---

## Task 1: Update Root `CLAUDE.md` Package Manager Documentation

**Files:**
- Modify: `CLAUDE.md:69-92`

**Step 1: Read the current section**

Current text in CLAUDE.md says:
```
Package manager: `yarn` — never use npm.
...
Build & Dev Commands

```bash
# Build wire first (required on clean checkout before anything else)
yarn workspace @jakobgruen/happy-wire build
...
```

**Step 2: Replace package manager statement**

Replace at line 69:
```
Yarn 1.22 workspaces (no Turborepo/Lerna). Package manager: `yarn` — never use npm.
```

With:
```
Bun 1.3.10 workspaces (no Turborepo/Lerna). Package manager: `bun` — never use npm or yarn directly. Dev scripts auto-detect Bun/Yarn fallback.
```

**Step 3: Update Build & Dev Commands section (lines ~86-134)**

Replace entire "## Build & Dev Commands" section with:

````markdown
## Build & Dev Commands

```bash
# Build wire first (required on clean checkout before anything else)
bun run --filter @jakobgruen/happy-wire build

# CLI development (from repo root)
bun cli                              # dev-run CLI via tsx
bun cli codex                        # run in Codex mode

# App
bun run --filter happy-app start        # Expo dev server
bun run --filter happy-app ios          # iOS simulator
bun run --filter happy-app web          # web browser
bun web                              # shortcut for above
bun run --filter happy-app typecheck    # MUST run after changes

# Server
bun run --filter happy-server dev       # starts with .env + .env.dev, kills port 3005
bun run --filter happy-server db        # Docker postgres
bun run --filter happy-server redis     # Docker redis
bun run --filter happy-server generate  # Prisma client codegen

# Dev reset (rebuild + restart services)
bun dev:reset                        # full reset: install → wire → cli → daemon → server → metro
bun dev:reset -c -d                  # rebuild CLI + restart daemon
bun dev:reset -s                     # restart server only
bun dev:reset -m                     # reset Metro bundler only
bun dev:reset -i                     # reinstall dependencies only

# Metro watchdog (keeps Metro alive on crash)
bun metro:watchdog                   # auto-restart on crash or 10min inactivity
bun metro:watchdog 300               # auto-restart on 5min inactivity (pass timeout as arg)

# CLI with local server
cd packages/happy-cli && bun dev:local-server

# Tests
bun run --filter @jakobgruen/happy-wire test   # vitest
bun run --filter happy-coder test          # builds first, then vitest (daemon integration)
bun run --filter happy-server test         # vitest

# Release
bun release                          # interactive release picker (from root)

# Voice agent (Python, separate from Bun)
cd packages/happy-voice-agent && . .venv/bin/activate && python agent.py dev
```

**Note:** Scripts accept both `bun` and `yarn` commands for backward compatibility. The root `package.json` scripts and `dev-reset.sh` auto-detect the package manager. If you have an older Yarn installation, the fallback will use it; otherwise Bun is required for new development.
````

**Step 4: Update "Code Style" section to remove Yarn-only rule**

Replace line ~440 ("Use `yarn`, never `npm`") with:

```
Use `bun` commands in shell (never `npm`). Root scripts auto-detect Bun/Yarn.
```

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Bun package manager"
```

---

## Task 2: Verify Root `package.json` Scripts Use Bun

**Files:**
- Read: `package.json` (root)

**Step 1: Read and verify root scripts**

Run:
```bash
cat package.json | jq .scripts
```

Expected output shows:
```json
{
  "cli": "yarn workspace happy-coder cli",
  "release": "node ./scripts/release.cjs",
  "web": "yarn workspace happy-app web",
  "dev:reset": "bash scripts/dev-reset.sh",
  "metro:watchdog": "bash scripts/metro-watchdog.sh",
  "postinstall": "node ./scripts/postinstall.cjs"
}
```

These use `yarn workspace` which is **correct** — the scripts work with both Bun and Yarn because they call `yarn` directly. The `dev-reset.sh` handles the package manager auto-detection internally.

**Step 2: Verify auto-detection logic in `dev-reset.sh`**

The script at lines 74-86 already handles this:

```bash
# Detect package manager (Bun or Yarn)
if command -v bun &>/dev/null && [[ -f "$REPO_ROOT/bun.lock" ]]; then
    PM="bun"
    PM_INSTALL="bun install"
    PM_CACHE_CLEAN="bun pm cache rm"
    ws() { bun run --filter "$1" "${@:2}"; }
else
    PM="yarn"
    PM_INSTALL="yarn install"
    PM_CACHE_CLEAN="yarn cache clean"
    ws() { yarn workspace "$1" "${@:2}"; }
fi
```

This is **already correct** ✅ — no changes needed.

**Step 3: No commit needed** — already done

---

## Task 3: Test Local Dev Workflow with Bun

**Files:**
- Test: `dev-reset.sh`

**Step 1: Verify Bun is installed and accessible**

Run:
```bash
which bun && bun --version
```

Expected: Shows Bun version (should be 1.3.10 or later)

If not found, install Bun:
```bash
curl -fsSL https://bun.sh/install | bash
```

**Step 2: Verify `bun.lock` exists**

Run:
```bash
ls -lh bun.lock
```

Expected: File exists and is recent (timestamp within last few weeks)

**Step 3: Run dev-reset with wire build only (sanity check)**

Run:
```bash
./scripts/dev-reset.sh -w
```

Expected output:
```
> Building happy-wire
...
  ok: Wire built
```

**Step 4: Run full dev-reset with all steps (or subset if you want)**

Choose based on your machine:

**Full reset** (includes Metro, may take 5+ min):
```bash
./scripts/dev-reset.sh
```

**Minimal reset** (just install + wire + cli, fast):
```bash
./scripts/dev-reset.sh -i -w -c
```

Expected: No errors, all steps marked "ok"

**Step 5: Verify root scripts work via Bun**

Test individual commands:
```bash
bun cli --help              # Should show CLI help
bun release --help          # Should show release help (if implemented)
```

**Step 6: No commit** — this is verification only

---

## Task 4: Audit & Fix Package-Specific Build Scripts

**Files:**
- Audit: `packages/happy-wire/package.json`
- Audit: `packages/happy-cli/package.json`
- Audit: `packages/happy-server/package.json`
- Audit: `packages/happy-app/package.json`
- Audit: `packages/happy-agent/package.json`

**Step 1: Check each package for `yarn` or npm-specific scripts**

For each package.json, run:
```bash
cat packages/[PACKAGE]/package.json | jq .scripts
```

Look for:
- ❌ `yarn` commands (should use `bun run` or be package-manager-agnostic)
- ❌ `npm install` or `npm run` 
- ✅ `node`, `tsx`, `vitest`, `vite` (these are fine)

**Step 2: Document findings**

List any yarn/npm-specific scripts found. Most should be:
- `build` — ✅ (uses node, vite, typescript, etc.)
- `test` — ✅ (uses vitest, pytest)
- `dev` — ✅ (uses tsx, expo, vite)
- `generate` — ✅ (uses prisma, codegen tools)

If any script contains `yarn workspace` or `npm install`, those are internal to the package — need review.

**Step 3: Test a few critical builds with Bun**

```bash
# Wire
bun run --filter @jakobgruen/happy-wire build

# CLI
bun run --filter happy-coder build

# Server
bun run --filter happy-server build
```

Expected: All complete without errors

**Step 4: No commit** — this is audit only. Document findings in notes.

---

## Task 5: Verify Production Docker Build Uses Bun Standalone

**Files:**
- Read: `Dockerfile.server`

**Step 1: Confirm Dockerfile.server uses Bun**

Run:
```bash
head -5 Dockerfile.server
```

Expected:
```dockerfile
# Stage 1: install dependencies with workspace context
FROM oven/bun:1 AS deps
...
```

✅ Uses `oven/bun:1` image — **correct**

**Step 2: Verify standalone binary compilation**

Search in `Dockerfile.server` for the build command:

```bash
grep -A2 "RUN bun run --filter happy-server build" Dockerfile.server
```

Expected to find:
```dockerfile
RUN bun run --filter happy-server build:standalone
```

✅ Uses standalone build — **correct**

**Step 3: Verify final stage uses minimal runtime**

Check the final `FROM` line:

```bash
grep "^FROM" Dockerfile.server | tail -1
```

Expected: `FROM debian:bookworm-slim AS runner`

✅ Uses slim Debian, not node image — **correct**

**Step 4: No commit** — this is verification only

---

## Task 6: Mark Old Dockerfile as Deprecated (or Delete)

**Files:**
- Check: `Dockerfile` (the old Node.js version)

**Step 1: Determine if old Dockerfile is still used**

Check git history and CI config:

```bash
git log --oneline -n 20 -- Dockerfile | head -5
grep -r "Dockerfile[^.]" .github/ scripts/ docs/ | grep -v Dockerfile.server | grep -v Dockerfile.webapp
```

Look for references. If none exist:

**Step 2: Rename to show it's deprecated**

Option A — Rename to `Dockerfile.deprecated`:

```bash
mv Dockerfile Dockerfile.deprecated
```

Then commit:

```bash
git add Dockerfile.deprecated
git rm Dockerfile
git commit -m "chore: deprecate old Dockerfile (Node.js version superseded by Dockerfile.server)"
```

Option B — Delete completely:

```bash
git rm Dockerfile
git commit -m "chore: remove deprecated Dockerfile (replaced by Dockerfile.server with Bun standalone)"
```

**Choose based on:** Do you want to keep it for historical reference? If using Bun everywhere, delete is cleaner.

**Step 3: If renamed or deleted, verify CI doesn't break**

Run:
```bash
grep -r "docker build" .github/ | grep -v server | grep -v webapp
```

No results = good. If results exist, those CI steps need updating.

---

## Task 7: Update CI/CD Workflows for Bun

**Files:**
- Check: `.github/workflows/*.yml`

**Step 1: Find test workflow**

Run:
```bash
ls -la .github/workflows/
```

Look for `test.yml` or similar.

**Step 2: Verify test matrix includes Bun**

Open `.github/workflows/test.yml` and check that the test matrix has:

```yaml
strategy:
  matrix:
    runtime: [node, bun]
```

If it does, ✅ **already done**

If not, add it:

```yaml
strategy:
  matrix:
    runtime: [node, bun]
steps:
  - uses: oven-sh/setup-bun@v1
    if: matrix.runtime == 'bun'
  - run: bun install
    if: matrix.runtime == 'bun'
  - run: bun test
    if: matrix.runtime == 'bun'
```

**Step 3: Verify Docker build steps use Dockerfile.server**

Look for `docker build` steps:

```bash
grep -A3 "docker build" .github/workflows/*.yml
```

Expected:
```yaml
- name: Build Docker image
  run: docker build -f Dockerfile.server -t happy-server .
```

If it references old `Dockerfile`, update to `Dockerfile.server`.

**Step 4: Commit any changes**

```bash
git add .github/workflows/
git commit -m "ci: ensure test matrix and Docker build use Bun"
```

---

## Task 8: Update Deployment Docs for Bun

**Files:**
- Read: `docs/deployment.md`
- Modify: `docs/deployment.md` (if exists)

**Step 1: Check if deployment docs exist**

Run:
```bash
cat docs/deployment.md 2>/dev/null || echo "File doesn't exist"
```

**Step 2: If exists, add Bun note**

Add a section at the top:

```markdown
## Package Manager: Bun

This project uses **Bun 1.3.10** as the primary package manager. Production Docker image (`Dockerfile.server`) compiles to a standalone Bun binary, eliminating Node.js runtime dependency.

Local development auto-detects Bun or falls back to Yarn (`dev-reset.sh` handles both).
```

**Step 3: Update any `yarn` commands to `bun`**

Search for `yarn workspace` or `yarn install` in the file and replace with equivalent `bun` commands.

**Step 4: Commit**

```bash
git add docs/deployment.md
git commit -m "docs: update deployment for Bun migration"
```

---

## Task 9: Create Migration Summary in MEMORY.md

**Files:**
- Modify: `.serena/memories/MEMORY.md` (or equivalent project memory)

**Step 1: Add Bun migration entry**

Append to project memory:

```markdown
## Bun Migration (March 2026)

- **Status**: Completed
- **Scope**: Full package manager migration from Yarn 1.22 to Bun 1.3.10
- **Changes**:
  - `packageManager: bun@1.3.10` set in root `package.json`
  - `bun.lock` replaces `yarn.lock`
  - Production Docker (`Dockerfile.server`) uses Bun standalone binary (3-stage build)
  - Dev scripts (`dev-reset.sh`) auto-detect Bun/Yarn fallback
  - Documentation updated (CLAUDE.md, deployment docs)
  - Old Dockerfile deprecated/removed
- **Key files**: 
  - `scripts/dev-reset.sh` — auto-detection logic (lines 74-86)
  - `Dockerfile.server` — production build
  - `CLAUDE.md` — updated build commands
- **Verification**: All packages build with Bun, CI test matrix includes Bun, local dev works with both Bun and Yarn
```

**Step 2: Commit**

```bash
git add .serena/memories/MEMORY.md
git commit -m "doc: record Bun migration completion in project memory"
```

---

## Task 10: Final Verification Checklist

**No files to modify** — this is checklist only.

**Run these commands to verify everything works:**

```bash
# 1. Verify Bun installation
bun --version

# 2. Verify lock file
ls -l bun.lock

# 3. Quick install + wire build
./scripts/dev-reset.sh -i -w

# 4. CLI build
./scripts/dev-reset.sh -c

# 5. Test server build
bun run --filter happy-server build

# 6. Test app typecheck
bun run --filter happy-app typecheck

# 7. Verify old Dockerfile not in use
git status Dockerfile 2>/dev/null || echo "Old Dockerfile removed (good)"

# 8. Check CI config updated
grep "Dockerfile.server" .github/workflows/*.yml || echo "CI config not yet updated"
```

**Expected result**: All checks pass or show "completed" status.

**Step: Final commit summary**

Once all tasks complete, create a summary commit:

```bash
git log --oneline -n 10
```

Verify commits are in this order:
1. "docs: update CLAUDE.md for Bun package manager"
2. "chore: deprecate/remove old Dockerfile"
3. "ci: ensure test matrix and Docker build use Bun"
4. "docs: update deployment for Bun migration"
5. "doc: record Bun migration completion in project memory"

---

## Testing Strategy

**Unit Level**: None needed — this is a configuration/documentation migration.

**Integration Level**: 
- Test `dev-reset.sh` with various flags (`-w`, `-c`, `-s`, `-m`)
- Test individual package builds with `bun run --filter`
- Verify root scripts work (`bun cli --help`, `bun web`, etc.)

**End-to-End Level**:
- Full local dev setup with Metro running
- Session creation and basic messaging in app
- CLI daemon lifecycle (start, create session, stop)

**CI Level**:
- GitHub Actions test matrix runs on both Node and Bun
- Docker build completes and image size is verified (~450-500MB for slim variant)

---

## Success Criteria

✅ **Package Manager**: Bun is default, Yarn is fallback  
✅ **Documentation**: CLAUDE.md, deployment docs updated  
✅ **Local Dev**: `dev-reset.sh` works with Bun detection  
✅ **Builds**: All packages build with `bun run --filter`  
✅ **Docker**: `Dockerfile.server` produces standalone binary  
✅ **CI**: Test matrix includes Bun, Docker build uses Bun variant  
✅ **Old Artifacts**: Deprecated `Dockerfile` marked or removed  
✅ **Memory**: Migration recorded in project memory  

---

## Rollback Plan

If issues arise:

1. **Yarn still works**: Root scripts haven't changed, `dev-reset.sh` auto-detects Yarn
2. **Use old Dockerfile**: If you didn't delete it, it's still available
3. **CI rollback**: Remove Bun from test matrix, use Node only
4. **Revert commits**: Each task is atomic and can be reverted individually

All changes are non-destructive — Bun coexists with Yarn during this migration.
