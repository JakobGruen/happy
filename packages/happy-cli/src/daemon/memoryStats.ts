/**
 * Memory stats collection — pure functions for testability.
 *
 * Collects system memory (via os module) and per-session RSS
 * (via /proc on Linux, null fallback on other platforms).
 */

import os from 'os';
import { readFileSync } from 'fs';

export interface SystemMemory {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
}

export interface SessionMemory {
    pid: number;
    sessionId?: string;
    rssBytes: number | null;
}

export interface MemoryStats {
    system: SystemMemory;
    sessions: SessionMemory[];
    totalSessionBytes: number;
    collectedAt: number;
}

/**
 * Get system-wide memory stats via Node's os module.
 */
export function getSystemMemory(): SystemMemory {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    return {
        totalBytes,
        freeBytes,
        usedBytes: totalBytes - freeBytes,
    };
}

/**
 * Read RSS (Resident Set Size) for a process from /proc/<pid>/status.
 * Returns bytes, or null if not available (non-Linux, dead process, permission error).
 */
export function getProcessRssBytes(pid: number): number | null {
    try {
        const status = readFileSync(`/proc/${pid}/status`, 'utf-8');
        const match = status.match(/VmRSS:\s+(\d+)\s+kB/);
        return match ? parseInt(match[1]) * 1024 : null;
    } catch {
        return null;
    }
}

/**
 * Collect memory stats for all tracked sessions.
 */
export function collectMemoryStats(
    sessions: Array<{ pid: number; sessionId?: string }>
): MemoryStats {
    const system = getSystemMemory();
    let totalSessionBytes = 0;

    const sessionStats: SessionMemory[] = sessions.map(s => {
        const rssBytes = getProcessRssBytes(s.pid);
        if (rssBytes !== null) {
            totalSessionBytes += rssBytes;
        }
        return {
            pid: s.pid,
            sessionId: s.sessionId,
            rssBytes,
        };
    });

    return {
        system,
        sessions: sessionStats,
        totalSessionBytes,
        collectedAt: Date.now(),
    };
}
