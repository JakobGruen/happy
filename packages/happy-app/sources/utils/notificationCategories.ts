import * as Notifications from 'expo-notifications';

export const PERMISSION_CATEGORY_ID = 'PERMISSION_REQUEST';

/**
 * Registers notification categories with action buttons.
 * PERMISSION_REQUEST: Allow/Deny buttons for tool permission requests.
 * Silently catches errors (non-critical — app works without categories).
 */
export async function registerNotificationCategories(): Promise<void> {
    try {
        await Notifications.setNotificationCategoryAsync(PERMISSION_CATEGORY_ID, [
            {
                identifier: 'ALLOW',
                buttonTitle: 'Allow',
                options: { opensAppToForeground: false },
            },
            {
                identifier: 'DENY',
                buttonTitle: 'Deny',
                options: { opensAppToForeground: false, isDestructive: true },
            },
        ]);
    } catch {
        // Non-critical — categories may not be supported on all platforms
    }
}
