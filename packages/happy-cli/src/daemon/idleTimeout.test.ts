import { describe, it, expect } from 'vitest';
import { findIdleSessions } from './idleTimeout';
import type { IdleCheckSession } from './idleTimeout';

const NOW = 1_000_000;

describe('findIdleSessions', () => {
    it('returns empty when timeout is 0 (disabled)', () => {
        const sessions: IdleCheckSession[] = [
            { pid: 1, startedAt: NOW - 999_999 } // very old
        ];
        expect(findIdleSessions(sessions, 0, NOW)).toEqual([]);
    });

    it('returns empty when no sessions exist', () => {
        expect(findIdleSessions([], 30_000, NOW)).toEqual([]);
    });

    it('returns empty when all sessions are active (within timeout)', () => {
        const sessions: IdleCheckSession[] = [
            { pid: 1, startedAt: NOW - 10_000, lastActivityAt: NOW - 5_000 },
            { pid: 2, startedAt: NOW - 20_000, lastActivityAt: NOW - 1_000 },
        ];
        expect(findIdleSessions(sessions, 30_000, NOW)).toEqual([]);
    });

    it('returns idle session when lastActivityAt is older than timeout', () => {
        const sessions: IdleCheckSession[] = [
            { pid: 1, startedAt: NOW - 60_000, lastActivityAt: NOW - 45_000 }, // idle 45s
            { pid: 2, startedAt: NOW - 60_000, lastActivityAt: NOW - 5_000 },  // active 5s ago
        ];
        const result = findIdleSessions(sessions, 30_000, NOW);
        expect(result).toEqual([{ pid: 1, idleMs: 45_000 }]);
    });

    it('uses startedAt as fallback when lastActivityAt is undefined', () => {
        const sessions: IdleCheckSession[] = [
            { pid: 1, startedAt: NOW - 60_000 }, // no lastActivityAt, idle since start
        ];
        const result = findIdleSessions(sessions, 30_000, NOW);
        expect(result).toEqual([{ pid: 1, idleMs: 60_000 }]);
    });

    it('returns multiple idle sessions sorted oldest-first', () => {
        const sessions: IdleCheckSession[] = [
            { pid: 1, startedAt: NOW - 100_000, lastActivityAt: NOW - 50_000 }, // idle 50s
            { pid: 2, startedAt: NOW - 100_000, lastActivityAt: NOW - 80_000 }, // idle 80s (oldest)
            { pid: 3, startedAt: NOW - 100_000, lastActivityAt: NOW - 60_000 }, // idle 60s
        ];
        const result = findIdleSessions(sessions, 30_000, NOW);
        expect(result).toEqual([
            { pid: 2, idleMs: 80_000 },
            { pid: 3, idleMs: 60_000 },
            { pid: 1, idleMs: 50_000 },
        ]);
    });

    it('session exactly at timeout boundary is NOT evicted', () => {
        const sessions: IdleCheckSession[] = [
            { pid: 1, startedAt: NOW - 30_000, lastActivityAt: NOW - 30_000 },
        ];
        expect(findIdleSessions(sessions, 30_000, NOW)).toEqual([]);
    });

    it('session 1ms past timeout IS evicted', () => {
        const sessions: IdleCheckSession[] = [
            { pid: 1, startedAt: NOW - 30_001, lastActivityAt: NOW - 30_001 },
        ];
        const result = findIdleSessions(sessions, 30_000, NOW);
        expect(result).toEqual([{ pid: 1, idleMs: 30_001 }]);
    });
});
