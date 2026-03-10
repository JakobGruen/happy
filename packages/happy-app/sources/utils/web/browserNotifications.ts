/**
 * Browser Notification API utilities for web platform.
 * Provides helpers for OS-level push notifications when the tab is in background.
 */

const NOTIFICATION_ONLY_TOOLS = ['AskUserQuestion', 'ExitPlanMode', 'exit_plan_mode'] as const;

const SERVICE_WORKER_PATH = '/notification-sw.js';

/**
 * Builds a stable notification tag for a given permission ID.
 * Used to replace/deduplicate notifications for the same permission request.
 */
export function buildNotificationTag(permissionId: string): string {
    return `permission-${permissionId}`;
}

/**
 * Returns true if the tool should show a notification-only banner
 * (navigate chevron, no allow/deny buttons) because it requires
 * in-session interaction rather than a simple allow/deny.
 */
export function isNotificationOnlyTool(tool: string): boolean {
    return (NOTIFICATION_ONLY_TOOLS as readonly string[]).includes(tool);
}

/**
 * Returns true if a browser notification should be fired.
 * Requires both: tab is hidden AND permission has been granted.
 */
export function shouldShowNotification(
    hidden: boolean,
    permission: NotificationPermission,
): boolean {
    return hidden && permission === 'granted';
}

/**
 * Requests notification permission from the browser.
 * Returns 'default' if the Notification API is unavailable (e.g. native app context).
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
    if (typeof Notification === 'undefined') {
        return 'default';
    }
    return Notification.requestPermission();
}

/**
 * Returns the current notification permission state,
 * or 'unavailable' if the Notification API is not present.
 */
export function getNotificationPermission(): NotificationPermission | 'unavailable' {
    if (typeof Notification === 'undefined') {
        return 'unavailable';
    }
    return Notification.permission;
}

/**
 * Registers the notification service worker.
 * Returns null if the Service Worker API is not available.
 */
export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
        return null;
    }
    return navigator.serviceWorker.register(SERVICE_WORKER_PATH);
}

/**
 * Posts a message to the active service worker.
 * No-ops if there is no active worker (registration not yet activated).
 */
export function sendToServiceWorker(
    reg: ServiceWorkerRegistration,
    message: unknown,
): void {
    if (!reg.active) {
        return;
    }
    reg.active.postMessage(message);
}
