import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMock = vi.fn();
const machineRPCMock = vi.fn();

vi.mock('@/sync/apiSocket', () => ({
    apiSocket: {
        send: sendMock,
        machineRPC: machineRPCMock,
    }
}));

vi.mock('@/sync/sync', () => ({
    sync: { invalidate: vi.fn() },
}));

// Must import after vi.mock
const { machineResumeSession } = await import('./ops');

describe('machineResumeSession', () => {
    beforeEach(() => {
        sendMock.mockClear();
        machineRPCMock.mockClear();
    });

    const baseOptions = {
        machineId: 'machine-1',
        sessionId: 'old-session-1',
        claudeSessionId: 'claude-abc',
        directory: '/home/user/project',
    };

    it('passes happySessionId and claudeSessionId as top-level RPC params for same-session reactivation', async () => {
        machineRPCMock.mockResolvedValue({ type: 'success', sessionId: 'old-session-1' });

        await machineResumeSession(baseOptions);

        expect(machineRPCMock).toHaveBeenCalledWith(
            'machine-1',
            'spawn-happy-session',
            expect.objectContaining({
                type: 'spawn-in-directory',
                directory: '/home/user/project',
                approvedNewDirectoryCreation: true,
                happySessionId: 'old-session-1',
                claudeSessionId: 'claude-abc',
            }),
        );
    });

    it('does not send session-start or session-end (normal spawn handles lifecycle)', async () => {
        machineRPCMock.mockResolvedValue({ type: 'success', sessionId: 'new-session-1' });

        await machineResumeSession(baseOptions);

        expect(sendMock).not.toHaveBeenCalled();
    });

    it('returns success with session ID from daemon', async () => {
        machineRPCMock.mockResolvedValue({ type: 'success', sessionId: 'old-session-1' });

        const result = await machineResumeSession(baseOptions);

        expect(result).toEqual({ type: 'success', sessionId: 'old-session-1' });
    });

    it('returns error on RPC failure', async () => {
        machineRPCMock.mockRejectedValue(new Error('Connection timeout'));

        const result = await machineResumeSession(baseOptions);

        expect(result).toEqual({
            type: 'error',
            errorMessage: 'Connection timeout',
        });
    });

    it('passes caller environmentVariables without injecting resume env var', async () => {
        machineRPCMock.mockResolvedValue({ type: 'success', sessionId: 'old-session-1' });

        await machineResumeSession({
            ...baseOptions,
            environmentVariables: { ANTHROPIC_API_KEY: 'sk-test' },
        });

        const rpcParams = machineRPCMock.mock.calls[0][2];
        expect(rpcParams.environmentVariables).toEqual({
            ANTHROPIC_API_KEY: 'sk-test',
        });
    });
});
