import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerNotificationCategories, PERMISSION_CATEGORY_ID } from './notificationCategories';

// Mock expo-notifications
vi.mock('expo-notifications', () => ({
    setNotificationCategoryAsync: vi.fn(),
}));

import * as Notifications from 'expo-notifications';

describe('notificationCategories', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exports PERMISSION_CATEGORY_ID constant', () => {
        expect(PERMISSION_CATEGORY_ID).toBe('PERMISSION_REQUEST');
    });

    it('registers PERMISSION_REQUEST category with Allow and Deny actions', async () => {
        await registerNotificationCategories();

        expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
            'PERMISSION_REQUEST',
            [
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
            ]
        );
    });

    it('does not throw if setNotificationCategoryAsync fails', async () => {
        vi.mocked(Notifications.setNotificationCategoryAsync).mockRejectedValue(new Error('fail'));
        await expect(registerNotificationCategories()).resolves.not.toThrow();
    });
});
