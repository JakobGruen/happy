import { describe, it, expect, vi } from 'vitest';

// Mock all transitive dependencies so we don't need expo/react etc.
vi.mock('expo-notifications', () => ({ addNotificationResponseReceivedListener: vi.fn() }));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('@/sync/ops', () => ({ sessionAllow: vi.fn(), sessionDeny: vi.fn() }));
vi.mock('react', () => ({ useEffect: vi.fn() }));

const { mapNotificationAction } = await import('./useNotificationActions');

describe('mapNotificationAction', () => {
    const baseData = { sessionId: 'sess-1', requestId: 'req-1', tool: 'Bash', type: 'permission_request' };

    it('returns allow action for ALLOW identifier', () => {
        const result = mapNotificationAction('ALLOW', baseData);
        expect(result).toEqual({ type: 'allow', sessionId: 'sess-1', requestId: 'req-1' });
    });

    it('returns deny action for DENY identifier', () => {
        const result = mapNotificationAction('DENY', baseData);
        expect(result).toEqual({ type: 'deny', sessionId: 'sess-1', requestId: 'req-1' });
    });

    it('returns navigate action for default tap (expo DEFAULT_ACTION_IDENTIFIER)', () => {
        const result = mapNotificationAction('expo.modules.notifications.actions.DEFAULT', baseData);
        expect(result).toEqual({ type: 'navigate', sessionId: 'sess-1' });
    });

    it('returns null for missing sessionId', () => {
        const result = mapNotificationAction('ALLOW', { requestId: 'req-1', tool: 'Bash', type: 'permission_request' });
        expect(result).toBeNull();
    });

    it('returns null for missing requestId on allow/deny', () => {
        const result = mapNotificationAction('ALLOW', { sessionId: 'sess-1', tool: 'Bash', type: 'permission_request' });
        expect(result).toBeNull();
    });

    it('returns navigate even without requestId (body tap only needs sessionId)', () => {
        const result = mapNotificationAction('expo.modules.notifications.actions.DEFAULT', { sessionId: 'sess-1' });
        expect(result).toEqual({ type: 'navigate', sessionId: 'sess-1' });
    });
});
