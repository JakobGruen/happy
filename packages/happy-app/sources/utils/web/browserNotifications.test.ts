import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    buildNotificationTag,
    isNotificationOnlyTool,
    shouldShowNotification,
    requestNotificationPermission,
    getNotificationPermission,
    registerNotificationServiceWorker,
    sendToServiceWorker,
} from './browserNotifications';

describe('buildNotificationTag', () => {
    it('returns permission-prefixed tag', () => {
        expect(buildNotificationTag('abc')).toBe('permission-abc');
    });

    it('handles arbitrary permission IDs', () => {
        expect(buildNotificationTag('xyz-123')).toBe('permission-xyz-123');
    });
});

describe('isNotificationOnlyTool', () => {
    it('returns true for AskUserQuestion', () => {
        expect(isNotificationOnlyTool('AskUserQuestion')).toBe(true);
    });

    it('returns true for ExitPlanMode', () => {
        expect(isNotificationOnlyTool('ExitPlanMode')).toBe(true);
    });

    it('returns true for exit_plan_mode', () => {
        expect(isNotificationOnlyTool('exit_plan_mode')).toBe(true);
    });

    it('returns false for Bash', () => {
        expect(isNotificationOnlyTool('Bash')).toBe(false);
    });

    it('returns false for unknown tools', () => {
        expect(isNotificationOnlyTool('Read')).toBe(false);
        expect(isNotificationOnlyTool('Write')).toBe(false);
        expect(isNotificationOnlyTool('')).toBe(false);
    });
});

describe('shouldShowNotification', () => {
    it('returns true when hidden and permission is granted', () => {
        expect(shouldShowNotification(true, 'granted')).toBe(true);
    });

    it('returns false when not hidden and permission is granted', () => {
        expect(shouldShowNotification(false, 'granted')).toBe(false);
    });

    it('returns false when hidden but permission is denied', () => {
        expect(shouldShowNotification(true, 'denied')).toBe(false);
    });

    it('returns false when hidden but permission is default', () => {
        expect(shouldShowNotification(true, 'default')).toBe(false);
    });

    it('returns false when not hidden and permission is denied', () => {
        expect(shouldShowNotification(false, 'denied')).toBe(false);
    });
});

describe('requestNotificationPermission', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('calls Notification.requestPermission and returns result', async () => {
        const mockRequestPermission = vi.fn().mockResolvedValue('granted' as NotificationPermission);
        vi.stubGlobal('Notification', { requestPermission: mockRequestPermission });

        const result = await requestNotificationPermission();

        expect(mockRequestPermission).toHaveBeenCalledOnce();
        expect(result).toBe('granted');
    });

    it('returns denied when permission is denied', async () => {
        const mockRequestPermission = vi.fn().mockResolvedValue('denied' as NotificationPermission);
        vi.stubGlobal('Notification', { requestPermission: mockRequestPermission });

        const result = await requestNotificationPermission();
        expect(result).toBe('denied');
    });

    it('returns default when Notification is unavailable', async () => {
        vi.stubGlobal('Notification', undefined);

        const result = await requestNotificationPermission();
        expect(result).toBe('default');
    });
});

describe('getNotificationPermission', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns current permission when Notification is available', () => {
        vi.stubGlobal('Notification', { permission: 'granted' });
        expect(getNotificationPermission()).toBe('granted');
    });

    it('returns unavailable when Notification is not defined', () => {
        vi.stubGlobal('Notification', undefined);
        expect(getNotificationPermission()).toBe('unavailable');
    });
});

describe('registerNotificationServiceWorker', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('calls navigator.serviceWorker.register with the sw path', async () => {
        const mockRegistration = { scope: '/' } as ServiceWorkerRegistration;
        const mockRegister = vi.fn().mockResolvedValue(mockRegistration);
        vi.stubGlobal('navigator', {
            serviceWorker: { register: mockRegister },
        });

        const result = await registerNotificationServiceWorker();

        expect(mockRegister).toHaveBeenCalledOnce();
        expect(mockRegister).toHaveBeenCalledWith(expect.stringContaining('sw'));
        expect(result).toBe(mockRegistration);
    });

    it('returns null when serviceWorker is unavailable', async () => {
        vi.stubGlobal('navigator', {});

        const result = await registerNotificationServiceWorker();
        expect(result).toBeNull();
    });

    it('returns null when navigator is undefined', async () => {
        vi.stubGlobal('navigator', undefined);

        const result = await registerNotificationServiceWorker();
        expect(result).toBeNull();
    });
});

describe('sendToServiceWorker', () => {
    it('calls postMessage on the service worker with the message', () => {
        const mockPostMessage = vi.fn();
        const mockReg = {
            active: { postMessage: mockPostMessage },
        } as unknown as ServiceWorkerRegistration;

        sendToServiceWorker(mockReg, { type: 'SHOW_NOTIFICATION', data: 'test' });

        expect(mockPostMessage).toHaveBeenCalledWith({ type: 'SHOW_NOTIFICATION', data: 'test' });
    });

    it('does nothing when there is no active service worker', () => {
        const mockReg = {
            active: null,
        } as unknown as ServiceWorkerRegistration;

        // Should not throw
        expect(() => sendToServiceWorker(mockReg, { type: 'PING' })).not.toThrow();
    });
});
