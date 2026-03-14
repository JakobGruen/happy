/**
 * Reactive set of session IDs currently being reactivated.
 * Used for optimistic UI: sessions in this set appear in the active group
 * with a loading indicator before the server confirms reactivation.
 *
 * Uses useSyncExternalStore with a version counter for proper React reactivity.
 */
import { useSyncExternalStore } from 'react';

const reactivatingIds = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
    version++;
    listeners.forEach(l => l());
}

export function markReactivating(sessionId: string) {
    reactivatingIds.add(sessionId);
    notify();
}

export function unmarkReactivating(sessionId: string) {
    if (reactivatingIds.delete(sessionId)) {
        notify();
    }
}

export function isReactivating(sessionId: string): boolean {
    return reactivatingIds.has(sessionId);
}

export function getReactivatingIds(): ReadonlySet<string> {
    return reactivatingIds;
}

function subscribe(callback: () => void) {
    listeners.add(callback);
    return () => { listeners.delete(callback); };
}

function getSnapshot(): number {
    return version;
}

/** Returns true if the given session is currently being reactivated */
export function useIsReactivating(sessionId: string): boolean {
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return reactivatingIds.has(sessionId);
}

/** Returns the current set of reactivating IDs (triggers re-render on change) */
export function useReactivatingIds(): ReadonlySet<string> {
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return reactivatingIds;
}
