import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { sessionAllow, sessionDeny } from '@/sync/ops';
import { router } from 'expo-router';

interface NotificationAction {
    type: 'allow' | 'deny' | 'navigate';
    sessionId: string;
    requestId?: string;
}

/**
 * Maps a notification action identifier + data to a typed action.
 * Returns null if required data is missing.
 */
export function mapNotificationAction(
    actionIdentifier: string,
    data: Record<string, any> | undefined,
): NotificationAction | null {
    if (!data?.sessionId) return null;

    if (actionIdentifier === 'ALLOW') {
        if (!data.requestId) return null;
        return { type: 'allow', sessionId: data.sessionId, requestId: data.requestId };
    }

    if (actionIdentifier === 'DENY') {
        if (!data.requestId) return null;
        return { type: 'deny', sessionId: data.sessionId, requestId: data.requestId };
    }

    // Default action (body tap) — navigate to session
    return { type: 'navigate', sessionId: data.sessionId };
}

/**
 * Hook that listens for notification action responses (Allow/Deny buttons + body taps).
 * Calls sessionAllow/sessionDeny for quick actions, navigates for body taps.
 */
export function useNotificationActions() {
    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
            const action = mapNotificationAction(
                response.actionIdentifier,
                response.notification.request.content.data as Record<string, any>,
            );
            if (!action) return;

            switch (action.type) {
                case 'allow':
                    sessionAllow(action.sessionId, action.requestId!);
                    break;
                case 'deny':
                    sessionDeny(action.sessionId, action.requestId!);
                    break;
                case 'navigate':
                    router.push(`/(app)/session/${action.sessionId}`);
                    break;
            }
        });

        return () => subscription.remove();
    }, []);
}
