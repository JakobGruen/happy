import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VoiceSession } from './types';

// ---------------------------------------------------------------------------
// Hoisted mock factories -- these run before any module imports
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
    const configObj = {
        elevenLabsAgentIdDev: 'test-agent-dev' as string | undefined,
        elevenLabsAgentIdProd: 'test-agent-prod' as string | undefined,
    };
    return {
        fetchVoiceToken: vi.fn(),
        fetchLiveKitToken: vi.fn(),
        fetchPipecatSession: vi.fn(),
        getCredentials: vi.fn(),
        modalAlert: vi.fn(),
        presentPaywall: vi.fn(),
        requestMicrophonePermission: vi.fn().mockResolvedValue({ granted: true }),
        showMicrophonePermissionDeniedAlert: vi.fn(),
        storageGetState: vi.fn().mockReturnValue({
            localSettings: { voiceBackend: 'elevenlabs' },
            settings: { experiments: false },
        }),
        configObj,
    };
});

vi.mock('@/sync/apiVoice', () => ({
    fetchVoiceToken: mocks.fetchVoiceToken,
    fetchLiveKitToken: mocks.fetchLiveKitToken,
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

vi.mock('@/sync/sync', () => ({
    sync: {
        presentPaywall: mocks.presentPaywall,
    },
}));

vi.mock('@/config', () => ({
    config: mocks.configObj,
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
            localSettings: { voiceBackend: 'elevenlabs' },
            settings: { experiments: false },
        });
        mocks.getCredentials.mockResolvedValue({ token: 'test-token', secret: 'test-secret' });
        mocks.configObj.elevenLabsAgentIdDev = 'test-agent-dev';
        mocks.configObj.elevenLabsAgentIdProd = 'test-agent-prod';

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

        it('routes to LiveKit when voiceBackend is "livekit"', async () => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'livekit' },
                settings: { experiments: false },
            });
            mocks.fetchLiveKitToken.mockResolvedValue({
                url: 'wss://lk.example.com',
                token: 'lk-token',
            });
            mod.registerVoiceSession(mockSession);

            await mod.startRealtimeSession('session-lk');

            expect(mocks.fetchLiveKitToken).toHaveBeenCalled();
            expect(mocks.fetchVoiceToken).not.toHaveBeenCalled();
        });

        it('routes to ElevenLabs when voiceBackend is "elevenlabs"', async () => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'elevenlabs' },
                settings: { experiments: false },
            });
            mod.registerVoiceSession(mockSession);

            await mod.startRealtimeSession('session-el');

            expect(mockSession.startSession).toHaveBeenCalledWith(
                expect.objectContaining({ agentId: 'test-agent-dev' })
            );
            expect(mocks.fetchLiveKitToken).not.toHaveBeenCalled();
        });
    });

    // ===================================================================
    // LiveKit path
    // ===================================================================
    describe('LiveKit path', () => {
        beforeEach(() => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'livekit' },
                settings: { experiments: false },
            });
            mod.registerVoiceSession(mockSession);
        });

        it('fetches credentials and LiveKit token', async () => {
            mocks.fetchLiveKitToken.mockResolvedValue({
                url: 'wss://lk.example.com',
                token: 'lk-token-abc',
            });

            await mod.startRealtimeSession('session-lk');

            expect(mocks.getCredentials).toHaveBeenCalledTimes(1);
            expect(mocks.fetchLiveKitToken).toHaveBeenCalledWith(
                { token: 'test-token', secret: 'test-secret' },
                'session-lk'
            );
        });

        it('calls voiceSession.startSession with livekitUrl and livekitToken', async () => {
            mocks.fetchLiveKitToken.mockResolvedValue({
                url: 'wss://lk.example.com',
                token: 'lk-token-abc',
            });

            await mod.startRealtimeSession('session-lk', 'some context');

            expect(mockSession.startSession).toHaveBeenCalledWith({
                sessionId: 'session-lk',
                initialContext: 'some context',
                livekitUrl: 'wss://lk.example.com',
                livekitToken: 'lk-token-abc',
            });
        });

        it('shows alert when credentials are missing', async () => {
            mocks.getCredentials.mockResolvedValue(null);

            await mod.startRealtimeSession('session-lk');

            expect(mocks.modalAlert).toHaveBeenCalledWith(
                'common.error',
                'errors.authenticationFailed'
            );
            expect(mockSession.startSession).not.toHaveBeenCalled();
        });

        it('shows alert on token fetch failure', async () => {
            mocks.fetchLiveKitToken.mockRejectedValue(new Error('Network error'));

            await mod.startRealtimeSession('session-lk');

            expect(mocks.modalAlert).toHaveBeenCalledWith(
                'common.error',
                'errors.voiceServiceUnavailable'
            );
        });

        it('sets currentSessionId and voiceSessionStarted on success', async () => {
            mocks.fetchLiveKitToken.mockResolvedValue({
                url: 'wss://lk.example.com',
                token: 'lk-token-abc',
            });

            await mod.startRealtimeSession('session-lk');

            expect(mod.getCurrentRealtimeSessionId()).toBe('session-lk');
            expect(mod.isVoiceSessionStarted()).toBe(true);
        });

        it('cleans up state on failure', async () => {
            mocks.fetchLiveKitToken.mockRejectedValue(new Error('fail'));

            await mod.startRealtimeSession('session-lk');

            expect(mod.getCurrentRealtimeSessionId()).toBeNull();
            expect(mod.isVoiceSessionStarted()).toBe(false);
        });

        it('does not set state when credentials are null (returns early)', async () => {
            mocks.getCredentials.mockResolvedValue(null);

            await mod.startRealtimeSession('session-lk');

            expect(mod.getCurrentRealtimeSessionId()).toBeNull();
            expect(mod.isVoiceSessionStarted()).toBe(false);
        });
    });

    // ===================================================================
    // ElevenLabs path
    // ===================================================================
    describe('ElevenLabs path', () => {
        beforeEach(() => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'elevenlabs' },
                settings: { experiments: false },
            });
            mod.registerVoiceSession(mockSession);
        });

        it('uses agentId directly when experiments are disabled', async () => {
            await mod.startRealtimeSession('session-el', 'context');

            expect(mocks.fetchVoiceToken).not.toHaveBeenCalled();
            expect(mockSession.startSession).toHaveBeenCalledWith({
                sessionId: 'session-el',
                initialContext: 'context',
                agentId: 'test-agent-dev',
            });
            expect(mod.isVoiceSessionStarted()).toBe(true);
            expect(mod.getCurrentRealtimeSessionId()).toBe('session-el');
        });

        it('fetches voice token when experiments are enabled', async () => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'elevenlabs' },
                settings: { experiments: true },
            });
            mocks.fetchVoiceToken.mockResolvedValue({
                allowed: true,
                token: 'voice-tok',
                agentId: 'backend-agent',
            });

            await mod.startRealtimeSession('session-el');

            expect(mocks.fetchVoiceToken).toHaveBeenCalledWith(
                { token: 'test-token', secret: 'test-secret' },
                'session-el'
            );
        });

        it('shows paywall when not allowed and retries on purchase', async () => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'elevenlabs' },
                settings: { experiments: true },
            });
            mocks.fetchVoiceToken.mockResolvedValue({ allowed: false });

            // First call: paywall purchased -> retry succeeds
            // On retry, experiments is still true so fetchVoiceToken is called again
            let callCount = 0;
            mocks.presentPaywall.mockResolvedValue({ purchased: true });
            mocks.fetchVoiceToken.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) {
                    return { allowed: false };
                }
                return { allowed: true, token: 'new-tok', agentId: 'new-agent' };
            });

            await mod.startRealtimeSession('session-el');

            expect(mocks.presentPaywall).toHaveBeenCalledTimes(1);
            // After paywall purchase, startRealtimeSession is called again recursively
            expect(mocks.fetchVoiceToken).toHaveBeenCalledTimes(2);
            expect(mockSession.startSession).toHaveBeenCalled();
        });

        it('does not retry when paywall is dismissed (not purchased)', async () => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'elevenlabs' },
                settings: { experiments: true },
            });
            mocks.fetchVoiceToken.mockResolvedValue({ allowed: false });
            mocks.presentPaywall.mockResolvedValue({ purchased: false });

            await mod.startRealtimeSession('session-el');

            expect(mocks.presentPaywall).toHaveBeenCalledTimes(1);
            expect(mockSession.startSession).not.toHaveBeenCalled();
        });

        it('passes token from backend when available', async () => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'elevenlabs' },
                settings: { experiments: true },
            });
            mocks.fetchVoiceToken.mockResolvedValue({
                allowed: true,
                token: 'backend-token',
                agentId: 'backend-agent-id',
            });

            await mod.startRealtimeSession('session-el', 'ctx');

            expect(mockSession.startSession).toHaveBeenCalledWith({
                sessionId: 'session-el',
                initialContext: 'ctx',
                token: 'backend-token',
                agentId: 'backend-agent-id',
            });
        });

        it('falls back to config agentId when no token from backend', async () => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'elevenlabs' },
                settings: { experiments: true },
            });
            mocks.fetchVoiceToken.mockResolvedValue({
                allowed: true,
                // no token, no agentId
            });

            await mod.startRealtimeSession('session-el', 'ctx');

            expect(mockSession.startSession).toHaveBeenCalledWith({
                sessionId: 'session-el',
                initialContext: 'ctx',
                agentId: 'test-agent-dev',
            });
        });

        it('shows alert when credentials are missing (experiments enabled)', async () => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'elevenlabs' },
                settings: { experiments: true },
            });
            mocks.getCredentials.mockResolvedValue(null);

            await mod.startRealtimeSession('session-el');

            expect(mocks.modalAlert).toHaveBeenCalledWith(
                'common.error',
                'errors.authenticationFailed'
            );
            expect(mockSession.startSession).not.toHaveBeenCalled();
        });

        it('shows alert on fetchVoiceToken failure', async () => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'elevenlabs' },
                settings: { experiments: true },
            });
            mocks.fetchVoiceToken.mockRejectedValue(new Error('boom'));

            await mod.startRealtimeSession('session-el');

            expect(mocks.modalAlert).toHaveBeenCalledWith(
                'common.error',
                'errors.voiceServiceUnavailable'
            );
            expect(mod.getCurrentRealtimeSessionId()).toBeNull();
            expect(mod.isVoiceSessionStarted()).toBe(false);
        });

        it('returns early without error when agentId is not configured', async () => {
            // Temporarily clear agent IDs on the shared config mock object
            mocks.configObj.elevenLabsAgentIdDev = undefined;
            mocks.configObj.elevenLabsAgentIdProd = undefined;

            await mod.startRealtimeSession('session-el');

            expect(mockSession.startSession).not.toHaveBeenCalled();
            expect(mod.isVoiceSessionStarted()).toBe(false);
        });
    });

    // ===================================================================
    // Pipecat path
    // ===================================================================
    describe('Pipecat path', () => {
        beforeEach(() => {
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'pipecat' },
                settings: { experiments: false },
            });
            mod.registerVoiceSession(mockSession);
        });

        it('routes to Pipecat when voiceBackend is "pipecat"', async () => {
            mocks.fetchPipecatSession.mockResolvedValue({
                url: 'https://voice.example.com/api/offer?session_id=session-pc&token=abc',
            });

            await mod.startRealtimeSession('session-pc');

            expect(mocks.fetchPipecatSession).toHaveBeenCalled();
            expect(mocks.fetchLiveKitToken).not.toHaveBeenCalled();
            expect(mocks.fetchVoiceToken).not.toHaveBeenCalled();
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
    });

    // ===================================================================
    // stopRealtimeSession
    // ===================================================================
    describe('stopRealtimeSession', () => {
        it('calls endSession on registered session', async () => {
            mod.registerVoiceSession(mockSession);
            // Start a session first to have active state
            mocks.storageGetState.mockReturnValue({
                localSettings: { voiceBackend: 'elevenlabs' },
                settings: { experiments: false },
            });
            await mod.startRealtimeSession('session-stop');

            await mod.stopRealtimeSession();

            expect(mockSession.endSession).toHaveBeenCalledTimes(1);
        });

        it('clears session ID and started flag after stopping', async () => {
            mod.registerVoiceSession(mockSession);
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
            await mod.startRealtimeSession('session-flag');

            expect(mod.isVoiceSessionStarted()).toBe(true);
        });

        it('returns false after a session is stopped', async () => {
            mod.registerVoiceSession(mockSession);
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
            await mod.startRealtimeSession('my-session-id');

            expect(mod.getCurrentRealtimeSessionId()).toBe('my-session-id');
        });

        it('returns null after stopping', async () => {
            mod.registerVoiceSession(mockSession);
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
