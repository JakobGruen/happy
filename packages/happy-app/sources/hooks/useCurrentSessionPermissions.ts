import { useMemo } from 'react';
import { useSession } from '@/sync/storage';

/**
 * A single pending permission request for the currently viewed session.
 * Richer than PendingPermissionItem — includes toolInput for expanded sheet display.
 */
export interface CurrentSessionPermissionItem {
    permissionId: string;
    tool: string;
    toolInput: any;
    description: string | null;
    llmSummary: string | null;
    permissionSuggestions: any[] | null;
    decisionReason: string | null;
    createdAt: number | null;
}

export interface UseCurrentSessionPermissionsResult {
    /** All pending permissions sorted oldest-first */
    permissions: CurrentSessionPermissionItem[];
    /** The first (oldest) pending permission, or null */
    firstPermission: CurrentSessionPermissionItem | null;
    /** Total count of pending permissions */
    queueCount: number;
}

/**
 * Selector hook for the currently viewed session's pending permission requests.
 * Reads from session.agentState.requests and returns a sorted array.
 *
 * Unlike buildPermissionQueue (cross-session, excludes viewed session),
 * this hook targets exactly one session for the permission sheet.
 */
export function useCurrentSessionPermissions(sessionId: string): UseCurrentSessionPermissionsResult {
    const session = useSession(sessionId);
    const requests = session?.agentState?.requests;

    return useMemo(() => {
        if (!requests) {
            return { permissions: [], firstPermission: null, queueCount: 0 };
        }

        const items: CurrentSessionPermissionItem[] = Object.entries(requests).map(
            ([permId, req]) => ({
                permissionId: permId,
                tool: req.tool,
                toolInput: req.arguments,
                description: req.description ?? null,
                llmSummary: req.llmSummary ?? null,
                permissionSuggestions: req.permissionSuggestions ?? null,
                decisionReason: req.decisionReason ?? null,
                createdAt: req.createdAt ?? null,
            }),
        );

        // Sort oldest first — most urgent request appears first
        items.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

        return {
            permissions: items,
            firstPermission: items[0] ?? null,
            queueCount: items.length,
        };
    }, [requests]);
}
