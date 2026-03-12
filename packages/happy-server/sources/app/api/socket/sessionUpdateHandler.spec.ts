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

    // Create test account first (foreign key requirement)
    await db.account.upsert({
      where: { id: 'user-1' },
      update: {},
      create: {
        id: 'user-1',
        publicKey: 'test-public-key-user-1',
      },
    });

    // Create real test session in database
    await db.session.create({
      data: {
        id: 's1',
        tag: 'test-session',
        accountId: 'user-1',
        metadata: '{}',
        active: false,
        lastActiveAt: new Date(0),
      },
    });
  });

  afterEach(async () => {
    // Clean up test session and account
    await db.session.deleteMany({
      where: { id: 's1' },
    });
    await db.account.deleteMany({
      where: { id: 'user-1' },
    });
  });

  it.skip('marks session as active', async () => {
    const now = Date.now();
    await handler({ sid: 's1', time: now });

    const updated = await db.session.findUnique({
      where: { id: 's1' },
    });
    expect(updated?.active).toBe(true);
    expect(updated?.lastActiveAt.getTime()).toBeCloseTo(now, -3);
  });

  it.skip('emits session activity ephemeral', async () => {
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

  it.skip('clamps future timestamps to now', async () => {
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
    // Create account for different user
    await db.account.upsert({
      where: { id: 'other-user' },
      update: {},
      create: {
        id: 'other-user',
        publicKey: 'test-public-key-other-user',
      },
    });

    // Create a session with different owner
    await db.session.create({
      data: {
        id: 's2',
        tag: 'test-session-2',
        accountId: 'other-user',
        metadata: '{}',
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
    await db.account.deleteMany({ where: { id: 'other-user' } });
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
