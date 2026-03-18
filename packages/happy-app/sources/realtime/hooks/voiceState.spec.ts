import { describe, it, expect } from 'vitest';
import { buildSessionState } from './voiceState';
import type { Session } from '@/sync/storageTypes';

// Minimal session factory — only fields buildSessionState reads
function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'test-session-id',
        seq: 0,
        createdAt: 0,
        updatedAt: 0,
        active: true,
        activeAt: 0,
        metadata: null,
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        ...overrides,
    };
}

describe('buildSessionState', () => {
    it('returns defaults when metadata is null', () => {
        const session = makeSession({ metadata: null });
        const state = buildSessionState(session);

        expect(state).toEqual({
            sessionId: 'test-session-id',
            model: 'sonnet',
            permissionMode: 'default',
            autoApproveTools: false,
            isWorking: false,
        });
    });

    it('reads model from metadata.currentModelCode', () => {
        const session = makeSession({
            metadata: {
                currentModelCode: 'opus',
                path: '/test',
                host: 'test-host',
            },
        });
        const state = buildSessionState(session);

        expect(state.model).toBe('opus');
    });

    it('reads permissionMode from metadata.currentOperatingModeCode', () => {
        const session = makeSession({
            metadata: {
                currentOperatingModeCode: 'plan',
                path: '/test',
                host: 'test-host',
            },
        });
        const state = buildSessionState(session);

        expect(state.permissionMode).toBe('plan');
    });

    it('reads autoApproveTools from metadata', () => {
        const session = makeSession({
            metadata: {
                autoApproveTools: true,
                path: '/test',
                host: 'test-host',
            },
        });
        const state = buildSessionState(session);

        expect(state.autoApproveTools).toBe(true);
    });

    it('falls back to session.autoApproveTools when metadata has no value', () => {
        const session = makeSession({
            autoApproveTools: true,
            metadata: {
                path: '/test',
                host: 'test-host',
            },
        });
        const state = buildSessionState(session);

        expect(state.autoApproveTools).toBe(true);
    });

    it('reads isWorking from session.thinking', () => {
        const session = makeSession({ thinking: true });
        const state = buildSessionState(session);

        expect(state.isWorking).toBe(true);
    });

    it('defaults isWorking to false', () => {
        const session = makeSession({ thinking: false });
        const state = buildSessionState(session);

        expect(state.isWorking).toBe(false);
    });

    it('prefers metadata.autoApproveTools over session.autoApproveTools', () => {
        const session = makeSession({
            autoApproveTools: false,
            metadata: {
                autoApproveTools: true,
                path: '/test',
                host: 'test-host',
            },
        });
        const state = buildSessionState(session);

        expect(state.autoApproveTools).toBe(true);
    });
});
