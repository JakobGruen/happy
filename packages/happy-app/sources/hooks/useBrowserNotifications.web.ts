/**
 * Browser notification hook for web platform.
 *
 * Subscribes to the Zustand storage outside the React render cycle and fires
 * OS-level browser notifications when a permission request arrives while the
 * tab is hidden. Tracks which notifications have already been shown via a ref
 * so we never re-show the same request.
 *
 * Falls back to the raw Notification API when the Service Worker is unavailable
 * (action buttons are not supported in that case).
 *
 * Implementation note: modules that transitively depend on native React Native
 * code (storage, ops, sessionUtils, text, permissionQueue, useNavigateToSession)
 * are loaded via dynamic import() inside the useEffect so that this file is
 * importable in Node.js test environments without the full native module chain.
 */
import { useEffect, useRef } from 'react';
import type { PendingPermissionItem } from '@/sync/permissionQueue';
import {
    buildNotificationTag,
    isNotificationOnlyTool,
    shouldShowNotification,
    getNotificationPermission,
    requestNotificationPermission,
    registerNotificationServiceWorker,
    sendToServiceWorker,
} from '@/utils/web/browserNotifications';

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

/**
 * Registers a service worker, requests notification permission on first use,
 * and shows/closes OS notifications in response to permission queue changes.
 *
 * Guards against Tauri (native desktop context) by returning early when
 * `window.__TAURI_INTERNALS__` is present.
 */
export function useBrowserNotifications() {
    // Tauri guard: detect native desktop context — evaluated once at mount time.
    // We use a ref + effect to avoid violating React Rules of Hooks (no early
    // returns before hooks).
    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

    // Tracks which permission IDs have already been surfaced as OS notifications
    const shownPermissions = useRef<Set<string>>(new Set());
    // Holds the SW registration once it resolves
    const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
    // Current notification permission — updated after the initial request
    const permissionRef = useRef<NotificationPermission | 'unavailable'>(
        getNotificationPermission(),
    );

    useEffect(() => {
        // Guard: Tauri is a native app — browser notifications not applicable
        if (isTauri) return;

        let cancelled = false;
        let unsubscribe: (() => void) | undefined;
        let removeSwListener: (() => void) | undefined;

        (async () => {
            // ── Load heavy modules at runtime (avoid native deps during module parse) ─
            const [
                { buildPermissionQueue },
                { storage },
                { sessionAllow, sessionDeny },
                { getSessionName },
                { t },
                { router },
            ] = await Promise.all([
                import('@/sync/permissionQueue'),
                import('@/sync/storage'),
                import('@/sync/ops'),
                import('@/utils/sessionUtils'),
                import('@/text'),
                import('expo-router'),
            ]);

            if (cancelled) return;

            // useNavigateToSession cannot be called here (Rules of Hooks — no hooks
            // inside async functions). Use expo-router's imperative router directly,
            // replicating the dangerouslySingular behaviour from useNavigateToSession.
            const navigateToSession = (sessionId: string) => {
                router.navigate(`/session/${sessionId}` as any, {
                    dangerouslySingular(_name: string, _params: Record<string, string>) {
                        return 'session';
                    },
                } as any);
            };

            // ── 1. Register Service Worker + request permission ─────────────────────
            const swReg = await registerNotificationServiceWorker();
            if (!cancelled) {
                swRegRef.current = swReg;
            }

            // Ask for permission only once (tracked in localStorage)
            if (!localStorage.getItem('happy-notif-permission-asked')) {
                const result = await requestNotificationPermission();
                localStorage.setItem('happy-notif-permission-asked', '1');
                if (!cancelled) {
                    permissionRef.current = result;
                }
            }

            if (cancelled) return;

            // ── 2. Subscribe to Zustand store (outside render cycle) ────────────────
            unsubscribe = storage.subscribe((state: { sessions: Record<string, import('@/sync/storageTypes').Session> }) => {
                const queue = buildPermissionQueue(state.sessions, null);
                const { toShow, toClose } = diffPermissionQueue(shownPermissions.current, queue);

                const reg = swRegRef.current;
                const permission = permissionRef.current;

                if (shouldShowNotification(document.hidden, permission as NotificationPermission)) {
                    for (const item of toShow) {
                        const title = getSessionName(item.session);
                        const body = t('notifications.permissionTool', {
                            tool: item.tool,
                            description: item.description ?? undefined,
                        });

                        if (reg) {
                            sendToServiceWorker(reg, {
                                type: 'SHOW_NOTIFICATION',
                                tag: buildNotificationTag(item.permissionId),
                                title,
                                body,
                                isNotificationOnly: isNotificationOnlyTool(item.tool),
                                sessionId: item.sessionId,
                                permissionId: item.permissionId,
                            });
                        } else {
                            // Fallback: raw Notification API (no action buttons)
                            const notif = new Notification(title, {
                                body,
                                tag: buildNotificationTag(item.permissionId),
                            });
                            notif.onclick = () => {
                                window.focus();
                                navigateToSession(item.sessionId);
                            };
                        }
                    }
                }

                for (const id of toClose) {
                    if (reg) {
                        sendToServiceWorker(reg, {
                            type: 'CLOSE_NOTIFICATION',
                            tag: buildNotificationTag(id),
                        });
                    }
                }

                // Update tracked set
                for (const item of toShow) {
                    shownPermissions.current.add(item.permissionId);
                }
                for (const id of toClose) {
                    shownPermissions.current.delete(id);
                }
            });

            // ── 3. Listen for SW → app messages (NOTIFICATION_ACTION) ──────────────
            function handleSwMessage(event: MessageEvent) {
                if (!event.data || event.data.type !== 'NOTIFICATION_ACTION') return;

                const { action, sessionId, permissionId } = event.data as {
                    action: string;
                    sessionId: string;
                    permissionId: string;
                };

                if (action === 'allow') {
                    sessionAllow(sessionId, permissionId);
                } else if (action === 'deny') {
                    sessionDeny(sessionId, permissionId);
                } else if (action === 'click') {
                    window.focus();
                    navigateToSession(sessionId);
                }
            }

            if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
                navigator.serviceWorker.addEventListener('message', handleSwMessage);
                removeSwListener = () => {
                    navigator.serviceWorker.removeEventListener('message', handleSwMessage);
                };
            }
        })();

        return () => {
            cancelled = true;
            unsubscribe?.();
            removeSwListener?.();
        };
    }, []);
}
