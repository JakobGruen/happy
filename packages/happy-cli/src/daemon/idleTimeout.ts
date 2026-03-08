/**
 * Pure idle timeout logic — extracted for testability.
 */

export interface IdleCheckSession {
    pid: number;
    startedAt: number;
    lastActivityAt?: number;
}

export interface IdleCheckResult {
    pid: number;
    idleMs: number;
}

/**
 * Returns sessions that have been idle longer than the timeout,
 * sorted by idle duration (longest idle first).
 *
 * Returns empty array if timeoutMs is 0 (feature disabled).
 * Uses `lastActivityAt` if set, falls back to `startedAt`.
 * Boundary: exactly at timeout is NOT considered idle (strictly greater-than).
 */
export function findIdleSessions(
    sessions: IdleCheckSession[],
    timeoutMs: number,
    now: number
): IdleCheckResult[] {
    if (timeoutMs === 0) return [];

    const idle: IdleCheckResult[] = [];

    for (const session of sessions) {
        const lastActive = session.lastActivityAt ?? session.startedAt;
        const idleMs = now - lastActive;
        if (idleMs > timeoutMs) {
            idle.push({ pid: session.pid, idleMs });
        }
    }

    // Sort by idle duration descending (longest idle first)
    idle.sort((a, b) => b.idleMs - a.idleMs);

    return idle;
}
