import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { storeSessionKey, loadSessionKey } from './sessionKeyStore';
import { rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = '/tmp/happy-keystore-test-' + Date.now();

describe('sessionKeyStore', () => {
    beforeAll(() => {
        process.env.HAPPY_HOME_DIR = TEST_DIR;
    });

    afterAll(() => {
        try { rmSync(TEST_DIR, { recursive: true }); } catch {}
        delete process.env.HAPPY_HOME_DIR;
    });

    it('should store and load a dataKey session key', async () => {
        const key = new Uint8Array(32);
        for (let i = 0; i < 32; i++) key[i] = i;

        await storeSessionKey('sess-1', key, 'dataKey');
        const loaded = await loadSessionKey('sess-1');

        expect(loaded).not.toBeNull();
        expect(loaded!.encryptionVariant).toBe('dataKey');
        expect(loaded!.encryptionKey).toEqual(key);
    });

    it('should store and load a legacy session key', async () => {
        const key = new Uint8Array(32);
        for (let i = 0; i < 32; i++) key[i] = 255 - i;

        await storeSessionKey('sess-2', key, 'legacy');
        const loaded = await loadSessionKey('sess-2');

        expect(loaded).not.toBeNull();
        expect(loaded!.encryptionVariant).toBe('legacy');
        expect(loaded!.encryptionKey).toEqual(key);
    });

    it('should return null for nonexistent session', async () => {
        const loaded = await loadSessionKey('nonexistent');
        expect(loaded).toBeNull();
    });

    it('should overwrite existing key', async () => {
        const key1 = new Uint8Array(32).fill(1);
        const key2 = new Uint8Array(32).fill(2);

        await storeSessionKey('sess-3', key1, 'legacy');
        await storeSessionKey('sess-3', key2, 'dataKey');

        const loaded = await loadSessionKey('sess-3');
        expect(loaded).not.toBeNull();
        expect(loaded!.encryptionVariant).toBe('dataKey');
        expect(loaded!.encryptionKey).toEqual(key2);
    });
});
