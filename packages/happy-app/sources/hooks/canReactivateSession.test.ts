import { describe, it, expect, vi } from 'vitest';

// Mock all transitive dependencies so we don't need zustand/react etc.
vi.mock('@/sync/storage', () => ({ useMachine: vi.fn() }));
vi.mock('@/sync/ops', () => ({ machineResumeSession: vi.fn() }));
vi.mock('@/hooks/useHappyAction', () => ({ useHappyAction: vi.fn(() => [false, vi.fn()]) }));
vi.mock('@/utils/errors', () => ({ HappyError: class extends Error {} }));
vi.mock('react', () => ({ default: {} }));

const { canReactivateSession } = await import('./useCanReactivateSession');

type SessionLike = Parameters<typeof canReactivateSession>[0];
type MachineLike = Parameters<typeof canReactivateSession>[1];

function makeSession(overrides: Partial<SessionLike> = {}): SessionLike {
    return {
        id: 'session-1',
        seq: 1,
        createdAt: 1000000,
        updatedAt: 1000000,
        active: false,
        activeAt: 1000000,
        metadata: {
            path: '/home/user/project',
            host: 'my-machine',
            machineId: 'machine-1',
            claudeSessionId: 'claude-session-abc',
            flavor: 'claude',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 900000, // offline — numeric timestamp
        ...overrides,
    } as SessionLike;
}

function makeMachine(overrides: Record<string, any> = {}): NonNullable<MachineLike> {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 1000000,
        updatedAt: 1000000,
        active: true,
        activeAt: 1000000,
        metadata: null,
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
        ...overrides,
    } as NonNullable<MachineLike>;
}

describe('canReactivateSession', () => {
    it('returns true when all conditions met', () => {
        expect(canReactivateSession(makeSession(), makeMachine())).toBe(true);
    });

    it('returns false when session is active', () => {
        expect(canReactivateSession(makeSession({ active: true }), makeMachine())).toBe(false);
    });

    it('returns false when session is online', () => {
        expect(canReactivateSession(makeSession({ presence: 'online' }), makeMachine())).toBe(false);
    });

    it('returns false when claudeSessionId is missing', () => {
        const session = makeSession();
        session.metadata!.claudeSessionId = undefined;
        expect(canReactivateSession(session, makeMachine())).toBe(false);
    });

    it('returns false when machineId is missing', () => {
        const session = makeSession();
        session.metadata!.machineId = undefined;
        expect(canReactivateSession(session, makeMachine())).toBe(false);
    });

    it('returns false when path is missing', () => {
        const session = makeSession();
        // @ts-expect-error — path is required in Metadata schema but we test the guard
        session.metadata!.path = undefined;
        expect(canReactivateSession(session, makeMachine())).toBe(false);
    });

    it('returns false when machine is null', () => {
        expect(canReactivateSession(makeSession(), null)).toBe(false);
    });

    it('returns false when machine is offline', () => {
        expect(canReactivateSession(makeSession(), makeMachine({ active: false }))).toBe(false);
    });

    it('returns false when flavor is codex', () => {
        const session = makeSession();
        session.metadata!.flavor = 'codex';
        expect(canReactivateSession(session, makeMachine())).toBe(false);
    });

    it('returns false when flavor is undefined', () => {
        const session = makeSession();
        session.metadata!.flavor = undefined;
        expect(canReactivateSession(session, makeMachine())).toBe(false);
    });

    it('returns false when metadata is null', () => {
        expect(canReactivateSession(makeSession({ metadata: null }), makeMachine())).toBe(false);
    });
});
