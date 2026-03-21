// packages/happy-app/sources/hooks/useDevAutoLogin.ts

/**
 * Auto-login hook for development builds.
 *
 * When both __DEV__ and EXPO_PUBLIC_DEV_AUTO_LOGIN are true, this hook
 * derives a NaCl keypair from the shared dev secret and authenticates
 * via the real POST /v1/auth challenge-response flow.
 *
 * If credentials already exist in storage, the hook does nothing (login
 * already happened on a previous boot).
 *
 * This uses the same auth path as production — no bypasses, no special
 * server endpoints. The dev account must be seeded first (bun seed:dev).
 */

import { useEffect, useRef } from 'react';
import { DEV_AUTH_SECRET_HEX } from '@/dev/devConstants';
import { authGetToken } from '@/auth/authGetToken';
import { encodeBase64 } from '@/encryption/base64';

interface DevAutoLoginOptions {
    isAuthenticated: boolean;
    login: (token: string, secret: string) => Promise<void>;
}

export function useDevAutoLogin({ isAuthenticated, login }: DevAutoLoginOptions) {
    const attempted = useRef(false);

    useEffect(() => {
        if (!__DEV__) return;
        if (process.env.EXPO_PUBLIC_DEV_AUTO_LOGIN !== 'true') return;
        if (isAuthenticated) return;
        if (attempted.current) return;
        attempted.current = true;

        (async () => {
            try {
                const secretBytes = hexToBytes(DEV_AUTH_SECRET_HEX);
                const token = await authGetToken(secretBytes);
                if (token) {
                    await login(token, encodeBase64(secretBytes, 'base64url'));
                    console.log('[DEV] Auto-login successful');
                }
            } catch (error) {
                console.error('[DEV] Auto-login failed:', error);
            }
        })();
    }, [isAuthenticated, login]);
}

function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}
