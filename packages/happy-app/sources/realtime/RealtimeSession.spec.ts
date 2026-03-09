import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VoiceSession } from './types';

// ---------------------------------------------------------------------------
// Hoisted mock factories -- these run before any module imports
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
    return {
        fetchPipecatSession: vi.fn(),
        getCredentials: vi.fn(),
        modalAlert: vi.fn(),
        requestMicrophonePermission: vi.fn().mockResolvedValue({ granted: true }),
        showMicrophonePermissionDeniedAlert: vi.fn(),
        storageGetState: vi.fn().mockReturnValue({
            localSettings: {},
            settings: { experiments: false },
            setRealtimeSessionId: vi.fn(),
        }),
    };
});

vi.mock('@/sync/apiVoice', () => ({
    fetchPipecatSession: mocks.fetchPipecatSession,
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: mocks.storageGetState,
    },
}));

vi.mock('@/auth/tokenStorage', () => ({
    TokenStorage: {
        getCredentials: mocks.getCredentials,
    },
}));

vi.mock('@/modal', () => ({
    Modal: {
        alert: mocks.modalAlert,
    },
}));

vi.mock('@/utils/microphonePermissions', () => ({
    requestMicrophonePermission: mocks.requestMicrophonePermission,
    showMicrophonePermissionDeniedAlert: mocks.showMicrophonePermissionDeniedAlert,
}));

vi.mock('@/text', () => ({
    t: vi.fn((key: string) => key),
}));

vi.stubGlobal('__DEV__', true);

// ---------------------------------------------------------------------------
// Type for the dynamically-imported module
// ---------------------------------------------------------------------------
type RealtimeSessionModule = typeof import('./RealtimeSession');

// ---------------------------------------------------------------------------
// Helper: fresh module import to isolate module-level state between tests
// ---------------------------------------------------------------------------
async function freshModule(): Promise<RealtimeSessionModule> {
    return await import('./RealtimeSession');
}

