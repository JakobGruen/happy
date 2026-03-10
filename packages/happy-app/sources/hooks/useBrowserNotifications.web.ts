import type { PendingPermissionItem } from '@/sync/permissionQueue';

export interface PermissionQueueDiff {
    toShow: PendingPermissionItem[];
    toClose: string[];
}

/**
 * Pure function that computes the diff between what's currently shown as OS
 * browser notifications and the latest permission queue state.
 *
 * - toShow: items in `current` that have not yet been shown (permissionId not in shownIds)
 * - toClose: permissionIds that were shown but are no longer in the queue
 */
export function diffPermissionQueue(
    shownIds: Set<string>,
    current: PendingPermissionItem[],
): PermissionQueueDiff {
    const currentIds = new Set(current.map((item) => item.permissionId));

    const toShow = current.filter((item) => !shownIds.has(item.permissionId));
    const toClose = [...shownIds].filter((id) => !currentIds.has(id));

    return { toShow, toClose };
}
