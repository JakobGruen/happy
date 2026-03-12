import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Hoisted test state and mocks ---
const mocks = vi.hoisted(() => {
    const sessions: Record<string, { id: string; accountId: string; active: boolean; lastActiveAt: Date }> = {};

    const dbMock = {
        session: {
            findUnique: vi.fn(async ({ where }: any) => {
                const session = sessions[where.id];
                if (!session || (where.accountId && session.accountId !== where.accountId)) {
                    return null;
                }
                return session;
            }),
            update: vi.fn(async ({ where, data }: any) => {
                const session = sessions[where.id];
                if (session) {
                    Object.assign(session, data);
                }
                return session;
            }),
        },
    };

    const emitEphemeralMock = vi.fn();
    const buildSessionActivityEphemeralMock = vi.fn(
        (sid: string, active: boolean, time: number, thinking: boolean) => ({
            type: 'session-activity',
            sid,
            active,
            time,
            thinking,
        })
    );

    return { sessions, dbMock, emitEphemeralMock, buildSessionActivityEphemeralMock };
});

vi.mock('@/storage/db', () => {
    // Diagnostic: confirm mock is being created
    return { db: mocks.dbMock };
});
vi.mock('@/app/events/eventRouter', () => ({
    eventRouter: { emitEphemeral: mocks.emitEphemeralMock },
    buildSessionActivityEphemeral: mocks.buildSessionActivityEphemeralMock,
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

// Import handler AFTER mocks are registered (using regular import, not dynamic)
import { sessionUpdateHandler } from './sessionUpdateHandler';

// Helper: extract a registered socket handler by event name
function extractHandler(eventName: string): (...args: any[]) => Promise<void> {
    const socketMock = createSocketMock();
    sessionUpdateHandler('user-1', socketMock as any, { connectionType: 'user-scoped' } as any);
    const call = socketMock.on.mock.calls.find((c: any) => c[0] === eventName);
    if (!call) throw new Error(`No handler registered for '${eventName}'`);
    return call[1];
}

function createSocketMock() {
    return { on: vi.fn(), id: 'test-socket' };
}

describe('session-start handler', () => {
    let handler: (...args: any[]) => Promise<void>;

    beforeEach(() => {
        handler = extractHandler('session-start');
        // Reset state
        for (const key of Object.keys(mocks.sessions)) {
            delete mocks.sessions[key];
        }
        mocks.sessions['s1'] = {
            id: 's1',
            accountId: 'user-1',
            active: false,
            lastActiveAt: new Date(0),
        };
        mocks.dbMock.session.findUnique.mockClear();
        mocks.dbMock.session.update.mockClear();
        mocks.emitEphemeralMock.mockClear();
        mocks.buildSessionActivityEphemeralMock.mockClear();
    });

    it('marks session as active', async () => {
        const now = Date.now();
        await handler({ sid: 's1', time: now });

        expect(mocks.dbMock.session.update).toHaveBeenCalledWith({
            where: { id: 's1' },
            data: { lastActiveAt: expect.any(Date), active: true },
        });
    });

    it('emits session activity ephemeral', async () => {
        const now = Date.now();
        await handler({ sid: 's1', time: now });

        expect(mocks.emitEphemeralMock).toHaveBeenCalledWith({
            userId: 'user-1',
            payload: expect.objectContaining({ type: 'session-activity', sid: 's1', active: true }),
            recipientFilter: { type: 'user-scoped-only' },
        });
    });

    it('clamps future timestamps to now', async () => {
        const futureTime = Date.now() + 60_000;
        await handler({ sid: 's1', time: futureTime });

        expect(mocks.dbMock.session.update).toHaveBeenCalled();
        const updateData = mocks.dbMock.session.update.mock.calls[0][0].data;
        expect(updateData.lastActiveAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('rejects stale timestamps older than 10 minutes', async () => {
        const staleTime = Date.now() - 11 * 60 * 1000;
        await handler({ sid: 's1', time: staleTime });

        expect(mocks.dbMock.session.findUnique).not.toHaveBeenCalled();
        expect(mocks.dbMock.session.update).not.toHaveBeenCalled();
    });

    it('rejects non-numeric time', async () => {
        await handler({ sid: 's1', time: 'not-a-number' });

        expect(mocks.dbMock.session.findUnique).not.toHaveBeenCalled();
        expect(mocks.dbMock.session.update).not.toHaveBeenCalled();
    });

    it('rejects session not owned by user', async () => {
        mocks.sessions['s1'].accountId = 'other-user';
        await handler({ sid: 's1', time: Date.now() });

        expect(mocks.dbMock.session.findUnique).toHaveBeenCalled();
        expect(mocks.dbMock.session.update).not.toHaveBeenCalled();
    });

    it('does nothing for non-existent session', async () => {
        await handler({ sid: 'nonexistent', time: Date.now() });

        expect(mocks.dbMock.session.update).not.toHaveBeenCalled();
        expect(mocks.emitEphemeralMock).not.toHaveBeenCalled();
    });
});
