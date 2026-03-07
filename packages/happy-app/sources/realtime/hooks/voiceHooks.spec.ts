import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
    return {
        getCurrentRealtimeSessionId: vi.fn<() => string | null>().mockReturnValue(null),
        getVoiceSession: vi.fn().mockReturnValue(null),
        isVoiceSessionStarted: vi.fn().mockReturnValue(false),
        formatNewMessages: vi.fn().mockReturnValue('formatted-messages'),
        formatNewSingleMessage: vi.fn().mockReturnValue('formatted-single'),
        formatPermissionRequest: vi.fn().mockReturnValue('formatted-permission'),
        formatReadyEvent: vi.fn().mockReturnValue('formatted-ready'),
        formatSessionFocus: vi.fn().mockReturnValue('formatted-focus'),
        formatSessionFull: vi.fn().mockReturnValue('formatted-full'),
        formatSessionOffline: vi.fn().mockReturnValue('formatted-offline'),
        formatSessionOnline: vi.fn().mockReturnValue('formatted-online'),
        startFlow: vi.fn().mockReturnValue('question-text'),
        cleanupBridge: vi.fn(),
        storageGetState: vi.fn(),
        getAllCommands: vi.fn().mockReturnValue([]),
        mockVoiceSession: {
            startSession: vi.fn(),
            endSession: vi.fn(),
            sendTextMessage: vi.fn(),
            sendContextualUpdate: vi.fn(),
            sendTrigger: vi.fn(),
        },
    };
});

vi.mock('../RealtimeSession', () => ({
    getCurrentRealtimeSessionId: mocks.getCurrentRealtimeSessionId,
    getVoiceSession: mocks.getVoiceSession,
    isVoiceSessionStarted: mocks.isVoiceSessionStarted,
}));

vi.mock('./contextFormatters', () => ({
    formatNewMessages: mocks.formatNewMessages,
    formatNewSingleMessage: mocks.formatNewSingleMessage,
    formatPermissionRequest: mocks.formatPermissionRequest,
    formatReadyEvent: mocks.formatReadyEvent,
    formatSessionFocus: mocks.formatSessionFocus,
    formatSessionFull: mocks.formatSessionFull,
    formatSessionOffline: mocks.formatSessionOffline,
    formatSessionOnline: mocks.formatSessionOnline,
}));

vi.mock('../voiceQuestionBridge', () => ({
    startFlow: mocks.startFlow,
    cleanup: mocks.cleanupBridge,
}));

vi.mock('@/sync/storage', () => ({
    storage: { getState: mocks.storageGetState },
}));

vi.mock('@/sync/suggestionCommands', () => ({
    getAllCommands: mocks.getAllCommands,
}));

vi.mock('../voiceConfig', () => ({
    VOICE_CONFIG: {
        DISABLE_TOOL_CALLS: false,
        LIMITED_TOOL_CALLS: true,
        DISABLE_PERMISSION_REQUESTS: false,
        DISABLE_SESSION_STATUS: false, // Enable for testing (prod has true)
        DISABLE_MESSAGES: false,
        DISABLE_SESSION_FOCUS: false,
        DISABLE_READY_EVENTS: false,
        MAX_HISTORY_MESSAGES: 50,
        ENABLE_DEBUG_LOGGING: false,
        CONTEXT_DEBOUNCE_MS: 2000,
        MAX_SEND_FAILURES: 3,
        ENABLE_PROACTIVE_SPEECH: false,
        PROGRESS_UPDATE_INTERVAL_MS: 60_000,
        PROGRESS_MIN_NEW_MESSAGES: 3,
    },
}));

// ---------------------------------------------------------------------------
// Type for the dynamically-imported module
// ---------------------------------------------------------------------------
type VoiceHooksModule = typeof import('./voiceHooks');

