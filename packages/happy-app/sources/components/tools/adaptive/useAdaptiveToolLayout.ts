import { useMemo } from 'react';
import { useIsPermissionSheetActive } from '../permissionSheetContext';

export interface LayoutConfig {
    /** Should output be hidden (e.g., in permission modals) */
    hideOutput: boolean;
    /** Should content be expanded by default or minimized */
    expandByDefault: boolean;
    /** Show preview text in minimized state */
    showPreview: boolean;
    /** Use tabs for input/output or stack layout */
    useTabs: boolean;
}

export interface ContextInfo {
    isInPermissionModal: boolean;
    isPermissionPending: boolean;
    toolState: 'running' | 'completed' | 'error';
}

/**
 * Determines adaptive layout based on context
 * Chat view: minimized by default, expandable
 * Permission modal: input expanded, output hidden
 */
export function useAdaptiveToolLayout(context: ContextInfo): LayoutConfig {
    const isSheetActive = useIsPermissionSheetActive();

    return useMemo(() => {
        const inPermission = context.isInPermissionModal || (isSheetActive && context.isPermissionPending);

        return {
            // Permission modals never show output (user must allow/deny without seeing it)
            hideOutput: inPermission,

            // Permission modals show details; chat shows minimized by default
            expandByDefault: inPermission,

            // Chat view shows preview; permission view doesn't need preview
            showPreview: !inPermission,

            // Always use tabs for consistency
            useTabs: true,
        };
    }, [context.isInPermissionModal, context.isPermissionPending, isSheetActive]);
}
