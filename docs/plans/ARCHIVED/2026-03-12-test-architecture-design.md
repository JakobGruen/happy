# Test Architecture Redesign — Integration Tests with Docker Postgres

**Date**: 2026-03-12
**Status**: Design Approved ✅
**Author**: Jakob Grünwald
**Objective**: Fix failing Socket.IO handler tests by replacing mocks with real database integration

---

## Executive Summary

The `sessionUpdateHandler.spec.ts` test suite has 4 failing tests caused by broken Vitest mock setup. Instead of debugging the mock infrastructure, redesign tests to use **integration testing with Docker Postgres** — real database operations in isolated transactions. This approach:

- ✅ Eliminates mock complexity entirely
- ✅ Tests real behavior (constraints, triggers, database state)
- ✅ Perfect isolation (automatic transaction rollback per test)
- ✅ Unblocks Bun Phase 2 (run same tests on Bun runtime)

**Timeline**: ~2-3 hours (refactor test file + Docker setup)

---

## Problem Statement

**Current state:**
- `sessionUpdateHandler.spec.ts` uses Vitest `vi.mock()` to mock the database
- Mocks are not being applied to the handler code (root cause: scope/closure issues)
- All 4 tests fail because handler never calls mocked database functions
- Tests have been failing since commit 0e65d643 (never passed)

**Why mocks failed:**
- Vitest mock registration happens at module parse time, before imports fully resolve
- Handler's database calls don't use mocked `db` object
- Debugging the mock scope/closure issues required architectural changes with unclear root cause

**Why integration testing is better:**
- Socket.IO handlers are inherently integration concerns (they depend on database, events, sockets)
- Mocking individual components creates brittle tests that don't catch real bugs
- Real database tests validate actual behavior, not mock contract

---

## Design Sections

### Design Section 1: Test Architecture

**Core mechanism: Transaction-based isolation**

Each test runs in its own database transaction that rolls back after completion:

```
beforeAll:
  ├─ Start Docker Postgres container
  ├─ Run Prisma migrations
  └─ Ready for tests

each test:
  ├─ CREATE SAVEPOINT (start transaction)
  ├─ Create test data in database
  ├─ Run handler with real database access
  ├─ Verify database state changed
  └─ ROLLBACK TO SAVEPOINT (cleanup)

afterAll:
  ├─ Stop Docker container
  └─ Cleanup
```

**Benefits:**
- **Isolation**: Each test's data is invisible to other tests
- **Cleanup**: Automatic via transaction rollback (no manual cleanup code)
- **Real behavior**: Tests validate actual database constraints, triggers, indexes
- **Simplicity**: No mocking infrastructure to maintain

**Testing pattern:**

```typescript
describe('session-start handler', () => {
  let db: PrismaClient;
  let handler: (...args: any[]) => Promise<void>;

  beforeAll(async () => {
    // Start Docker Postgres, run migrations
    db = new PrismaClient({ datasourceUrl: 'postgresql://...' });
    // ... migration setup
  });

  beforeEach(async () => {
    // Create real test session in database
    await db.session.create({
      data: {
        id: 's1',
        accountId: 'user-1',
        active: false,
        lastActiveAt: new Date(0),
      },
    });

    // Extract real handler (Socket.IO registration)
    handler = extractHandler('session-start');
  });

  it('marks session as active', async () => {
    const now = Date.now();

    // Call handler with real database
    await handler({ sid: 's1', time: now });

    // Verify real database was updated
    const updated = await db.session.findUnique({
      where: { id: 's1' },
    });
    expect(updated.active).toBe(true);
    expect(updated.lastActiveAt.getTime()).toBeCloseTo(now, -3); // within 1s
  });

  afterAll(async () => {
    await db.$disconnect();
  });
});
```

---

### Design Section 2: Local Development + CI Setup

**Local testing:**
- `yarn workspace happy-server test` triggers test setup
- Docker Postgres container starts automatically (via `beforeAll`)
- Tests run against real database
- Container stops after tests finish
- Requires Docker installed locally

