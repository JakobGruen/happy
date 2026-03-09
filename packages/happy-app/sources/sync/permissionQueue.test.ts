import { describe, expect, it } from 'vitest';
import { buildPermissionQueue, permissionQueueEqual } from './permissionQueue';
import { Session } from './storageTypes';

function makeSession(overrides: Partial<Session> & { id: string }): Session {
    return {
        seq: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        active: true,
        activeAt: Date.now(),
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        ...overrides,
    };
}

describe('buildPermissionQueue', () => {
    it('returns empty array when no sessions have requests', () => {
        const sessions: Record<string, Session> = {
            s1: makeSession({ id: 's1' }),
            s2: makeSession({ id: 's2' }),
        };
        expect(buildPermissionQueue(sessions, null)).toEqual([]);
    });

    it('collects pending requests from active online sessions', () => {
        const sessions: Record<string, Session> = {
            s1: makeSession({
                id: 's1',
                agentState: {
                    requests: {
                        'perm-1': { tool: 'Bash', createdAt: 100, description: 'run tests' },
                        'perm-2': { tool: 'Edit', createdAt: 200, description: 'edit file' },
                    },
                },
            }),
        };
        const result = buildPermissionQueue(sessions, null);
        expect(result).toHaveLength(2);
        expect(result[0].permissionId).toBe('perm-1');
        expect(result[1].permissionId).toBe('perm-2');
    });

    it('sorts by createdAt ascending (oldest first)', () => {
        const sessions: Record<string, Session> = {
            s1: makeSession({
                id: 's1',
                agentState: {
                    requests: {
                        'late': { tool: 'Bash', createdAt: 999 },
                        'early': { tool: 'Edit', createdAt: 1 },
                    },
                },
            }),
        };
        const result = buildPermissionQueue(sessions, null);
        expect(result[0].permissionId).toBe('early');
        expect(result[1].permissionId).toBe('late');
    });

    it('excludes the currently viewed session', () => {
        const sessions: Record<string, Session> = {
            s1: makeSession({
                id: 's1',
                agentState: {
                    requests: { 'perm-1': { tool: 'Bash', createdAt: 100 } },
                },
            }),
        };
        expect(buildPermissionQueue(sessions, 's1')).toEqual([]);
    });

    it('excludes inactive sessions', () => {
        const sessions: Record<string, Session> = {
            s1: makeSession({
                id: 's1',
                active: false,
                agentState: {
                    requests: { 'perm-1': { tool: 'Bash', createdAt: 100 } },
                },
            }),
        };
        expect(buildPermissionQueue(sessions, null)).toEqual([]);
    });

    it('excludes offline sessions', () => {
        const sessions: Record<string, Session> = {
            s1: makeSession({
                id: 's1',
                presence: 1234567890, // timestamp = offline
                agentState: {
                    requests: { 'perm-1': { tool: 'Bash', createdAt: 100 } },
                },
            }),
        };
        expect(buildPermissionQueue(sessions, null)).toEqual([]);
    });
});

describe('permissionQueueEqual', () => {
    it('returns true for two empty arrays', () => {
        expect(permissionQueueEqual([], [])).toBe(true);
    });

    it('returns false for different lengths', () => {
        const a = [{ permissionId: '1' }];
        const b: any[] = [];
        expect(permissionQueueEqual(a as any, b as any)).toBe(false);
    });

    it('returns true when same permission IDs in same order', () => {
        const a = [{ permissionId: '1' }, { permissionId: '2' }];
        const b = [{ permissionId: '1' }, { permissionId: '2' }];
        expect(permissionQueueEqual(a as any, b as any)).toBe(true);
    });

    it('returns false when permission IDs differ', () => {
        const a = [{ permissionId: '1' }];
        const b = [{ permissionId: '2' }];
        expect(permissionQueueEqual(a as any, b as any)).toBe(false);
    });

    it('returns false when same IDs in different order', () => {
        const a = [{ permissionId: '1' }, { permissionId: '2' }];
        const b = [{ permissionId: '2' }, { permissionId: '1' }];
        expect(permissionQueueEqual(a as any, b as any)).toBe(false);
    });

    it('considers identical queues built from same state as equal', () => {
        const sessions: Record<string, Session> = {
            s1: makeSession({
                id: 's1',
                agentState: {
                    requests: {
                        'perm-1': { tool: 'Bash', createdAt: 100 },
                        'perm-2': { tool: 'Edit', createdAt: 200 },
                    },
                },
            }),
        };
        const result1 = buildPermissionQueue(sessions, null);
        const result2 = buildPermissionQueue(sessions, null);
        // These are different object references but should be considered equal
        expect(result1).not.toBe(result2); // different references
        expect(permissionQueueEqual(result1, result2)).toBe(true); // but semantically equal
    });
});
