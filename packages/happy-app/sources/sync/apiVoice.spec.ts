import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuthCredentials } from '@/auth/tokenStorage';

const TEST_SERVER_URL = 'https://api.test.com';

// Mock modules before imports
vi.mock('./serverConfig', () => ({
    getServerUrl: () => TEST_SERVER_URL
}));

vi.mock('@/sync/storage', () => ({
    storage: {
        getState: () => ({ profile: { id: 'test-user-id' } })
    }
}));

vi.mock('@/config', () => ({
    config: {
        elevenLabsAgentIdDev: 'dev-agent-id-123',
        elevenLabsAgentIdProd: 'prod-agent-id-456'
    }
}));

// Define __DEV__ global so fetchVoiceToken uses the dev agent ID
vi.stubGlobal('__DEV__', true);

import { fetchVoiceToken, fetchLiveKitToken } from './apiVoice';

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

    // -------------------------------------------------------
    // fetchLiveKitToken
    // -------------------------------------------------------
    describe('fetchLiveKitToken', () => {
        it('sends POST to correct URL with auth header and sessionId', async () => {
            const payload: { url: string; token: string } = {
                url: 'wss://livekit.example.com',
                token: 'lk-token-xyz'
            };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(payload)
            });

            await fetchLiveKitToken(mockCredentials, mockSessionId);

            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledWith(
                `${TEST_SERVER_URL}/v1/voice/livekit-token`,
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

        it('returns { url, token } on success', async () => {
            const payload = {
                url: 'wss://livekit.example.com',
                token: 'lk-token-xyz'
            };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(payload)
            });

            const result = await fetchLiveKitToken(mockCredentials, mockSessionId);

            expect(result).toEqual(payload);
        });

        it('throws on 401 response', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401
            });

            await expect(fetchLiveKitToken(mockCredentials, mockSessionId))
                .rejects.toThrow('LiveKit token request failed: 401');
        });

        it('throws on 500 response', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500
            });

            await expect(fetchLiveKitToken(mockCredentials, mockSessionId))
                .rejects.toThrow('LiveKit token request failed: 500');
        });

        it('throws on network failure', async () => {
            global.fetch = vi.fn().mockRejectedValue(
                new TypeError('Failed to fetch')
            );

            await expect(fetchLiveKitToken(mockCredentials, mockSessionId))
                .rejects.toThrow('Failed to fetch');
        });
    });

    // -------------------------------------------------------
    // fetchVoiceToken
    // -------------------------------------------------------
    describe('fetchVoiceToken', () => {
        it('sends POST to correct URL with auth header and body', async () => {
            const payload = {
                allowed: true,
                token: 'voice-token-abc',
                agentId: 'returned-agent-id'
            };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(payload)
            });

            await fetchVoiceToken(mockCredentials, mockSessionId);

            expect(global.fetch).toHaveBeenCalledTimes(1);
            expect(global.fetch).toHaveBeenCalledWith(
                `${TEST_SERVER_URL}/v1/voice/token`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${mockCredentials.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: mockSessionId,
                        agentId: 'dev-agent-id-123'
                    })
                }
            );
        });

        it('returns { allowed, token, agentId } on success', async () => {
            const payload = {
                allowed: true,
                token: 'voice-token-abc',
                agentId: 'returned-agent-id'
            };
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(payload)
            });

            const result = await fetchVoiceToken(mockCredentials, mockSessionId);

            expect(result).toEqual(payload);
        });

        it('returns { allowed: true } on 400 response (backward compat)', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 400
            });

            const result = await fetchVoiceToken(mockCredentials, mockSessionId);

            expect(result).toEqual({ allowed: true });
        });

        it('throws on 500 response', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500
            });

            await expect(fetchVoiceToken(mockCredentials, mockSessionId))
                .rejects.toThrow('Voice token request failed: 500');
        });

        it('throws when agentId is not configured', async () => {
            // Temporarily override the config mock to return undefined agent IDs
            const configModule = await import('@/config');
            const originalDev = configModule.config.elevenLabsAgentIdDev;
            const originalProd = configModule.config.elevenLabsAgentIdProd;

            (configModule.config as any).elevenLabsAgentIdDev = undefined;
            (configModule.config as any).elevenLabsAgentIdProd = undefined;

            await expect(fetchVoiceToken(mockCredentials, mockSessionId))
                .rejects.toThrow('Agent ID not configured');

            // Restore so other tests are unaffected
            (configModule.config as any).elevenLabsAgentIdDev = originalDev;
            (configModule.config as any).elevenLabsAgentIdProd = originalProd;
        });
    });
});