// ---------------------------------------------------------------------------
// Helper: create a mock VoiceSession
// ---------------------------------------------------------------------------
function createMockVoiceSession(): VoiceSession {
    return {
        startSession: vi.fn().mockResolvedValue(undefined),
        endSession: vi.fn().mockResolvedValue(undefined),
        sendTextMessage: vi.fn(),
        sendContextualUpdate: vi.fn(),
        sendTrigger: vi.fn(),
    };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------
describe('RealtimeSession', () => {
    let mod: RealtimeSessionModule;
    let mockSession: VoiceSession;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();

        // Default mock returns
        mocks.requestMicrophonePermission.mockResolvedValue({ granted: true });
        mocks.storageGetState.mockReturnValue({
            localSettings: {},
            settings: { experiments: false },
            setRealtimeSessionId: vi.fn(),
        });
        mocks.getCredentials.mockResolvedValue({ token: 'test-token', secret: 'test-secret' });

        mod = await freshModule();
        mockSession = createMockVoiceSession();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ===================================================================
    // startRealtimeSession
    // ===================================================================
    describe('startRealtimeSession', () => {
        it('does nothing when no voice session is registered', async () => {
            // Do NOT call registerVoiceSession
            await mod.startRealtimeSession('session-1');

            expect(mocks.requestMicrophonePermission).not.toHaveBeenCalled();
            expect(mockSession.startSession).not.toHaveBeenCalled();
        });

        it('requests microphone permission before anything else', async () => {
            mod.registerVoiceSession(mockSession);
            mocks.fetchPipecatSession.mockResolvedValue({
                url: 'https://voice.example.com/api/offer?session_id=session-1&token=abc',
            });
            await mod.startRealtimeSession('session-1');

            expect(mocks.requestMicrophonePermission).toHaveBeenCalledTimes(1);
        });

        it('stops and shows alert when microphone permission is denied', async () => {
            mocks.requestMicrophonePermission.mockResolvedValue({
                granted: false,
                canAskAgain: true,
            });
            mod.registerVoiceSession(mockSession);

            await mod.startRealtimeSession('session-1');

            expect(mocks.showMicrophonePermissionDeniedAlert).toHaveBeenCalledWith(true);
            expect(mockSession.startSession).not.toHaveBeenCalled();
        });

        it('passes canAskAgain=false to alert when permission permanently denied', async () => {
            mocks.requestMicrophonePermission.mockResolvedValue({
                granted: false,
                canAskAgain: false,
            });
            mod.registerVoiceSession(mockSession);

            await mod.startRealtimeSession('session-1');

            expect(mocks.showMicrophonePermissionDeniedAlert).toHaveBeenCalledWith(false);
        });
    });

    // ===================================================================
    // Pipecat path
    // ===================================================================
    describe('Pipecat path', () => {
        beforeEach(() => {
            mocks.storageGetState.mockReturnValue({
                localSettings: {},
                settings: { experiments: false },
                setRealtimeSessionId: vi.fn(),
            });
            mod.registerVoiceSession(mockSession);
        });

        it('fetches credentials and Pipecat session URL', async () => {
            mocks.fetchPipecatSession.mockResolvedValue({
                url: 'https://voice.example.com/api/offer?session_id=session-pc&token=abc',
            });

            await mod.startRealtimeSession('session-pc');

            expect(mocks.getCredentials).toHaveBeenCalledTimes(1);
            expect(mocks.fetchPipecatSession).toHaveBeenCalledWith(
                { token: 'test-token', secret: 'test-secret' },
                'session-pc'
            );
        });

        it('calls voiceSession.startSession with pipecatUrl', async () => {
            mocks.fetchPipecatSession.mockResolvedValue({
                url: 'https://voice.example.com/api/offer?session_id=session-pc&token=abc',
            });

            await mod.startRealtimeSession('session-pc', 'some context');

            expect(mockSession.startSession).toHaveBeenCalledWith({
                sessionId: 'session-pc',
                initialContext: 'some context',
                pipecatUrl: 'https://voice.example.com/api/offer?session_id=session-pc&token=abc',
            });
        });

        it('shows alert when credentials are missing', async () => {
            mocks.getCredentials.mockResolvedValue(null);

            await mod.startRealtimeSession('session-pc');

            expect(mocks.modalAlert).toHaveBeenCalledWith(
                'common.error',
                'errors.authenticationFailed'
            );
            expect(mockSession.startSession).not.toHaveBeenCalled();
        });

        it('shows alert on fetch failure', async () => {
            mocks.fetchPipecatSession.mockRejectedValue(new Error('Network error'));

            await mod.startRealtimeSession('session-pc');

            expect(mocks.modalAlert).toHaveBeenCalledWith(
                'common.error',
                'errors.voiceServiceUnavailable'
            );
        });

        it('sets currentSessionId and voiceSessionStarted on success', async () => {
            mocks.fetchPipecatSession.mockResolvedValue({
                url: 'https://voice.example.com/api/offer?session_id=session-pc&token=abc',
            });

            await mod.startRealtimeSession('session-pc');

            expect(mod.getCurrentRealtimeSessionId()).toBe('session-pc');
            expect(mod.isVoiceSessionStarted()).toBe(true);
        });

        it('cleans up state on failure', async () => {
            mocks.fetchPipecatSession.mockRejectedValue(new Error('fail'));

            await mod.startRealtimeSession('session-pc');

            expect(mod.getCurrentRealtimeSessionId()).toBeNull();
            expect(mod.isVoiceSessionStarted()).toBe(false);
        });

        it('uses direct pipecatUrl from localSettings when set', async () => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { pipecatUrl: 'https://my-pipecat.local:8080' },
                settings: { experiments: false },
                setRealtimeSessionId: vi.fn(),
            });

            await mod.startRealtimeSession('session-direct', 'ctx');

            // Should NOT call fetchPipecatSession or getCredentials
            expect(mocks.fetchPipecatSession).not.toHaveBeenCalled();
            expect(mocks.getCredentials).not.toHaveBeenCalled();
            expect(mockSession.startSession).toHaveBeenCalledWith({
                sessionId: 'session-direct',
                initialContext: 'ctx',
                pipecatUrl: 'https://my-pipecat.local:8080/api/offer?session_id=session-direct',
            });
        });

        it('appends secret to direct URL when pipecatAuthSecret is set', async () => {
            mocks.storageGetState.mockReturnValue({
                localSettings: {
                    pipecatUrl: 'https://my-pipecat.local:8080',
                    pipecatAuthSecret: 'my-secret',
                },
                settings: { experiments: false },
                setRealtimeSessionId: vi.fn(),
            });

            await mod.startRealtimeSession('session-secret');

            expect(mockSession.startSession).toHaveBeenCalledWith(
                expect.objectContaining({
                    pipecatUrl: 'https://my-pipecat.local:8080/api/offer?session_id=session-secret&secret=my-secret',
                })
            );
        });
    });

    // ===================================================================
    // stopRealtimeSession
    // ===================================================================
    describe('stopRealtimeSession', () => {
        it('calls endSession on registered session', async () => {
            mod.registerVoiceSession(mockSession);
            mocks.fetchPipecatSession.mockResolvedValue({
                url: 'https://voice.example.com/api/offer?session_id=session-stop&token=abc',
            });
            await mod.startRealtimeSession('session-stop');

            await mod.stopRealtimeSession();

            expect(mockSession.endSession).toHaveBeenCalledTimes(1);
        });

        it('clears session ID and started flag after stopping', async () => {
            mod.registerVoiceSession(mockSession);
            mocks.fetchPipecatSession.mockResolvedValue({
                url: 'https://voice.example.com/api/offer?session_id=session-stop&token=abc',
            });
            await mod.startRealtimeSession('session-stop');
            expect(mod.getCurrentRealtimeSessionId()).toBe('session-stop');
            expect(mod.isVoiceSessionStarted()).toBe(true);

            await mod.stopRealtimeSession();

            expect(mod.getCurrentRealtimeSessionId()).toBeNull();
            expect(mod.isVoiceSessionStarted()).toBe(false);
        });

        it('handles missing voice session gracefully', async () => {
            // Do NOT register a session
            await expect(mod.stopRealtimeSession()).resolves.toBeUndefined();
        });

        it('does not throw when endSession fails', async () => {
            const failSession = createMockVoiceSession();
            (failSession.endSession as ReturnType<typeof vi.fn>).mockRejectedValue(
                new Error('end failed')
            );
            mod.registerVoiceSession(failSession);

            await expect(mod.stopRealtimeSession()).resolves.toBeUndefined();
        });
    });

    // ===================================================================
    // Registration & Query functions
    // ===================================================================
    describe('registerVoiceSession', () => {
        it('stores session accessible via getVoiceSession', () => {
            mod.registerVoiceSession(mockSession);
            expect(mod.getVoiceSession()).toBe(mockSession);
        });

        it('replaces an existing session with a new one', () => {
            const secondSession = createMockVoiceSession();
            mod.registerVoiceSession(mockSession);
            mod.registerVoiceSession(secondSession);

            expect(mod.getVoiceSession()).toBe(secondSession);
        });
    });

    describe('isVoiceSessionStarted', () => {
        it('returns false initially', () => {
            expect(mod.isVoiceSessionStarted()).toBe(false);
        });

        it('returns true after a session is started', async () => {
            mod.registerVoiceSession(mockSession);
            mocks.fetchPipecatSession.mockResolvedValue({
                url: 'https://voice.example.com/api/offer',
            });
            await mod.startRealtimeSession('session-flag');

            expect(mod.isVoiceSessionStarted()).toBe(true);
        });

        it('returns false after a session is stopped', async () => {
            mod.registerVoiceSession(mockSession);
            mocks.fetchPipecatSession.mockResolvedValue({
                url: 'https://voice.example.com/api/offer',
            });
            await mod.startRealtimeSession('session-flag');
            await mod.stopRealtimeSession();

            expect(mod.isVoiceSessionStarted()).toBe(false);
        });
    });

    describe('getCurrentRealtimeSessionId', () => {
        it('returns null initially', () => {
            expect(mod.getCurrentRealtimeSessionId()).toBeNull();
        });

        it('returns the active session ID after starting', async () => {
            mod.registerVoiceSession(mockSession);
            mocks.fetchPipecatSession.mockResolvedValue({
                url: 'https://voice.example.com/api/offer',
            });
            await mod.startRealtimeSession('my-session-id');

            expect(mod.getCurrentRealtimeSessionId()).toBe('my-session-id');
        });

        it('returns null after stopping', async () => {
            mod.registerVoiceSession(mockSession);
            mocks.fetchPipecatSession.mockResolvedValue({
                url: 'https://voice.example.com/api/offer',
            });
            await mod.startRealtimeSession('my-session-id');
            await mod.stopRealtimeSession();

            expect(mod.getCurrentRealtimeSessionId()).toBeNull();
        });
    });

    describe('getVoiceSession', () => {
        it('returns null when no session is registered', () => {
            expect(mod.getVoiceSession()).toBeNull();
        });

        it('returns the registered session', () => {
            mod.registerVoiceSession(mockSession);
            expect(mod.getVoiceSession()).toBe(mockSession);
        });
    });
});
