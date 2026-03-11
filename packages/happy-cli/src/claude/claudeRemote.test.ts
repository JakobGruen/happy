import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PushableAsyncIterable } from '@/utils/PushableAsyncIterable';
import type { SDKMessage, SDKUserMessage, SDKSystemMessage, SDKResultMessage } from '@/claude/sdk';

// Hoisted mocks
const { mockQuery, mockLogger } = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockLogger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debugLargeJson: vi.fn(),
    },
}));

vi.mock('@/claude/sdk', () => ({
    query: mockQuery,
    AbortError: class AbortError extends Error { name = 'AbortError'; },
}));

vi.mock('@/ui/logger', () => ({
    logger: mockLogger,
}));

import { claudeRemote } from './claudeRemote';

vi.mock('./utils/claudeCheckSession', () => ({
    claudeCheckSession: vi.fn(() => true),
}));

vi.mock('./utils/path', () => ({
    getProjectPath: vi.fn((path: string) => path),
}));

vi.mock('./utils/systemPrompt', () => ({
    systemPrompt: 'test-system-prompt',
}));

vi.mock('./utils/permissionMode', () => ({
    mapToClaudeMode: (mode: string) => mode,
}));

vi.mock('@/modules/watcher/awaitFileExist', () => ({
    awaitFileExist: vi.fn(async (path: string) => path),
}));

vi.mock('node:path', () => ({
    join: (...args: string[]) => args.join('/'),
    resolve: (...args: string[]) => args.join('/'),
}));

vi.mock('@/projectPath', () => ({
    projectPath: () => '/project/path',
}));

vi.mock('@/parsers/specialCommands', () => ({
    parseSpecialCommand: (text: string) => {
        if (text.startsWith('/clear')) {
            return { type: 'clear' };
        }
        if (text.startsWith('/compact')) {
            return { type: 'compact' };
        }
        return { type: null };
    },
}));

