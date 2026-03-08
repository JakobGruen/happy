/**
 * Process activity detection — pure functions for testability.
 *
 * Reads CPU time from /proc on Linux to detect whether a process
 * is actively working. Returns null on non-Linux platforms.
 */

import { readFileSync } from 'fs';

/**
 * Read total CPU time (user + system) for a process from /proc/<pid>/stat.
 * Returns clock ticks consumed, or null if not available (non-Linux, dead process).
 *
 * /proc/<pid>/stat fields (0-indexed):
 *   13 = utime (user mode ticks)
 *   14 = stime (kernel mode ticks)
 */
export function getProcessCpuTicks(pid: number): number | null {
    try {
        const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
        // Fields are space-separated, but comm (field 1) may contain spaces and parens.
        // Find the closing paren to skip past comm, then split the rest.
        const closingParen = stat.lastIndexOf(')');
        if (closingParen === -1) return null;

        const fields = stat.slice(closingParen + 2).split(' ');
        // After comm: field[0]=state, field[1]=ppid, ... field[11]=utime, field[12]=stime
        const utime = parseInt(fields[11]);
        const stime = parseInt(fields[12]);
        if (isNaN(utime) || isNaN(stime)) return null;

        return utime + stime;
    } catch {
        return null;
    }
}

/**
 * Check multiple processes for CPU activity since last known ticks.
 * Returns updated tick map and list of PIDs that were active.
 */
export function detectActiveProcesses(
    pids: number[],
    lastKnownTicks: Map<number, number>
): { updatedTicks: Map<number, number>; activePids: Set<number> } {
    const updatedTicks = new Map<number, number>();
    const activePids = new Set<number>();

    for (const pid of pids) {
        const currentTicks = getProcessCpuTicks(pid);
        if (currentTicks === null) continue;

        const previousTicks = lastKnownTicks.get(pid);
        if (previousTicks !== undefined && currentTicks > previousTicks) {
            activePids.add(pid);
        }

        updatedTicks.set(pid, currentTicks);
    }

    return { updatedTicks, activePids };
}
