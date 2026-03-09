import * as React from 'react';
import { usePathname } from 'expo-router';
import { storage } from '@/sync/storage';

/**
 * Tracks which session the user is currently viewing by reading the URL pathname.
 * Writes viewingSessionId to Zustand store so PermissionBanner can filter
 * out the currently viewed session (it already shows PermissionFooter inline).
 * Mount once inside the router context (e.g. in _layout.tsx).
 */
export function useViewingSession() {
    const pathname = usePathname();

    React.useEffect(() => {
        let sessionId: string | null = null;
        if (pathname.startsWith('/session/')) {
            const parts = pathname.split('/');
            sessionId = parts[2] || null;
        }
        storage.getState().setViewingSessionId(sessionId);
    }, [pathname]);
}