describe('claudeRemote - Eager Session Initialization', () => {
    let nextMessageMock: any;
    let onMessageMock: any;
    let onReadyMock: any;
    let onSessionFoundMock: any;
    let messageStreamCapture: PushableAsyncIterable<SDKUserMessage> | null = null;

    beforeEach(() => {
        vi.clearAllMocks();

        nextMessageMock = vi.fn();
        onMessageMock = vi.fn();
        onReadyMock = vi.fn();
        onSessionFoundMock = vi.fn();

        // Capture the message stream passed to query()
        mockQuery.mockImplementation(({ prompt, options }: any) => {
            messageStreamCapture = prompt;
            // Return an async iterable that yields system.init then result
            return (async function* () {
                yield {
                    type: 'system',
                    subtype: 'init',
                    session_id: 'test-session-123',
                    model: 'claude-opus',
                } as SDKSystemMessage;

                yield {
                    type: 'result',
                    duration_ms: 100,
                    num_turns: 1,
                    total_cost_usd: 0.01,
                } as SDKResultMessage;
            })();
        });
    });

    afterEach(() => {
        messageStreamCapture = null;
    });

    it('should start SDK immediately without waiting for first message', async () => {
        // Setup: nextMessage will never resolve (no message sent)
        nextMessageMock.mockImplementation(
            () => new Promise(() => {}) // Never resolves
        );

        // Start claudeRemote (don't await - it will start immediately)
        claudeRemote({
            sessionId: null,
            path: '/test',
            allowedTools: [],
            hookSettingsPath: '/test/hooks.json',
            canCallTool: async () => ({ behavior: 'allow' as const }),
            isAborted: () => false,
            onMessage: onMessageMock,
            onSessionFound: onSessionFoundMock,
            onReady: onReadyMock,
            nextMessage: nextMessageMock,
        });

        // Give it a tick to spawn the SDK
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify: query() was called immediately (SDK started)
        expect(mockQuery).toHaveBeenCalled();

        // Verify: SDK got an empty message stream initially
        expect(messageStreamCapture).toBeDefined();
        expect(messageStreamCapture?.queueSize).toBe(0);
    });

    it('should push first message to stream when it arrives', async () => {
        let resolveFirstMessage: any;
        const firstMessagePromise = new Promise(resolve => {
            resolveFirstMessage = resolve;
        });

        // Return null for second call (result handler shouldn't push another message in test)
        let callCount = 0;
        nextMessageMock.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return firstMessagePromise;
            }
            return new Promise(() => {}); // Never resolves for second call
        });

        // Start claudeRemote
        claudeRemote({
            sessionId: null,
            path: '/test',
            allowedTools: [],
            hookSettingsPath: '/test/hooks.json',
            canCallTool: async () => ({ behavior: 'allow' as const }),
            isAborted: () => false,
            onMessage: onMessageMock,
            onSessionFound: onSessionFoundMock,
            onReady: onReadyMock,
            nextMessage: nextMessageMock,
        });

        // Give SDK time to start
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify SDK started with empty stream
        expect(mockQuery).toHaveBeenCalled();
        expect(messageStreamCapture?.queueSize).toBe(0);

        // Now provide the first message
        resolveFirstMessage({
            message: 'Hello Claude',
            mode: { permissionMode: 'default' },
        });

        // Give async handler time to process
        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify: message was pushed to the stream
        expect(messageStreamCapture?.queueSize).toBe(1);
    });

    it('should handle /clear command on first message', async () => {
        let resolveFirstMessage: any;
        const firstMessagePromise = new Promise(resolve => {
            resolveFirstMessage = resolve;
        });

        nextMessageMock.mockReturnValue(firstMessagePromise);

        const onSessionResetMock = vi.fn();
        const onCompletionEventMock = vi.fn();

        // Start claudeRemote
        claudeRemote({
            sessionId: null,
            path: '/test',
            allowedTools: [],
            hookSettingsPath: '/test/hooks.json',
            canCallTool: async () => ({ behavior: 'allow' as const }),
            isAborted: () => false,
            onMessage: onMessageMock,
            onSessionFound: onSessionFoundMock,
            onReady: onReadyMock,
            onSessionReset: onSessionResetMock,
            onCompletionEvent: onCompletionEventMock,
            nextMessage: nextMessageMock,
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        // Send /clear command
        resolveFirstMessage({
            message: '/clear',
            mode: { permissionMode: 'default' },
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify: /clear was handled
        expect(onCompletionEventMock).toHaveBeenCalledWith('Context was reset');
        expect(onSessionResetMock).toHaveBeenCalled();

        // Verify: stream was ended (no message pushed)
        expect(messageStreamCapture?.done).toBe(true);
    });

    it('should handle /compact command on first message', async () => {
        let resolveFirstMessage: any;
        const firstMessagePromise = new Promise(resolve => {
            resolveFirstMessage = resolve;
        });

        // Return unresolved promise for second call to prevent duplicate message
        let callCount = 0;
        nextMessageMock.mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
                return firstMessagePromise;
            }
            return new Promise(() => {}); // Never resolves for second call
        });

        const onCompletionEventMock = vi.fn();

        // Start claudeRemote
        claudeRemote({
            sessionId: null,
            path: '/test',
            allowedTools: [],
            hookSettingsPath: '/test/hooks.json',
            canCallTool: async () => ({ behavior: 'allow' as const }),
            isAborted: () => false,
            onMessage: onMessageMock,
            onSessionFound: onSessionFoundMock,
            onReady: onReadyMock,
            onCompletionEvent: onCompletionEventMock,
            nextMessage: nextMessageMock,
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        // Send /compact command
        resolveFirstMessage({
            message: '/compact',
            mode: { permissionMode: 'default' },
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify: /compact was recognized
        expect(onCompletionEventMock).toHaveBeenCalledWith('Compaction started');

        // Verify: message was still pushed (unlike /clear)
        expect(messageStreamCapture?.queueSize).toBe(1);
    });

    it('should start with default mode when no first message', async () => {
        // nextMessage never resolves
        nextMessageMock.mockImplementation(
            () => new Promise(() => {})
        );

        // Mock query to capture the sdkOptions
        let capturedOptions: any;
        mockQuery.mockImplementation(({ prompt, options }: any) => {
            messageStreamCapture = prompt;
            capturedOptions = options;
            return (async function* () {
                yield {
                    type: 'system',
                    subtype: 'init',
                    session_id: 'test-session',
                    model: 'claude-opus',
                } as SDKSystemMessage;
            })();
        });

        // Start claudeRemote
        claudeRemote({
            sessionId: null,
            path: '/test',
            allowedTools: [],
            hookSettingsPath: '/test/hooks.json',
            canCallTool: async () => ({ behavior: 'allow' as const }),
            isAborted: () => false,
            onMessage: onMessageMock,
            onSessionFound: onSessionFoundMock,
            onReady: onReadyMock,
            nextMessage: nextMessageMock,
        });

        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify: SDK was started with default permission mode
        expect(capturedOptions.permissionMode).toBe('default');
    });

    it('should not block on nextMessage at startup', async () => {
        const callOrder: string[] = [];

        nextMessageMock.mockImplementation(async () => {
            callOrder.push('nextMessage-called');
            await new Promise(resolve => setTimeout(resolve, 100)); // Slow message
            return { message: 'Hello', mode: { permissionMode: 'default' } };
        });

        mockQuery.mockImplementation(({ prompt, options }: any) => {
            messageStreamCapture = prompt;
            callOrder.push('query-called');
            return (async function* () {
                yield {
                    type: 'system',
                    subtype: 'init',
                    session_id: 'test-session',
                    model: 'claude-opus',
                } as SDKSystemMessage;
            })();
        });

        // Start claudeRemote
        claudeRemote({
            sessionId: null,
            path: '/test',
            allowedTools: [],
            hookSettingsPath: '/test/hooks.json',
            canCallTool: async () => ({ behavior: 'allow' as const }),
            isAborted: () => false,
            onMessage: onMessageMock,
            onSessionFound: onSessionFoundMock,
            onReady: onReadyMock,
            nextMessage: nextMessageMock,
        });

        // Give it a tick
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify: query was called before nextMessage resolved
        expect(callOrder[0]).toBe('query-called');
    });
});
