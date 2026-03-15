import { useSyncExternalStore } from 'react';

/**
 * Module-level registry tracking how many permission modals are currently open.
 * Prevents auto-open from stacking modals on top of each other.
 * Manual taps (e.g. banner tap) bypass this check intentionally.
 */
let openCount = 0;
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) {
        listener();
    }
}

export function registerPermissionModalOpen(): void {
    openCount++;
    notify();
}

export function registerPermissionModalClose(): void {
    openCount = Math.max(0, openCount - 1);
    notify();
}

export function isAnyPermissionModalOpen(): boolean {
    return openCount > 0;
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function getSnapshot(): boolean {
    return openCount > 0;
}

/**
 * React hook — returns true when any permission modal is open.
 * Used by auto-open logic to suppress stacking.
 */
export function useIsAnyPermissionModalOpen(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
