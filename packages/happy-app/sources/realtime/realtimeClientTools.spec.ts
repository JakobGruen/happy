import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock factories -- these run before any module imports
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
    return {
        sendMessage: vi.fn(),
        sessionAllow: vi.fn(),
        sessionDeny: vi.fn(),
        storageGetState: vi.fn(),
        trackPermissionResponse: vi.fn(),
        getCurrentRealtimeSessionId: vi.fn(),
    };
});

vi.mock('@/sync/sync', () => ({
    sync: {
        sendMessage: mocks.sendMessage,
    },
}));

vi.mock('@/sync/ops', () => ({
    sessionAllow: mocks.sessionAllow,
    sessionDeny: mocks.sessionDeny,
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: mocks.storageGetState,
    },
}));

vi.mock('@/track', () => ({
    trackPermissionResponse: mocks.trackPermissionResponse,
}));

vi.mock('./RealtimeSession', () => ({
    getCurrentRealtimeSessionId: mocks.getCurrentRealtimeSessionId,
}));

// ---------------------------------------------------------------------------
// Import the module under test (no module-level state, static import is fine)
// ---------------------------------------------------------------------------
import { realtimeClientTools } from './realtimeClientTools';

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------
describe('realtimeClientTools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ===================================================================
    // messageClaudeCode
    // ===================================================================
    describe('messageClaudeCode', () => {
        it('returns error string when parameters is undefined', async () => {
            const result = await realtimeClientTools.messageClaudeCode(undefined);
            expect(result).toBe('error (invalid message parameter)');
        });

        it('returns error string when message is missing', async () => {
            const result = await realtimeClientTools.messageClaudeCode({});
            expect(result).toBe('error (invalid message parameter)');
        });

        it('returns error string when message is empty', async () => {
            const result = await realtimeClientTools.messageClaudeCode({ message: '' });
            expect(result).toBe('error (invalid message parameter)');
        });

        it('returns error string when message is not a string', async () => {
            const result = await realtimeClientTools.messageClaudeCode({ message: 123 });
            expect(result).toBe('error (invalid message parameter)');
        });

        it('returns error string when no active session', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue(null);

            const result = await realtimeClientTools.messageClaudeCode({ message: 'hello' });

            expect(result).toBe('error (no active session)');
            expect(mocks.sendMessage).not.toHaveBeenCalled();
        });

        it('calls sync.sendMessage with correct sessionId and message', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');

            await realtimeClientTools.messageClaudeCode({ message: 'build the feature' });

            expect(mocks.sendMessage).toHaveBeenCalledWith('session-123', 'build the feature');
        });

        it('returns the "sent" string on success', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');

            const result = await realtimeClientTools.messageClaudeCode({ message: 'hello' });

            expect(result).toBe('Message delivered to Claude Code: "hello". Briefly tell the user what you asked Claude to do and that it\'s working on it.');
        });
    });

    // ===================================================================
    // processPermissionRequest
    // ===================================================================
    describe('processPermissionRequest', () => {
        it('returns error string when parameters is undefined', async () => {
            const result = await realtimeClientTools.processPermissionRequest(undefined);
            expect(result).toBe("error (invalid parameter, expected decision: 'allow'|'deny', optional mode: 'default'|'acceptEdits'|'bypassPermissions')");
        });

        it('returns error string when decision is missing', async () => {
            const result = await realtimeClientTools.processPermissionRequest({});
            expect(result).toBe("error (invalid parameter, expected decision: 'allow'|'deny', optional mode: 'default'|'acceptEdits'|'bypassPermissions')");
        });

        it('returns error string when decision is not allow or deny', async () => {
            const result = await realtimeClientTools.processPermissionRequest({ decision: 'maybe' });
            expect(result).toBe("error (invalid parameter, expected decision: 'allow'|'deny', optional mode: 'default'|'acceptEdits'|'bypassPermissions')");
        });

        it('returns error string when no active session', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue(null);

            const result = await realtimeClientTools.processPermissionRequest({ decision: 'allow' });

            expect(result).toBe('error (no active session)');
        });

        it('returns error string when session has no permission requests', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: { requests: {} },
                    },
                },
            });

            const result = await realtimeClientTools.processPermissionRequest({ decision: 'allow' });

            expect(result).toBe('error (no active permission request)');
        });

        it('returns error string when session has no agentState', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {},
                },
            });

            const result = await realtimeClientTools.processPermissionRequest({ decision: 'allow' });

            expect(result).toBe('error (no active permission request)');
        });

        it('calls sessionAllow and trackPermissionResponse(true) for allow decision', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: {
                            requests: { 'req-abc': { type: 'tool_use' } },
                        },
                    },
                },
            });
            mocks.sessionAllow.mockResolvedValue(undefined);

            const result = await realtimeClientTools.processPermissionRequest({ decision: 'allow' });

            expect(mocks.sessionAllow).toHaveBeenCalledWith('session-123', 'req-abc', undefined);
            expect(mocks.trackPermissionResponse).toHaveBeenCalledWith(true);
            expect(result).toBe("Permission allowed. Briefly confirm to the user.");
        });

        it('calls sessionDeny and trackPermissionResponse(false) for deny decision', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: {
                            requests: { 'req-xyz': { type: 'tool_use' } },
                        },
                    },
                },
            });
            mocks.sessionDeny.mockResolvedValue(undefined);

            const result = await realtimeClientTools.processPermissionRequest({ decision: 'deny' });

            expect(mocks.sessionDeny).toHaveBeenCalledWith('session-123', 'req-xyz', undefined);
            expect(mocks.trackPermissionResponse).toHaveBeenCalledWith(false);
            expect(result).toBe("Permission denied. Briefly confirm to the user.");
        });

        it('returns success string on allow', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: {
                            requests: { 'req-1': {} },
                        },
                    },
                },
            });
            mocks.sessionAllow.mockResolvedValue(undefined);

            const result = await realtimeClientTools.processPermissionRequest({ decision: 'allow' });

            expect(result).toBe("Permission allowed. Briefly confirm to the user.");
        });

        it('uses the first request ID when multiple requests exist', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: {
                            requests: {
                                'req-first': { type: 'tool_use' },
                                'req-second': { type: 'tool_use' },
                            },
                        },
                    },
                },
            });
            mocks.sessionAllow.mockResolvedValue(undefined);

            await realtimeClientTools.processPermissionRequest({ decision: 'allow' });

            expect(mocks.sessionAllow).toHaveBeenCalledWith('session-123', 'req-first', undefined);
        });

        it('returns error string when sessionAllow throws', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: {
                            requests: { 'req-1': {} },
                        },
                    },
                },
            });
            mocks.sessionAllow.mockRejectedValue(new Error('network failure'));

            const result = await realtimeClientTools.processPermissionRequest({ decision: 'allow' });

            expect(result).toBe('error (failed to allow permission)');
        });

        it('returns error string when sessionDeny throws', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: {
                            requests: { 'req-1': {} },
                        },
                    },
                },
            });
            mocks.sessionDeny.mockRejectedValue(new Error('denied failed'));

            const result = await realtimeClientTools.processPermissionRequest({ decision: 'deny' });

            expect(result).toBe('error (failed to deny permission)');
        });
    });

    // ===================================================================
    // answerUserQuestion
    // ===================================================================
    describe('answerUserQuestion', () => {
        it('returns error when parameters is undefined', async () => {
            const result = await realtimeClientTools.answerUserQuestion(undefined);
            expect(result).toBe('error (invalid parameters, expected answers: [{questionIndex, header, selectedLabels}])');
        });

        it('returns error when no active session', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue(null);

            const result = await realtimeClientTools.answerUserQuestion({
                answers: [{ questionIndex: 0, header: 'DB', selectedLabels: ['Postgres'] }],
            });

            expect(result).toBe('error (no active session)');
        });

        it('returns error when no pending requests', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: { requests: {} },
                    },
                },
            });

            const result = await realtimeClientTools.answerUserQuestion({
                answers: [{ questionIndex: 0, header: 'DB', selectedLabels: ['Postgres'] }],
            });

            expect(result).toBe('error (no pending question)');
        });

        it('returns error when no AskUserQuestion request exists', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: {
                            requests: { 'req-1': { tool: 'ExecuteBashCommand' } },
                        },
                    },
                },
            });

            const result = await realtimeClientTools.answerUserQuestion({
                answers: [{ questionIndex: 0, header: 'DB', selectedLabels: ['Postgres'] }],
            });

            expect(result).toBe('error (no pending AskUserQuestion)');
        });

        it('finds AskUserQuestion request among multiple requests', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: {
                            requests: {
                                'req-1': { tool: 'ExecuteBashCommand' },
                                'req-ask': { tool: 'AskUserQuestion' },
                            },
                        },
                    },
                },
            });
            mocks.sessionAllow.mockResolvedValue(undefined);
            mocks.sendMessage.mockResolvedValue(undefined);

            await realtimeClientTools.answerUserQuestion({
                answers: [{ questionIndex: 0, header: 'DB', selectedLabels: ['Postgres'] }],
            });

            expect(mocks.sessionAllow).toHaveBeenCalledWith('session-123', 'req-ask');
        });

        it('calls sessionAllow and sendMessage with correct format', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: {
                            requests: { 'req-ask': { tool: 'AskUserQuestion' } },
                        },
                    },
                },
            });
            mocks.sessionAllow.mockResolvedValue(undefined);
            mocks.sendMessage.mockResolvedValue(undefined);

            const result = await realtimeClientTools.answerUserQuestion({
                answers: [{ questionIndex: 0, header: 'Database', selectedLabels: ['PostgreSQL'] }],
            });

            expect(mocks.sessionAllow).toHaveBeenCalledWith('session-123', 'req-ask');
            expect(mocks.sendMessage).toHaveBeenCalledWith('session-123', 'Database: PostgreSQL');
            expect(mocks.trackPermissionResponse).toHaveBeenCalledWith(true);
            expect(result).toContain('Answer submitted');
        });

        it('formats multi-answer response correctly', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: {
                            requests: { 'req-ask': { tool: 'AskUserQuestion' } },
                        },
                    },
                },
            });
            mocks.sessionAllow.mockResolvedValue(undefined);
            mocks.sendMessage.mockResolvedValue(undefined);

            await realtimeClientTools.answerUserQuestion({
                answers: [
                    { questionIndex: 0, header: 'DB', selectedLabels: ['Postgres'] },
                    { questionIndex: 1, header: 'Cache', selectedLabels: ['Redis', 'Memcached'] },
                ],
            });

            expect(mocks.sendMessage).toHaveBeenCalledWith('session-123', 'DB: Postgres\nCache: Redis, Memcached');
        });

        it('returns error when sessionAllow throws', async () => {
            mocks.getCurrentRealtimeSessionId.mockReturnValue('session-123');
            mocks.storageGetState.mockReturnValue({
                sessions: {
                    'session-123': {
                        agentState: {
                            requests: { 'req-ask': { tool: 'AskUserQuestion' } },
                        },
                    },
                },
            });
            mocks.sessionAllow.mockRejectedValue(new Error('network failure'));

            const result = await realtimeClientTools.answerUserQuestion({
                answers: [{ questionIndex: 0, header: 'DB', selectedLabels: ['Postgres'] }],
            });

            expect(result).toBe('error (failed to submit answer)');
        });
    });
});
