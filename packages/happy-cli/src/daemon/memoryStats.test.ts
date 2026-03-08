import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSystemMemory, getProcessRssBytes, collectMemoryStats } from './memoryStats';

describe('memoryStats', () => {
    describe('getSystemMemory', () => {
        it('returns valid shape with positive numbers', () => {
            const result = getSystemMemory();
            expect(result.totalBytes).toBeGreaterThan(0);
            expect(result.freeBytes).toBeGreaterThan(0);
            expect(result.usedBytes).toBeGreaterThan(0);
            expect(result.usedBytes).toBe(result.totalBytes - result.freeBytes);
        });
    });

    describe('getProcessRssBytes', () => {
        it('returns a positive number for own process (Linux)', () => {
            const result = getProcessRssBytes(process.pid);
            if (process.platform === 'linux') {
                expect(result).toBeGreaterThan(0);
            } else {
                // Non-Linux: should return null gracefully
                expect(result).toBeNull();
            }
        });

        it('returns null for a non-existent PID', () => {
            expect(getProcessRssBytes(999999999)).toBeNull();
        });
    });

    describe('collectMemoryStats', () => {
        it('returns correct shape with empty sessions', () => {
            const result = collectMemoryStats([]);
            expect(result.system.totalBytes).toBeGreaterThan(0);
            expect(result.sessions).toEqual([]);
            expect(result.totalSessionBytes).toBe(0);
            expect(result.collectedAt).toBeGreaterThan(0);
        });

        it('aggregates session memory correctly', () => {
            // Use own process PID for a session that will have real RSS
            const result = collectMemoryStats([
                { pid: process.pid, sessionId: 'test-session' },
                { pid: 999999999 } // non-existent, should be null
            ]);

            expect(result.sessions).toHaveLength(2);

            // Own process session
            const ownSession = result.sessions.find(s => s.pid === process.pid);
            expect(ownSession).toBeDefined();
            expect(ownSession!.sessionId).toBe('test-session');
            if (process.platform === 'linux') {
                expect(ownSession!.rssBytes).toBeGreaterThan(0);
            }

            // Non-existent process session
            const deadSession = result.sessions.find(s => s.pid === 999999999);
            expect(deadSession).toBeDefined();
            expect(deadSession!.rssBytes).toBeNull();
            expect(deadSession!.sessionId).toBeUndefined();
        });

        it('totalSessionBytes sums only non-null RSS values', () => {
            const result = collectMemoryStats([
                { pid: process.pid, sessionId: 'a' },
                { pid: 999999999, sessionId: 'b' } // null RSS
            ]);

            const ownRss = result.sessions.find(s => s.pid === process.pid)?.rssBytes ?? 0;
            expect(result.totalSessionBytes).toBe(ownRss);
        });
    });
});
