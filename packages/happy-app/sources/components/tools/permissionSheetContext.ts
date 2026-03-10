import { createContext, useContext } from 'react';

/**
 * Context that signals whether the SessionPermissionSheet is active
 * for the current session view. When true, PermissionFooter hides
 * its inline UI for Claude sessions (Codex sessions still render inline).
 */
export const PermissionSheetContext = createContext<boolean>(false);

export function useIsPermissionSheetActive(): boolean {
    return useContext(PermissionSheetContext);
}
