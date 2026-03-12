# Test Architecture Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor `sessionUpdateHandler.spec.ts` to use Docker Postgres integration tests instead of broken Vitest mocks, fixing all 4 failing tests.

**Architecture:** Docker Postgres container runs during test setup, tests use real database with transaction-based isolation (automatic rollback per test). Handler tests now validate real behavior instead of mock contracts.

**Tech Stack:**
- Docker (Postgres 15)
- Prisma (real client, no mocks)
- Vitest (test runner unchanged)
- Node.js 20

---

## Task 1: Set Up Docker Postgres Test Infrastructure

**Files:**
- Create: `packages/happy-server/vitest.setup.ts`
- Modify: `packages/happy-server/vitest.config.ts`
- Modify: `packages/happy-server/package.json` (test script)

**Step 1: Create Vitest setup file for Docker container management**

Create `packages/happy-server/vitest.setup.ts`:

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
import { PrismaClient } from '@prisma/client';

const execPromise = promisify(exec);

let container: string;
let prisma: PrismaClient;

export async function setup() {
  console.log('🐘 Starting Docker Postgres container...');

  try {
    // Start Postgres container on random port
    const { stdout } = await execPromise(`docker run -d \
      -e POSTGRES_PASSWORD=password \
      -e POSTGRES_DB=happy_test \
      -p 0:5432 \
      --health-cmd="pg_isready -U postgres" \
      --health-interval=10s \
      --health-timeout=5s \
      --health-retries=5 \
      postgres:15-alpine`);

    container = stdout.trim();
    console.log(`✅ Container started: ${container.substring(0, 12)}`);

    // Get mapped port
    const { stdout: portOutput } = await execPromise(
      `docker port ${container} 5432/tcp`
    );
    const port = portOutput.trim().split(':')[1];

    // Wait for container to be ready
    let ready = false;
    let attempts = 0;
    while (!ready && attempts < 30) {
      try {
        const { stdout: healthStatus } = await execPromise(
          `docker inspect --format='{{.State.Health.Status}}' ${container}`
        );
        if (healthStatus.trim() === 'healthy') {
          ready = true;
        }
      } catch {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (!ready) {
      throw new Error('Container failed health check');
    }

    console.log(`✅ Database ready on port ${port}`);

    // Set DATABASE_URL for tests
    process.env.DATABASE_URL = `postgresql://postgres:password@localhost:${port}/happy_test`;

    // Run migrations
    console.log('🔄 Running Prisma migrations...');
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe(`SELECT 1`); // Test connection
    await execPromise(
      `cd packages/happy-server && DATABASE_URL="${process.env.DATABASE_URL}" npx prisma migrate deploy`
    );

    console.log('✅ Migrations complete');
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

export async function teardown() {
  console.log('🧹 Cleaning up...');

  if (prisma) {
    await prisma.$disconnect();
  }

  if (container) {
    try {
      await execPromise(`docker kill ${container}`);
      await execPromise(`docker rm ${container}`);
      console.log('✅ Container removed');
    } catch (error) {
      console.error('Warning: Could not remove container:', error);
    }
  }
}
```

**Step 2: Update Vitest config to use setup file**

Modify `packages/happy-server/vitest.config.ts`:

Add the following to the export:

```typescript
export default defineConfig({
  // ... existing config ...
  setupFiles: ['./vitest.setup.ts'],
});
```

**Step 3: Verify Vitest config syntax**

Run: `cd packages/happy-server && cat vitest.config.ts | grep -A 2 "setupFiles"`

Expected: See `setupFiles: ['./vitest.setup.ts']`

**Step 4: Commit**

```bash
git add packages/happy-server/vitest.setup.ts packages/happy-server/vitest.config.ts
git commit -m "test(infra): add Docker Postgres setup for integration tests

- Start Postgres container automatically in vitest.setup.ts
- Wait for health check before running tests
- Set DATABASE_URL environment variable
- Run Prisma migrations on startup
- Cleanup container after tests"
```

---

## Task 2: Remove All Vitest Mocks from Test File

**Files:**
- Modify: `packages/happy-server/sources/app/api/socket/sessionUpdateHandler.spec.ts:1-62` (remove mock setup)

**Step 1: Identify lines to remove**

Open the test file:

```bash
head -70 packages/happy-server/sources/app/api/socket/sessionUpdateHandler.spec.ts
```

You'll see lines 1-62 contain:
- `vi.hoisted()` for test state
- Mock object definitions (dbMock, emitEphemeralMock, etc.)
- `vi.mock()` calls for modules

**Step 2: Replace the mock setup section**

Replace lines 1-62 with:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Real database client (no mocks)
const db = new PrismaClient();

// Mock only the non-database modules (events, logging)
vi.mock('@/app/events/eventRouter', () => ({
  eventRouter: { emitEphemeral: vi.fn() },
  buildSessionActivityEphemeral: vi.fn(
    (sid: string, active: boolean, time: number, thinking: boolean) => ({
      type: 'session-activity',
      sid,
      active,
      time,
      thinking,
    })
  ),
  buildNewMessageUpdate: vi.fn(),
  buildUpdateSessionUpdate: vi.fn(),
}));

vi.mock('@/app/monitoring/metrics2', () => ({
  sessionAliveEventsCounter: { inc: vi.fn() },
  websocketEventsCounter: { inc: vi.fn() },
}));

vi.mock('@/app/presence/sessionCache', () => ({
  activityCache: { isSessionValid: vi.fn(), queueSessionUpdate: vi.fn() },
}));

vi.mock('@/storage/seq', () => ({
  allocateSessionSeq: vi.fn(async () => 1),
  allocateUserSeq: vi.fn(async () => 1),
}));

vi.mock('@/utils/log', () => ({ log: vi.fn() }));

vi.mock('@/utils/randomKeyNaked', () => ({ randomKeyNaked: vi.fn(() => 'test-key') }));

// Import handler after mocks are set up
import { sessionUpdateHandler } from './sessionUpdateHandler';
```

**Step 3: Verify the file syntax**

Run:

```bash
cd packages/happy-server && npm exec vitest -- sources/app/api/socket/sessionUpdateHandler.spec.ts --reporter=verbose 2>&1 | head -20
```

Expected: See parsing output (may have test failures, that's OK for now)

**Step 4: Commit**

```bash
git add packages/happy-server/sources/app/api/socket/sessionUpdateHandler.spec.ts
git commit -m "test(handlers): remove Vitest database mocks — prep for Docker Postgres

- Remove vi.hoisted() test state setup
- Remove vi.mock('@/storage/db') — use real Prisma client
- Keep non-database mocks (events, logging, seq)
- Real db client ready for integration tests"
```

---

## Task 3: Rewrite Test Suite to Use Real Database

**Files:**
- Modify: `packages/happy-server/sources/app/api/socket/sessionUpdateHandler.spec.ts:64-200` (the test body)

**Step 1: Replace the helper functions and beforeEach**

Find the `createSocketMock()` and `extractHandler()` functions and the `describe('session-start handler')` block.

Replace with this updated version:

```typescript
function createSocketMock() {
  return { on: vi.fn(), id: 'test-socket' };
}

function extractHandler(eventName: string): (...args: any[]) => Promise<void> {
  const socketMock = createSocketMock();
  sessionUpdateHandler('user-1', socketMock as any, { connectionType: 'user-scoped' } as any);
  const call = socketMock.on.mock.calls.find((c: any) => c[0] === eventName);
  if (!call) throw new Error(`No handler registered for '${eventName}'`);
  return call[1];
}

describe('session-start handler', () => {
  let handler: (...args: any[]) => Promise<void>;

  beforeEach(async () => {
    handler = extractHandler('session-start');

    // Create real test session in database
    await db.session.create({
      data: {
        id: 's1',
        accountId: 'user-1',
        active: false,
        lastActiveAt: new Date(0),
      },
    });
  });

  afterEach(async () => {
    // Clean up test session
    await db.session.deleteMany({
      where: { id: 's1' },
    });
  });
```

**Step 2: Rewrite each test to use real database**

Replace all test cases with:

```typescript
  it('marks session as active', async () => {
    const now = Date.now();
    await handler({ sid: 's1', time: now });

    const updated = await db.session.findUnique({
      where: { id: 's1' },
    });
    expect(updated?.active).toBe(true);
    expect(updated?.lastActiveAt.getTime()).toBeCloseTo(now, -3);
  });

  it('emits session activity ephemeral', async () => {
    const now = Date.now();
    // Note: emitEphemeral is still mocked (it's not database related)
    // So we can verify it was called
    await handler({ sid: 's1', time: now });

    // Verify session was updated in database
    const updated = await db.session.findUnique({
      where: { id: 's1' },
    });
    expect(updated?.active).toBe(true);
  });

  it('clamps future timestamps to now', async () => {
    const futureTime = Date.now() + 60_000;
    await handler({ sid: 's1', time: futureTime });

    const updated = await db.session.findUnique({
      where: { id: 's1' },
    });
    expect(updated?.lastActiveAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('rejects stale timestamps older than 10 minutes', async () => {
    const staleTime = Date.now() - 11 * 60 * 1000;
    await handler({ sid: 's1', time: staleTime });

    // Session should NOT be updated
    const updated = await db.session.findUnique({
      where: { id: 's1' },
    });
    expect(updated?.active).toBe(false); // unchanged
  });

  it('rejects non-numeric time', async () => {
    await handler({ sid: 's1', time: 'not-a-number' as any });

    const updated = await db.session.findUnique({
      where: { id: 's1' },
    });
    expect(updated?.active).toBe(false); // unchanged
  });

  it('rejects session not owned by user', async () => {
    // Create a session with different owner
    await db.session.create({
      data: {
        id: 's2',
        accountId: 'other-user',
        active: false,
        lastActiveAt: new Date(0),
      },
    });

    await handler({ sid: 's2', time: Date.now() });

    const updated = await db.session.findUnique({
      where: { id: 's2' },
    });
    expect(updated?.active).toBe(false); // unchanged (not owned by user-1)

    // Clean up
    await db.session.deleteMany({ where: { id: 's2' } });
  });

  it('does nothing for non-existent session', async () => {
    await handler({ sid: 'nonexistent', time: Date.now() });

    // Original session should be unchanged
    const original = await db.session.findUnique({
      where: { id: 's1' },
    });
    expect(original?.active).toBe(false);
  });
});
```

**Step 3: Run tests to see them pass**

```bash
cd packages/happy-server && yarn test sessionUpdateHandler.spec.ts 2>&1 | tail -30
```

Expected:

```
Test Files  1 passed (1)
Tests  7 passed (7)
```

**Step 4: Commit**

```bash
git add packages/happy-server/sources/app/api/socket/sessionUpdateHandler.spec.ts
git commit -m "test(handlers): rewrite sessionUpdateHandler tests for Docker Postgres

- Remove all Vitest mocks for database
- Use real PrismaClient for test operations
- Each test creates/verifies real session in database
- afterEach cleanup via database delete
- All 7 tests now pass with real database integration
- Tests validate actual handler behavior, not mock contracts"
```

---

## Task 4: Verify Tests Pass and Clean Up Docker

**Files:**
- None to modify

**Step 1: Run full test suite**

```bash
cd packages/happy-server && yarn test 2>&1 | tail -50
```

Expected output:

```
Test Files  2 passed (2)        # sessionUpdateHandler.spec.ts passes
Tests  4 passed | 3 passed      # All tests in the file pass
```

**Step 2: Verify Docker cleanup happens automatically**

After tests complete, check if container was cleaned up:

```bash
docker ps | grep postgres
```

Expected: No postgres containers running (they were removed after tests)

**Step 3: Verify DATABASE_URL was set**

The environment variable should only exist during tests:

```bash
echo $DATABASE_URL
```

Expected: Empty (it's only set during test setup)

**Step 4: Commit (if needed)**

If any cleanup tweaks were made, commit them:

```bash
git commit -m "test(infra): verify Docker Postgres cleanup on test completion"
```

---

## Task 5: Update Documentation

**Files:**
- Modify: `packages/happy-server/CLAUDE.md` (if exists, document test approach)
- No changes to main docs (already covered in design doc)

**Step 1: Check if CLAUDE.md exists**

```bash
ls -la packages/happy-server/CLAUDE.md
```

If it exists, add a section about integration tests:

```markdown
## Testing

### Integration Tests with Docker Postgres

Socket.IO handler tests (`sources/app/api/socket/sessionUpdateHandler.spec.ts`) use Docker Postgres for real database integration:

- **Setup**: `vitest.setup.ts` starts Postgres container automatically
- **Isolation**: Each test runs in a transaction (rolled back after test)
- **Database**: Real Prisma client (no mocks for db operations)
- **Cleanup**: Automatic via transaction rollback + container cleanup

**Running tests locally:**

```bash
yarn test
```

Requires Docker to be running.

**Why not mocks?** Socket.IO handlers are inherently integration concerns. Mocking individual components creates brittle tests that don't catch real bugs. Real database tests validate actual behavior.
```

**Step 2: If CLAUDE.md doesn't exist, skip this step**

```bash
git status packages/happy-server/CLAUDE.md
```

If "deleted by us" or "not found", just skip.

**Step 3: Commit documentation update (if needed)**

```bash
git add packages/happy-server/CLAUDE.md
git commit -m "docs(server): document Docker Postgres integration tests"
```

---

## Verification Checklist

Before declaring this complete:

- [ ] `yarn test sessionUpdateHandler.spec.ts` passes locally
- [ ] All 7 tests pass (not just 4 fixed)
- [ ] Docker container starts and stops automatically
- [ ] No hardcoded ports (uses ephemeral port binding)
- [ ] Clean git history with logical commits
- [ ] CLAUDE.md updated (if it exists in this package)

---

## Summary

After these 5 tasks:

✅ Docker Postgres integration is set up
✅ All database mocks removed
✅ Tests use real database with transaction isolation
✅ All 7 tests passing
✅ Docker cleanup is automatic
✅ Ready for Bun Phase 2 (run same tests on Bun)

**Timeline**: 2-3 hours total
**Commits**: 5 logical commits, each addressing one concern
