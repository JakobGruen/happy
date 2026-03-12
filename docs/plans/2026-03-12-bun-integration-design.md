# Bun Runtime Integration — Design Document

**Date**: 2026-03-12  
**Status**: Design Approved ✅  
**Author**: Jakob Grünwald  
**Approach**: Phased Bun Adoption (3 phases)

---

## Executive Summary

Integrate Bun JavaScript runtime into Happy Coder server to reduce Docker image size (700MB → 150-200MB), improve startup time, and leverage native TypeScript execution. Phased approach validates Bun at each step with rollback capability.

**Key decisions**:
- ✅ Production uses external PostgreSQL (not embedded PGlite)
- ✅ Developers use Bun for local development (like production)
- ✅ Tests run on Bun (catch runtime issues early)
- ✅ Docker builds Bun standalone binary (single executable, minimal runtime)

---

## Architecture Overview

### Current State
- Server runs: `tsx ./sources/main.ts` (TypeScript transpilation at runtime)
- Docker image: `node:20` base (180MB) + source files + build tools
- Startup: TypeScript → JavaScript transpilation on each start
- Dependency chain: Node.js → yarn → tsx → Fastify → PostgreSQL

### Target State (After Phase 3)
- Server runs: `/app/server` (pre-compiled Bun binary)
- Docker image: `debian:bookworm-slim` base (80MB) + single binary
- Startup: Direct execution, no transpilation
- Dependency chain: Bun binary → Fastify → PostgreSQL

### Migration Strategy: 3 Phases

**Phase 1 (Local Dev)**: Developers test Bun locally with `bun run dev`. Fast feedback loop catches edge cases early.

**Phase 2 (CI Testing)**: Run full test suite on Bun. Validates server works on Bun runtime. Both Node.js and Bun test jobs ensure compatibility.

**Phase 3 (Docker)**: Build Docker image with Bun standalone binary. Production deployment with optimized image size.

Each phase is independent. If issues emerge, rollback is instant (revert to tsx/Node.js).

---

## Design Sections

### Design Section 1: Architecture Overview ✅

**Runtime Migration Strategy**

The server currently starts via `tsx ./sources/main.ts` (TypeScript transpilation at runtime). We'll replace this with Bun's native TypeScript execution.

**Key constraint**: Production PostgreSQL remains external (not embedded PGlite). The Bun binary connects to PostgreSQL via Prisma, exactly like the current Node.js setup.

**Rollback**: At any phase, revert to `tsx` by removing Bun scripts and reverting Docker back to Node.js base image.

---

### Design Section 2: Phase 1 - Local Development ✅

**Goal**: Enable developers to test Bun locally, catch issues early with fast feedback.

**What changes**:
1. Add `bun run dev` script in `packages/happy-server/package.json`
2. Keep `yarn dev` (tsx) as fallback
3. Developers can opt-in: `bun run dev` OR `yarn dev`

**Testing locally**:
- Start the server: `bun run dev`
- Run requests to `/v1/health`, Socket.IO connections, etc.
- Expected: Server starts, connects to PostgreSQL, responds exactly like Node.js version

**Rollback**: Just run `yarn dev` (tsx) instead.

**Risk level**: Low — developers opt-in, can revert instantly.

---

### Design Section 3: Phase 2 - CI/Testing ✅

**Goal**: Validate that the full test suite passes on Bun runtime. Tests act as the safety net.

**What changes**:
1. Add Bun test job to CI pipeline (alongside Node.js tests)
2. Test command: `bun run test` (vitest runs on Bun)
3. No code changes — vitest works identically on Bun and Node.js

**Test matrix in CI**:
```yaml
strategy:
  matrix:
    runtime: [node, bun]
```

**Expected outcomes**:
- ✅ Tests pass on Bun → Server works on Bun
- ❌ Tests fail on Bun only → Bun edge case found, defer Phase 3
- ❌ Tests fail on both → Code bug, fix and retry

**Rollback**: Remove the Bun test job from CI, keep Node.js tests.

**Risk level**: Low — parallel test job, doesn't block main CI.

---

### Design Section 4: Phase 3 - Docker Production Binary ✅

**Goal**: Build production Docker image with compiled Bun binary. Zero TypeScript runtime dependency, faster startup.

