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
        sessionId: 'session-1',
        claudeSessionId: 'claude-abc',
        directory: '/home/user/project',
    };

    it('sends session-start before RPC call', async () => {
        machineRPCMock.mockResolvedValue({ type: 'success', sessionId: 'session-1' });

        await machineResumeSession(baseOptions);

        // session-start should be called first
        expect(sendMock).toHaveBeenCalledWith('session-start', expect.objectContaining({
            sid: 'session-1',
            time: expect.any(Number),
        }));
        expect(sendMock.mock.invocationCallOrder[0])
            .toBeLessThan(machineRPCMock.mock.invocationCallOrder[0]);
    });

    it('calls machineRPC with correct params', async () => {
        machineRPCMock.mockResolvedValue({ type: 'success', sessionId: 'session-1' });

        await machineResumeSession(baseOptions);

        expect(machineRPCMock).toHaveBeenCalledWith(
            'machine-1',
            'spawn-happy-session',
            expect.objectContaining({
                type: 'spawn-in-directory',
                directory: '/home/user/project',
                happySessionId: 'session-1',
                claudeSessionId: 'claude-abc',
                approvedNewDirectoryCreation: true,
            }),
        );
    });

    it('returns success result from RPC', async () => {
        const successResult = { type: 'success', sessionId: 'session-1' };
        machineRPCMock.mockResolvedValue(successResult);

        const result = await machineResumeSession(baseOptions);

        expect(result).toEqual(successResult);
    });

    it('reverts with session-end on RPC failure', async () => {
        machineRPCMock.mockRejectedValue(new Error('Connection timeout'));

        await machineResumeSession(baseOptions);

        // Should send session-start first, then session-end on failure
        expect(sendMock).toHaveBeenCalledTimes(2);
        expect(sendMock).toHaveBeenNthCalledWith(1, 'session-start', expect.any(Object));
        expect(sendMock).toHaveBeenNthCalledWith(2, 'session-end', expect.objectContaining({
            sid: 'session-1',
        }));
    });

    it('returns error result on RPC failure', async () => {
        machineRPCMock.mockRejectedValue(new Error('Connection timeout'));

        const result = await machineResumeSession(baseOptions);

        expect(result).toEqual({
            type: 'error',
            errorMessage: 'Connection timeout',
        });
    });

    it('returns generic error message for non-Error throws', async () => {
        machineRPCMock.mockRejectedValue('something broke');

        const result = await machineResumeSession(baseOptions);

        expect(result).toEqual({
            type: 'error',
            errorMessage: 'Failed to reactivate session',
        });
    });
});
