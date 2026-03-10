import { Session } from './storageTypes';

export interface PendingPermissionItem {
    sessionId: string;
    session: Session;
    permissionId: string;
    tool: string;
    description?: string | null;
    llmSummary?: string | null;
    createdAt?: number | null;
    permissionSuggestions?: any[] | null;
}

/**
 * Pure function that builds a sorted queue of pending permission requests
 * from active, online sessions (excluding the currently viewed session).
 */
export function buildPermissionQueue(
    sessions: Record<string, Session>,
    viewingSessionId: string | null,
): PendingPermissionItem[] {
    const items: PendingPermissionItem[] = [];
    for (const session of Object.values(sessions)) {
        if (!session.active) continue;
        if (session.id === viewingSessionId) continue;
        if (session.presence !== 'online') continue;
        const requests = session.agentState?.requests;
        if (!requests) continue;
        for (const [permId, req] of Object.entries(requests)) {
            items.push({
                sessionId: session.id,
                session,
                permissionId: permId,
                tool: req.tool,
                description: req.description,
                llmSummary: req.llmSummary,
                createdAt: req.createdAt,
                permissionSuggestions: req.permissionSuggestions,
            });
        }
    }
    // Sort oldest first so user sees the most urgent request
    items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return items;
}

/**
 * Custom equality function for zustand selector.
 * Compares by permission IDs instead of object references,
 * preventing infinite re-render loops from useShallow.
 */
export function permissionQueueEqual(
    a: PendingPermissionItem[],
    b: PendingPermissionItem[],
): boolean {
    if (a.length !== b.length) return false;
    return a.every((item, i) => item.permissionId === b[i].permissionId);
}
