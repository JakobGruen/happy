import { decodeUTF8, encodeUTF8 } from './text';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';

// Web-specific AES-GCM implementation using Web Crypto API directly.
// Bypasses rn-encryption → web-secure-encryption which has a stack overflow bug:
// String.fromCharCode(...hugeArray) in encryptAES() overflows for large payloads (images).

async function importAESKey(keyBase64: string): Promise<CryptoKey> {
    const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function uint8ToBase64(buffer: Uint8Array): string {
    const CHUNK = 0x2000;
    const parts: string[] = [];
    for (let i = 0; i < buffer.length; i += CHUNK) {
        parts.push(String.fromCharCode.apply(null, Array.from(buffer.subarray(i, i + CHUNK))));
    }
    return btoa(parts.join(''));
}

export async function encryptAESGCMString(data: string, key64: string): Promise<string> {
    const key = await importAESKey(key64);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    const encryptedArray = new Uint8Array(encrypted);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);

    return uint8ToBase64(combined);
}

export async function decryptAESGCMString(data: string, key64: string): Promise<string | null> {
    const key = await importAESKey(key64);
    const decoded = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const iv = decoded.slice(0, 12);
    const ciphertext = decoded.slice(12);

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
}

export async function encryptAESGCM(data: Uint8Array, key64: string): Promise<Uint8Array> {
    const encrypted = (await encryptAESGCMString(decodeUTF8(data), key64)).trim();
    return decodeBase64(encrypted);
}

export async function decryptAESGCM(data: Uint8Array, key64: string): Promise<Uint8Array | null> {
    const raw = await decryptAESGCMString(encodeBase64(data), key64);
    return raw ? encodeUTF8(raw) : null;
}
