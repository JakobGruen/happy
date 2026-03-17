import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from './api';
import axios from 'axios';
import { connectionState } from '@/utils/serverConnectionErrors';

// Use vi.hoisted to ensure mock functions are available when vi.mock factory runs
const { mockPost, mockGet, mockIsAxiosError } = vi.hoisted(() => ({
    mockPost: vi.fn(),
    mockGet: vi.fn(),
    mockIsAxiosError: vi.fn(() => true)
}));

vi.mock('axios', () => ({
    default: {
        post: mockPost,
        get: mockGet,
        isAxiosError: mockIsAxiosError
    },
    isAxiosError: mockIsAxiosError
}));

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
        warn: vi.fn()
    }
}));

// Mock encryption utilities
vi.mock('./encryption', () => ({
    decodeBase64: vi.fn((data: string) => data),
    encodeBase64: vi.fn((data: any) => data),
    decrypt: vi.fn((data: any) => data),
    encrypt: vi.fn((data: any) => data)
}));

// Mock configuration
vi.mock('./configuration', () => ({
    configuration: {
        serverUrl: 'https://api.example.com'
    }
}));

// Mock libsodium encryption
vi.mock('./libsodiumEncryption', () => ({
    libsodiumEncryptForPublicKey: vi.fn((data: any) => new Uint8Array(32))
}));

// Global test metadata
const testMetadata = {
    path: '/tmp',
    host: 'localhost',
    homeDir: '/home/user',
    happyHomeDir: '/home/user/.happy',
    happyLibDir: '/home/user/.happy/lib',
    happyToolsDir: '/home/user/.happy/tools'
};

const testMachineMetadata = {
    host: 'localhost',
    platform: 'darwin',
    happyCliVersion: '1.0.0',
    homeDir: '/home/user',
    happyHomeDir: '/home/user/.happy',
    happyLibDir: '/home/user/.happy/lib'
};

