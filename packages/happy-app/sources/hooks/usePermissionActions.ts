import { useState, useCallback } from 'react';
import { sessionAllow, sessionDeny } from '@/sync/ops';
import { storage } from '@/sync/storage';

/**
 * Encapsulates all permission RPC dispatch logic.
 * Shared between PermissionSheet (compact + expanded) and PermissionFooter.
 *
 * Handles: allow once, suggestion-based allow, deny (with optional feedback),
 * legacy "allow all edits" and "allow for session" modes,
 * plus ExitPlanMode side-effects on local permission state.
 */
export interface UsePermissionActionsResult {
    loadingKey: string | null;
    handleAllowOnce: () => Promise<void>;
    handleSuggestion: (index: number, suggestion: any) => Promise<void>;
    handleDeny: (reason?: string) => Promise<void>;
    handleApproveAllEdits: () => Promise<void>;
    handleApproveForSession: () => Promise<void>;
}

export function usePermissionActions(
    sessionId: string,
    permissionId: string | null,
    toolName: string,
    toolInput: any,
    isPending: boolean,
): UsePermissionActionsResult {
    const [loadingKey, setLoadingKey] = useState<string | null>(null);
    const isAnyLoading = loadingKey !== null;

    const handleAllowOnce = useCallback(async () => {
        if (!isPending || isAnyLoading || !permissionId) return;
        setLoadingKey('allow-once');
        try {
            const isExitPlan = toolName === 'exit_plan_mode' || toolName === 'ExitPlanMode';
            await sessionAllow(sessionId, permissionId, isExitPlan ? 'default' : undefined);
            if (isExitPlan) {
                storage.getState().updateSessionPermissionMode(sessionId, 'default');
            }
        } catch (error) {
            console.error('Failed to approve permission:', error);
        } finally {
            setLoadingKey(null);
        }
    }, [sessionId, permissionId, toolName, isPending, isAnyLoading]);

    const handleSuggestion = useCallback(async (index: number, suggestion: any) => {
        if (!isPending || isAnyLoading || !permissionId) return;
        setLoadingKey(`suggestion-${index}`);
        try {
            const mode = suggestion.type === 'setMode' ? suggestion.mode : undefined;
            if (suggestion.type === 'setMode' && mode) {
                storage.getState().updateSessionPermissionMode(sessionId, mode);
            }
            await sessionAllow(sessionId, permissionId, mode, undefined, undefined, undefined, [suggestion]);
        } catch (error) {
            console.error('Failed to approve with suggestion:', error);
        } finally {
            setLoadingKey(null);
        }
    }, [sessionId, permissionId, isPending, isAnyLoading]);

    const handleDeny = useCallback(async (reason?: string) => {
        if (!isPending || isAnyLoading || !permissionId) return;
        setLoadingKey('deny');
        try {
            await sessionDeny(sessionId, permissionId, undefined, undefined, undefined, reason);
        } catch (error) {
            console.error('Failed to deny permission:', error);
        } finally {
            setLoadingKey(null);
        }
    }, [sessionId, permissionId, isPending, isAnyLoading]);

    const handleApproveAllEdits = useCallback(async () => {
        if (!isPending || isAnyLoading || !permissionId) return;
        setLoadingKey('all-edits');
        try {
            await sessionAllow(sessionId, permissionId, 'acceptEdits');
            storage.getState().updateSessionPermissionMode(sessionId, 'acceptEdits');
        } catch (error) {
            console.error('Failed to approve all edits:', error);
        } finally {
            setLoadingKey(null);
        }
    }, [sessionId, permissionId, isPending, isAnyLoading]);

    const handleApproveForSession = useCallback(async () => {
        if (!isPending || isAnyLoading || !permissionId) return;
        setLoadingKey('for-session');
        try {
            let toolIdentifier = toolName;
            if (toolName === 'Bash' && toolInput?.command) {
                toolIdentifier = `Bash(${toolInput.command})`;
            }
            await sessionAllow(sessionId, permissionId, undefined, [toolIdentifier]);
        } catch (error) {
            console.error('Failed to approve for session:', error);
        } finally {
            setLoadingKey(null);
        }
    }, [sessionId, permissionId, toolName, toolInput, isPending, isAnyLoading]);

    return {
        loadingKey,
        handleAllowOnce,
        handleSuggestion,
        handleDeny,
        handleApproveAllEdits,
        handleApproveForSession,
    };
}
