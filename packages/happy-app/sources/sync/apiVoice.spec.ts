import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuthCredentials } from '@/auth/tokenStorage';

const TEST_SERVER_URL = 'https://api.test.com';

vi.mock('./serverConfig', () => ({
    getServerUrl: () => TEST_SERVER_URL
}));

import { fetchPipecatSession } from './apiVoice';

describe('apiVoice', () => {
    const mockCredentials: AuthCredentials = {
        token: 'test-token',
        secret: 'test-secret'
    };
    const mockSessionId = 'session-abc-123';

    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('fetchPipecatSession', () => {
        it('sends POST to correct URL with auth header and sessionId', async () => {
            const payload = { url: 'https://voice.example.com/api/offer?session_id=session-abc-123' };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(payload)
            });

            await fetchPipecatSession(mockCredentials, mockSessionId);

            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledWith(
                `${TEST_SERVER_URL}/v1/voice/pipecat-session`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${mockCredentials.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ sessionId: mockSessionId })
                }
            );
        });

        it('returns { url } on success', async () => {
            const payload = { url: 'https://voice.example.com/api/offer?session_id=s1&token=abc' };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(payload)
            });

            const result = await fetchPipecatSession(mockCredentials, mockSessionId);

            expect(result).toEqual(payload);
        });

        it('throws on non-ok response', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 400
            });

            await expect(fetchPipecatSession(mockCredentials, mockSessionId))
                .rejects.toThrow('Pipecat session request failed: 400');
        });

        it('throws on network failure', async () => {
            global.fetch = vi.fn().mockRejectedValue(
                new TypeError('Failed to fetch')
            );

            await expect(fetchPipecatSession(mockCredentials, mockSessionId))
                .rejects.toThrow('Failed to fetch');
        });
    });
});