describe('Api server error handling', () => {
    let api: ApiClient;

    beforeEach(async () => {
        vi.clearAllMocks();
        connectionState.reset(); // Reset offline state between tests

        // Create a mock credential
        const mockCredential = {
            token: 'fake-token',
            encryption: {
                type: 'legacy' as const,
                secret: new Uint8Array(32)
            }
        };

        api = await ApiClient.create(mockCredential);
    });

    describe('getOrCreateSession', () => {
        it('should return null when Happy server is unreachable (ECONNREFUSED)', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            // Mock axios to throw connection refused error
            mockPost.mockRejectedValue({ code: 'ECONNREFUSED' });

            const result = await api.getOrCreateSession({
                tag: 'test-tag',
                metadata: testMetadata,
                state: null
            });

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('⚠️  Happy server unreachable')
            );

            consoleSpy.mockRestore();
        });

        it('should return null when Happy server cannot be found (ENOTFOUND)', async () => {
            connectionState.reset();
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            // Mock axios to throw DNS resolution error
            mockPost.mockRejectedValue({ code: 'ENOTFOUND' });

            const result = await api.getOrCreateSession({
                tag: 'test-tag',
                metadata: testMetadata,
                state: null
            });

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('⚠️  Happy server unreachable')
            );

            consoleSpy.mockRestore();
        });

        it('should return null when Happy server times out (ETIMEDOUT)', async () => {
            connectionState.reset();
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            // Mock axios to throw timeout error
            mockPost.mockRejectedValue({ code: 'ETIMEDOUT' });

            const result = await api.getOrCreateSession({
                tag: 'test-tag',
                metadata: testMetadata,
                state: null
            });

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('⚠️  Happy server unreachable')
            );

            consoleSpy.mockRestore();
        });

        it('should return null when session endpoint returns 404', async () => {
            connectionState.reset();
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            // Mock axios to return 404
            mockPost.mockRejectedValue({
                response: { status: 404 },
                isAxiosError: true
            });

            const result = await api.getOrCreateSession({
                tag: 'test-tag',
                metadata: testMetadata,
                state: null
            });

            expect(result).toBeNull();
            // New unified format via connectionState.fail()
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('⚠️  Happy server unreachable')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Session creation failed: 404')
            );

            consoleSpy.mockRestore();
        });

        it('should return null when server returns 500 Internal Server Error', async () => {
            connectionState.reset();
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            // Mock axios to return 500 error
            mockPost.mockRejectedValue({
                response: { status: 500 },
                isAxiosError: true
            });

            const result = await api.getOrCreateSession({
                tag: 'test-tag',
                metadata: testMetadata,
                state: null
            });

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('⚠️  Happy server unreachable')
            );
            consoleSpy.mockRestore();
        });

        it('should return null when server returns 503 Service Unavailable', async () => {
            connectionState.reset();
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            // Mock axios to return 503 error
            mockPost.mockRejectedValue({
                response: { status: 503 },
                isAxiosError: true
            });

            const result = await api.getOrCreateSession({
                tag: 'test-tag',
                metadata: testMetadata,
                state: null
            });

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('⚠️  Happy server unreachable')
            );
            consoleSpy.mockRestore();
        });

        it('should re-throw non-connection errors', async () => {
            // Mock axios to throw a different type of error (e.g., authentication error)
            const authError = new Error('Invalid API key');
            (authError as any).code = 'UNAUTHORIZED';
            mockPost.mockRejectedValue(authError);

            await expect(
                api.getOrCreateSession({ tag: 'test-tag', metadata: testMetadata, state: null })
            ).rejects.toThrow('Failed to get or create session: Invalid API key');

            // Should not show the offline mode message
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            expect(consoleSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('⚠️  Happy server unreachable')
            );
            consoleSpy.mockRestore();
        });
    });

    describe('fetchSession', () => {
        it('should return id and raw metadata blob on success', async () => {
            mockGet.mockResolvedValueOnce({
                data: {
                    session: {
                        id: 'test-session-id',
                        seq: 5,
                        metadata: 'encrypted-blob-base64',
                        metadataVersion: 2,
                    }
                }
            });

            const result = await api.fetchSession('test-session-id');

            expect(mockGet).toHaveBeenCalledWith(
                expect.stringContaining('/v1/sessions/test-session-id'),
                expect.objectContaining({
                    headers: expect.objectContaining({ Authorization: expect.stringContaining('Bearer') })
                })
            );
            expect(result).toEqual({
                id: 'test-session-id',
                metadata: 'encrypted-blob-base64',
            });
        });

        it('should return null when session metadata is null', async () => {
            mockGet.mockResolvedValueOnce({
                data: {
                    session: {
                        id: 'test-session-id',
                        seq: 1,
                        metadata: null,
                    }
                }
            });

            const result = await api.fetchSession('test-session-id');

            expect(result).toEqual({ id: 'test-session-id', metadata: null });
        });

        it('should return null on network error', async () => {
            mockGet.mockRejectedValueOnce(new Error('Network error'));

            const result = await api.fetchSession('test-session-id');

            expect(result).toBeNull();
        });

        it('should return null on 404', async () => {
            const err = { response: { status: 404 } };
            mockIsAxiosError.mockReturnValueOnce(true);
            mockGet.mockRejectedValueOnce(err);

            const result = await api.fetchSession('test-session-id');

            expect(result).toBeNull();
        });
    });

    describe('getOrCreateMachine', () => {
        it('should return minimal machine object when server is unreachable (ECONNREFUSED)', async () => {
            connectionState.reset();
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            // Mock axios to throw connection refused error
            mockPost.mockRejectedValue({ code: 'ECONNREFUSED' });

            const result = await api.getOrCreateMachine({
                machineId: 'test-machine',
                metadata: testMachineMetadata,
                daemonState: {
                    status: 'running',
                    pid: 1234
                }
            });

            expect(result).toEqual({
                id: 'test-machine',
                encryptionKey: expect.any(Uint8Array),
                encryptionVariant: 'legacy',
                metadata: testMachineMetadata,
                metadataVersion: 0,
                daemonState: {
                    status: 'running',
                    pid: 1234
                },
                daemonStateVersion: 0,
            });

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('⚠️  Happy server unreachable')
            );

            consoleSpy.mockRestore();
        });

        it('should return minimal machine object when server endpoint returns 404', async () => {
            connectionState.reset();
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            // Mock axios to return 404
            mockPost.mockRejectedValue({
                response: { status: 404 },
                isAxiosError: true
            });

            const result = await api.getOrCreateMachine({
                machineId: 'test-machine',
                metadata: testMachineMetadata
            });

            expect(result).toEqual({
                id: 'test-machine',
                encryptionKey: expect.any(Uint8Array),
                encryptionVariant: 'legacy',
                metadata: testMachineMetadata,
                metadataVersion: 0,
                daemonState: null,
                daemonStateVersion: 0,
            });

            // New unified format via connectionState.fail()
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('⚠️  Happy server unreachable')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Machine registration failed: 404')
            );

            consoleSpy.mockRestore();
        });
    });
});