**CI/GitHub Actions:**
- Same test command works identically
- GitHub Actions CI includes `services: postgres` for database
- No extra CI configuration needed (uses standard test runner)

**Database connection:**
- Local: `postgresql://postgres:password@localhost:5432/happy_test`
- CI: Uses `services.postgres` hostname
- Both: Prisma client connects via `DATABASE_URL` environment variable

**Dependency:**
- ✅ Docker available locally (already required for server dev)
- ✅ Docker available in CI (GitHub Actions supports this)

---

### Design Section 3: Test Refactoring (sessionUpdateHandler.spec.ts)

**Changes:**
1. **Remove all mocks**: Delete `vi.mock('@/storage/db')` and related mock setup
2. **Import real Prisma**: `import { db } from '@/storage/db'`
3. **Create test data**: Use `db.session.create()` instead of mock state
4. **Verify database state**: Query database to confirm handler made changes

**Before (broken mocks):**
```typescript
const dbMock = {
  session: {
    findUnique: vi.fn(async ({ where }: any) => { ... }),
    update: vi.fn(async ({ where, data }: any) => { ... }),
  },
};
vi.mock('@/storage/db', () => ({ db: dbMock }));
```

**After (real database):**
```typescript
import { db } from '@/storage/db';

beforeEach(async () => {
  await db.session.create({ data: { id: 's1', ... } });
});

it('marks session as active', async () => {
  await handler({ sid: 's1', time: Date.now() });
  const updated = await db.session.findUnique({ where: { id: 's1' } });
  expect(updated.active).toBe(true);
});
```

**Test count:** 7 tests (all currently in the file)
- ✅ marks session as active
- ✅ emits session activity ephemeral
- ✅ clamps future timestamps to now
- ✅ rejects stale timestamps older than 10 minutes
- ✅ rejects non-numeric time
- ✅ rejects session not owned by user
- ✅ does nothing for non-existent session

**Expected result:** All 7 tests pass with real database

---

### Design Section 4: Error Handling & Edge Cases

**Docker container startup failure:**
- If `docker run` fails, test suite fails immediately
- Developer sees clear error: "Could not start Postgres container"
- Fallback: Manually start Docker, retry

**Database connection failure:**
- If Prisma can't connect after container starts, test suite fails
- Clear error: "Connection to database failed"
- Cause: Usually port 5432 already in use

**Transaction rollback failure:**
- Extremely rare (Postgres database corruption)
- If savepoint fails, test fails with clear error
- No silent data leaks

**Concurrent test runs:**
- Tests are completely isolated (each in own transaction)
- Multiple test suites can run simultaneously (separate containers)
- No race conditions or data conflicts

---

### Design Section 5: Success Criteria & Validation

**Implementation complete when:**

✅ Docker Postgres container starts automatically in `beforeAll`
✅ Prisma migrations run on container startup
✅ All 7 tests pass on Node.js
✅ Test data cleanup is automatic (transaction rollback)
✅ Tests run identically locally and in CI
✅ Ready to run same tests on Bun (Phase 2)

**Validation steps:**
1. Local: `yarn workspace happy-server test` passes
2. CI: GitHub Actions test job passes
3. Bun: `bun run test` passes (Phase 2 gate)

---

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Docker not available locally | Medium | Document Docker install; provide fallback manual setup instructions |
| Port 5432 in use | Low | Container auto-selects unused port (uses ephemeral port binding) |
| Slow test execution | Low | Transaction rollback is fast; tests still complete in <1s each |
| Database state leaks between tests | Very Low | Savepoint rollback ensures perfect isolation |
| CI Docker not available | Low | GitHub Actions supports `services.postgres` out-of-box |

---

## Next Step

✅ Design approved
➡️ Invoke `superpowers:writing-plans` to create detailed implementation plan with step-by-step tasks
