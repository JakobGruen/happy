import { MMKV } from 'react-native-mmkv';

// Separate MMKV instance for server config that persists across logouts
const serverConfigStorage = new MMKV({ id: 'server-config' });

const SERVER_KEY = 'custom-server-url';
const DEFAULT_SERVER_URL = 'https://happy-server.green-wald.de';

// Maps external app hostnames to their corresponding API server URLs.
// When the web app is served from a reverse proxy domain, EXPO_PUBLIC_* env vars
// are baked into the bundle at build time (pointing to localhost), so we need
// runtime detection to route API calls to the correct server.
const EXTERNAL_SERVER_MAP: Record<string, string> = {
    'happy-dev.green-wald.de': 'https://happy-server-dev.green-wald.de',
};

export function getServerUrl(): string {
    const custom = serverConfigStorage.getString(SERVER_KEY);
    if (custom) return custom;

    if (typeof window !== 'undefined' && window.location) {
        const mapped = EXTERNAL_SERVER_MAP[window.location.hostname];
        if (mapped) return mapped;
    }

    return process.env.EXPO_PUBLIC_HAPPY_SERVER_URL || DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string | null): void {
    if (url && url.trim()) {
        serverConfigStorage.set(SERVER_KEY, url.trim());
    } else {
        serverConfigStorage.delete(SERVER_KEY);
    }
}

export function isUsingCustomServer(): boolean {
    return getServerUrl() !== DEFAULT_SERVER_URL;
}

export function getServerInfo(): { hostname: string; port?: number; isCustom: boolean } {
    const url = getServerUrl();
    const isCustom = isUsingCustomServer();
    
    try {
        const parsed = new URL(url);
        const port = parsed.port ? parseInt(parsed.port) : undefined;
        return {
            hostname: parsed.hostname,
            port,
            isCustom
        };
    } catch {
        // Fallback if URL parsing fails
        return {
            hostname: url,
            port: undefined,
            isCustom
        };
    }
}

export function validateServerUrl(url: string): { valid: boolean; error?: string } {
    if (!url || !url.trim()) {
        return { valid: false, error: 'Server URL cannot be empty' };
    }
    
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'Server URL must use HTTP or HTTPS protocol' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}