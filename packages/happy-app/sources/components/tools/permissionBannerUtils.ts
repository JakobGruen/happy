import { ToolCall } from '@/sync/typesMessage';
import { PendingPermissionItem } from '@/sync/permissionQueue';
import { CurrentSessionPermissionItem } from '@/hooks/useCurrentSessionPermissions';

/**
 * Builds a synthetic ToolCall from a cross-session PendingPermissionItem.
 * Used by PermissionBanner to feed the same ToolModal used for in-session permissions.
 */
export function buildSyntheticToolCall(item: PendingPermissionItem): ToolCall {
    return {
        name: item.tool,
        state: 'running',
        input: item.toolInput ?? {},
        createdAt: item.createdAt ?? Date.now(),
        startedAt: null,
        completedAt: null,
        description: item.description ?? null,
        result: undefined,
        permission: {
            id: item.permissionId,
            status: 'pending',
            permissionSuggestions: item.permissionSuggestions ?? undefined,
            description: item.description ?? undefined,
        },
    };
}

/**
 * Builds a CurrentSessionPermissionItem from a PendingPermissionItem.
 * Used to pass permission data to ToolModal and PermissionActionBar.
 */
export function buildPermissionItem(item: PendingPermissionItem): CurrentSessionPermissionItem {
    return {
        permissionId: item.permissionId,
        tool: item.tool,
        toolInput: item.toolInput,
        description: item.description ?? null,
        llmSummary: item.llmSummary ?? null,
        permissionSuggestions: item.permissionSuggestions ?? null,
        decisionReason: null,
        createdAt: item.createdAt ?? null,
    };
}
