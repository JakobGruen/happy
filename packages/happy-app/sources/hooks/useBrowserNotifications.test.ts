import { describe, it, expect } from 'vitest';
import { diffPermissionQueue } from './useBrowserNotifications.web';
import type { PendingPermissionItem } from '@/sync/permissionQueue';

function makeItem(permissionId: string, overrides: Partial<PendingPermissionItem> = {}): PendingPermissionItem {
    return {
        sessionId: 'session-1',
        session: {} as any,
        permissionId,
        tool: 'Bash',
        description: null,
        createdAt: null,
        permissionSuggestions: null,
        ...overrides,
    };
}

describe('diffPermissionQueue', () => {
    it('returns new item in toShow when shownIds is empty', () => {
        const shownIds = new Set<string>();
        const current = [makeItem('perm-1')];

        const result = diffPermissionQueue(shownIds, current);

        expect(result.toShow).toHaveLength(1);
        expect(result.toShow[0].permissionId).toBe('perm-1');
        expect(result.toClose).toHaveLength(0);
    });

    it('returns disappeared item in toClose', () => {
        const shownIds = new Set(['perm-1']);
        const current: PendingPermissionItem[] = [];

        const result = diffPermissionQueue(shownIds, current);

        expect(result.toShow).toHaveLength(0);
        expect(result.toClose).toHaveLength(1);
        expect(result.toClose[0]).toBe('perm-1');
    });

    it('returns persisting item in neither list', () => {
        const shownIds = new Set(['perm-1']);
        const current = [makeItem('perm-1')];

        const result = diffPermissionQueue(shownIds, current);

        expect(result.toShow).toHaveLength(0);
        expect(result.toClose).toHaveLength(0);
    });

    it('handles multiple items across calls — new, disappeared, and persisting', () => {
        // Initially shown: perm-1, perm-2
        // Current queue: perm-2, perm-3
        // Expected: perm-3 in toShow, perm-1 in toClose, perm-2 in neither
        const shownIds = new Set(['perm-1', 'perm-2']);
        const current = [makeItem('perm-2'), makeItem('perm-3')];

        const result = diffPermissionQueue(shownIds, current);

        expect(result.toShow).toHaveLength(1);
        expect(result.toShow[0].permissionId).toBe('perm-3');
        expect(result.toClose).toHaveLength(1);
        expect(result.toClose[0]).toBe('perm-1');
    });

    it('returns all current items in toShow when nothing was previously shown', () => {
        const shownIds = new Set<string>();
        const current = [makeItem('perm-1'), makeItem('perm-2'), makeItem('perm-3')];

        const result = diffPermissionQueue(shownIds, current);

        expect(result.toShow).toHaveLength(3);
        expect(result.toClose).toHaveLength(0);
    });

    it('returns all previously shown in toClose when queue becomes empty', () => {
        const shownIds = new Set(['perm-1', 'perm-2', 'perm-3']);
        const current: PendingPermissionItem[] = [];

        const result = diffPermissionQueue(shownIds, current);

        expect(result.toShow).toHaveLength(0);
        expect(result.toClose).toHaveLength(3);
        expect(result.toClose).toContain('perm-1');
        expect(result.toClose).toContain('perm-2');
        expect(result.toClose).toContain('perm-3');
    });

    it('returns empty result when both shownIds and current are empty', () => {
        const shownIds = new Set<string>();
        const current: PendingPermissionItem[] = [];

        const result = diffPermissionQueue(shownIds, current);

        expect(result.toShow).toHaveLength(0);
        expect(result.toClose).toHaveLength(0);
    });

    it('preserves the full item object in toShow (not just id)', () => {
        const shownIds = new Set<string>();
        const item = makeItem('perm-42', { tool: 'Edit', description: 'some description' });
        const current = [item];

        const result = diffPermissionQueue(shownIds, current);

        expect(result.toShow[0]).toBe(item);
    });
});