async function freshModule(): Promise<VoiceHooksModule> {
    return await import('./voiceHooks');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VOICE_SESSION_ID = 'voice-session-123';
const OTHER_SESSION_ID = 'other-session-456';

function setupActiveVoiceSession() {
    mocks.getCurrentRealtimeSessionId.mockReturnValue(VOICE_SESSION_ID);
    mocks.isVoiceSessionStarted.mockReturnValue(true);
    mocks.getVoiceSession.mockReturnValue(mocks.mockVoiceSession);
    mocks.storageGetState.mockReturnValue({
        sessions: {
            [VOICE_SESSION_ID]: { id: VOICE_SESSION_ID, name: 'Voice Chat' },
            [OTHER_SESSION_ID]: { id: OTHER_SESSION_ID, name: 'Other Chat' },
        },
        sessionMessages: {
            [VOICE_SESSION_ID]: { messages: [{ kind: 'agent-text', text: 'hello' }] },
            [OTHER_SESSION_ID]: { messages: [{ kind: 'agent-text', text: 'other stuff' }] },
        },
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('voiceHooks session isolation', () => {
    let mod: VoiceHooksModule;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.resetModules();
        vi.useFakeTimers();
        mod = await freshModule();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // =======================================================================
    // onMessages
    // =======================================================================
    describe('onMessages', () => {
        it('forwards messages for the active voice session', () => {
            setupActiveVoiceSession();
            const messages = [{ kind: 'agent-text' as const, text: 'hello' }];

            mod.voiceHooks.onMessages(VOICE_SESSION_ID, messages as any);
            vi.advanceTimersByTime(3000); // flush debounce

            expect(mocks.formatNewMessages).toHaveBeenCalledWith(VOICE_SESSION_ID, messages);
        });

        it('ignores messages from a different session', () => {
            setupActiveVoiceSession();
            const messages = [{ kind: 'agent-text' as const, text: 'leaked' }];

            mod.voiceHooks.onMessages(OTHER_SESSION_ID, messages as any);
            vi.advanceTimersByTime(3000);

            expect(mocks.formatNewMessages).not.toHaveBeenCalled();
            expect(mocks.mockVoiceSession.sendContextualUpdate).not.toHaveBeenCalled();
        });

        it('ignores messages when no voice session is active', () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue(null);
            mocks.isVoiceSessionStarted.mockReturnValue(false);

            mod.voiceHooks.onMessages('any-session', [] as any);
            vi.advanceTimersByTime(3000);

            expect(mocks.formatNewMessages).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // onReady
    // =======================================================================
    describe('onReady', () => {
        it('sends ready event for the active voice session', () => {
            setupActiveVoiceSession();

            mod.voiceHooks.onReady(VOICE_SESSION_ID);
            vi.advanceTimersByTime(3000);

            expect(mocks.formatReadyEvent).toHaveBeenCalledWith(VOICE_SESSION_ID);
        });

        it('ignores ready events from a different session', () => {
            setupActiveVoiceSession();

            mod.voiceHooks.onReady(OTHER_SESSION_ID);
            vi.advanceTimersByTime(3000);

            expect(mocks.formatReadyEvent).not.toHaveBeenCalled();
            expect(mocks.mockVoiceSession.sendContextualUpdate).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // onSessionFocus
    // =======================================================================
    describe('onSessionFocus', () => {
        it('sends focus event for the active voice session', () => {
            setupActiveVoiceSession();

            mod.voiceHooks.onSessionFocus(VOICE_SESSION_ID, { path: '/test' });
            vi.advanceTimersByTime(3000);

            expect(mocks.formatSessionFocus).toHaveBeenCalledWith(VOICE_SESSION_ID, { path: '/test' });
        });

        it('ignores focus events from a different session', () => {
            setupActiveVoiceSession();

            mod.voiceHooks.onSessionFocus(OTHER_SESSION_ID, { path: '/other' });
            vi.advanceTimersByTime(3000);

            expect(mocks.formatSessionFocus).not.toHaveBeenCalled();
            expect(mocks.mockVoiceSession.sendContextualUpdate).not.toHaveBeenCalled();
        });

        it('does not pollute lastFocusSession when filtering non-voice sessions', () => {
            setupActiveVoiceSession();

            // Focus on non-voice session — should be silently dropped
            mod.voiceHooks.onSessionFocus(OTHER_SESSION_ID);
            vi.advanceTimersByTime(3000);

            // Now focus on voice session — should NOT be deduped
            mod.voiceHooks.onSessionFocus(VOICE_SESSION_ID);
            vi.advanceTimersByTime(3000);

            expect(mocks.formatSessionFocus).toHaveBeenCalledTimes(1);
            expect(mocks.formatSessionFocus).toHaveBeenCalledWith(VOICE_SESSION_ID, undefined);
        });
    });

    // =======================================================================
    // onPermissionRequested
    // =======================================================================
    describe('onPermissionRequested', () => {
        it('forwards permission requests for the active voice session', () => {
            setupActiveVoiceSession();

            mod.voiceHooks.onPermissionRequested(VOICE_SESSION_ID, 'req-1', 'Bash', { command: 'ls' });

            expect(mocks.formatPermissionRequest).toHaveBeenCalledWith(
                VOICE_SESSION_ID, 'req-1', 'Bash', { command: 'ls' }
            );
        });

        it('ignores permission requests from a different session', () => {
            setupActiveVoiceSession();

            mod.voiceHooks.onPermissionRequested(OTHER_SESSION_ID, 'req-2', 'Bash', { command: 'rm -rf' });

            expect(mocks.formatPermissionRequest).not.toHaveBeenCalled();
            expect(mocks.mockVoiceSession.sendTextMessage).not.toHaveBeenCalled();
        });

        it('routes AskUserQuestion to voiceQuestionBridge only for voice session', () => {
            setupActiveVoiceSession();
            const toolArgs = { questions: [{ question: 'Which color?' }] };

            mod.voiceHooks.onPermissionRequested(VOICE_SESSION_ID, 'req-3', 'AskUserQuestion', toolArgs);

            expect(mocks.startFlow).toHaveBeenCalledWith(VOICE_SESSION_ID, 'req-3', toolArgs.questions);
        });

        it('does not route AskUserQuestion from different session to bridge', () => {
            setupActiveVoiceSession();
            const toolArgs = { questions: [{ question: 'Which color?' }] };

            mod.voiceHooks.onPermissionRequested(OTHER_SESSION_ID, 'req-4', 'AskUserQuestion', toolArgs);

            expect(mocks.startFlow).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // onSessionOnline / onSessionOffline
    // =======================================================================
    describe('onSessionOnline', () => {
        it('sends online event for the active voice session', () => {
            setupActiveVoiceSession();

            mod.voiceHooks.onSessionOnline(VOICE_SESSION_ID, { machineId: 'mac-1' });
            vi.advanceTimersByTime(3000);

            expect(mocks.formatSessionOnline).toHaveBeenCalledWith(VOICE_SESSION_ID, { machineId: 'mac-1' });
        });

        it('ignores online events from a different session', () => {
            setupActiveVoiceSession();

            mod.voiceHooks.onSessionOnline(OTHER_SESSION_ID, { machineId: 'mac-2' });
            vi.advanceTimersByTime(3000);

            expect(mocks.formatSessionOnline).not.toHaveBeenCalled();
        });
    });

    describe('onSessionOffline', () => {
        it('sends offline event for the active voice session', () => {
            setupActiveVoiceSession();

            mod.voiceHooks.onSessionOffline(VOICE_SESSION_ID, { machineId: 'mac-1' });
            vi.advanceTimersByTime(3000);

            expect(mocks.formatSessionOffline).toHaveBeenCalledWith(VOICE_SESSION_ID, { machineId: 'mac-1' });
        });

        it('ignores offline events from a different session', () => {
            setupActiveVoiceSession();

            mod.voiceHooks.onSessionOffline(OTHER_SESSION_ID, { machineId: 'mac-2' });
            vi.advanceTimersByTime(3000);

            expect(mocks.formatSessionOffline).not.toHaveBeenCalled();
        });
    });

    // =======================================================================
    // onVoiceStarted / onVoiceStopped (lifecycle — no guard needed)
    // =======================================================================
    describe('onVoiceStarted', () => {
        it('returns initial context for the given session', () => {
            setupActiveVoiceSession();
            mocks.getAllCommands.mockReturnValue([]);

            const prompt = mod.voiceHooks.onVoiceStarted(VOICE_SESSION_ID);

            expect(prompt).toContain('THIS IS AN ACTIVE SESSION');
            expect(mocks.formatSessionFull).toHaveBeenCalled();
        });
    });

    describe('onVoiceStopped', () => {
        it('cleans up without errors', () => {
            expect(() => mod.voiceHooks.onVoiceStopped()).not.toThrow();
            expect(mocks.cleanupBridge).toHaveBeenCalled();
        });
    });

    // =======================================================================
    // Integration: multi-session scenario
    // =======================================================================
    describe('multi-session isolation scenario', () => {
        it('only forwards events from the voice session, ignoring all others', () => {
            setupActiveVoiceSession();
            const thirdSession = 'third-session-789';

            // Simulate events arriving from multiple sessions simultaneously
            mod.voiceHooks.onMessages(OTHER_SESSION_ID, [{ kind: 'agent-text', text: 'leaked' }] as any);
            mod.voiceHooks.onMessages(thirdSession, [{ kind: 'agent-text', text: 'also leaked' }] as any);
            mod.voiceHooks.onMessages(VOICE_SESSION_ID, [{ kind: 'agent-text', text: 'correct' }] as any);

            mod.voiceHooks.onReady(OTHER_SESSION_ID);
            mod.voiceHooks.onReady(VOICE_SESSION_ID);

            mod.voiceHooks.onPermissionRequested(OTHER_SESSION_ID, 'r1', 'Bash', {});
            mod.voiceHooks.onPermissionRequested(VOICE_SESSION_ID, 'r2', 'Bash', {});

            vi.advanceTimersByTime(3000);

            // Only voice session events should have been processed
            expect(mocks.formatNewMessages).toHaveBeenCalledTimes(1);
            expect(mocks.formatNewMessages).toHaveBeenCalledWith(VOICE_SESSION_ID, expect.any(Array));

            expect(mocks.formatReadyEvent).toHaveBeenCalledTimes(1);
            expect(mocks.formatReadyEvent).toHaveBeenCalledWith(VOICE_SESSION_ID);

            expect(mocks.formatPermissionRequest).toHaveBeenCalledTimes(1);
            expect(mocks.formatPermissionRequest).toHaveBeenCalledWith(VOICE_SESSION_ID, 'r2', 'Bash', {});
        });
    });
});
