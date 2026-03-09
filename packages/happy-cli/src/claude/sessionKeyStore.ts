import { join } from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';

interface StoredSessionKey {
    encryptionKey: string; // base64
    encryptionVariant: 'legacy' | 'dataKey';
}

function sessionKeysDir(): string {
    return join(configuration.happyHomeDir, 'session-keys');
}

function keyFilePath(sessionId: string): string {
    return join(sessionKeysDir(), `${sessionId}.json`);
}

/**
 * Store a session's encryption key locally for future reactivation.
 * Writes to ~/.happy/session-keys/<sessionId>.json
 */
export async function storeSessionKey(
    sessionId: string,
    encryptionKey: Uint8Array,
    encryptionVariant: 'legacy' | 'dataKey'
): Promise<void> {
    try {
        const dir = sessionKeysDir();
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }

        const data: StoredSessionKey = {
            encryptionKey: Buffer.from(encryptionKey).toString('base64'),
            encryptionVariant,
        };

        await writeFile(keyFilePath(sessionId), JSON.stringify(data));
        logger.debug(`[SESSION KEY] Stored encryption key for session ${sessionId}`);
    } catch (error) {
        // Non-fatal — reactivation won't work but session creation proceeds
        logger.debug(`[SESSION KEY] Failed to store key for session ${sessionId}:`, error);
    }
}

/**
 * Load a stored session encryption key for reactivation.
 * Returns null if no key is stored for this session.
 */
export async function loadSessionKey(
    sessionId: string
): Promise<{ encryptionKey: Uint8Array; encryptionVariant: 'legacy' | 'dataKey' } | null> {
    try {
        const path = keyFilePath(sessionId);
        if (!existsSync(path)) {
            return null;
        }

        const raw = await readFile(path, 'utf8');
        const data: StoredSessionKey = JSON.parse(raw);

        return {
            encryptionKey: new Uint8Array(Buffer.from(data.encryptionKey, 'base64')),
            encryptionVariant: data.encryptionVariant,
        };
    } catch (error) {
        logger.debug(`[SESSION KEY] Failed to load key for session ${sessionId}:`, error);
        return null;
    }
}