**What changes**:
1. Docker Stage 1: Change base from `node:20` to `oven/bun:latest`
2. Build step: Replace `yarn workspace happy-server build` with `bun run build:standalone`
   - Compiles TypeScript → JavaScript
   - Bundles everything into `/repo/packages/happy-server/dist/server` (single executable)
3. Runtime stage: Change base from `node:20` to `debian:bookworm-slim` (minimal, ~80MB)
4. Copy only the binary and essential config (Prisma migrations)

**Expected outcome**:
- Final Docker image: ~150-200MB (vs current ~700MB with Node.js)
- Startup time: Faster (no TypeScript transpilation)
- Binary size: Single executable, all dependencies baked in

**Rollback**: Revert Dockerfile to use `node:20` base and `yarn workspace happy-server build` command.

**Risk level**: Low — only affects Docker builds, doesn't change code. Easy rollback.

---

### Design Section 5: Rollback & Risk Mitigation ✅

**Known Bun edge cases** (research findings):
1. **Async timing differences**: Bun's event loop may differ from Node.js in rare cases
   - *Mitigation*: Tests catch this (Phase 2)
2. **Module resolution**: Bun's ESM handling differs slightly from Node.js
   - *Mitigation*: Prisma is officially Bun-compatible, our server uses standard imports
3. **Build:standalone limitations**: Some edge cases with native modules (rare)
   - *Mitigation*: Happy Server uses pure JS (Fastify, Prisma, Socket.IO), no native modules

**Rollback strategy**:

| Phase | Issue | Rollback |
|-------|-------|----------|
| **1 (Dev)** | Developers hit Bun bugs | Keep using `yarn dev` (tsx), document issue |
| **2 (CI)** | Tests fail on Bun | Remove Bun test job, skip Phase 3, stay on Node.js |
| **3 (Docker)** | Binary doesn't start in prod | Revert Dockerfile, redeploy on Node.js, investigate |

**Exit criteria** (when to stop and roll back):
- ❌ Phase 1: Developers report blocker bugs (e.g., server won't start)
- ❌ Phase 2: Tests consistently fail on Bun (but pass on Node.js)
- ❌ Phase 3: Production binary crashes or doesn't connect to PostgreSQL

**Confidence level**: High — Bun is stable for server workloads. TypeScript, Prisma, Fastify all officially supported. Risk is low because we test before deploying.

---

## Implementation Order

1. **Phase 1**: Add `bun run dev` script (~2 hours)
   - Developers test locally, validate basic functionality
   - Wait 1-2 days for feedback
2. **Phase 2**: Add Bun test job to CI (~1 hour)
   - Run full test suite on Bun
   - Validate all tests pass
   - Decision point: Proceed to Phase 3 or rollback?
3. **Phase 3**: Update Dockerfile to use Bun binary (~1 hour)
   - Build Docker image
   - Test image locally
   - Deploy to production
   - Monitor for issues

**Total implementation**: ~4 hours of work spread over 3-5 days with validation gates.

---

## Success Criteria

✅ Phase 1: `bun run dev` starts the server, developers can connect and test  
✅ Phase 2: All vitest tests pass on Bun runtime  
✅ Phase 3: Docker image builds, binary starts, migrations run, connects to PostgreSQL  
✅ Post-deploy: Server handles real traffic, no crashes, same response times as Node.js

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Bun async timing differs from Node.js | Medium | Phase 2 tests validate; revert if needed |
| Build:standalone produces broken binary | Medium | Phase 1 validates on dev; Phase 3 has rollback |
| Production PostgreSQL connection fails | Low | Same Prisma setup as Node.js; tested in Phase 2 |
| Docker image size not as small as expected | Low | Accept and document; still smaller than Node.js |
| Developers resistant to Bun | Low | Keep `yarn dev` (tsx) as option; not forced |

---

## Decision Log

- ✅ **Approach**: Phased adoption (Phase 1 → 2 → 3)
- ✅ **Deployment model**: Production uses external PostgreSQL (not PGlite)
- ✅ **Dev workflow**: Developers use Bun (like production)
- ✅ **CI/Testing**: Run tests on Bun (catch runtime issues early)
- ✅ **Docker**: Build Bun standalone binary for production

---

**Next Step**: Invoke `superpowers:writing-plans` to create detailed implementation plan with step-by-step tasks.
