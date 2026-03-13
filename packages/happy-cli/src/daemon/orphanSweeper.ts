/**
 * Orphan sweeper — pure functions for finding and filtering untracked
 * happy-spawned processes. Runs in the daemon heartbeat loop.
 *
 * Uses /proc directly (instead of ps-list) for efficiency since this
 * executes every 60s.
 */

import { readdirSync, readFileSync } from 'fs';

export interface ProcessInfo {
    pid: number;
    cmdline: string;
}

/** Markers that identify a process as happy-spawned (must have at least one). */
const HAPPY_MARKERS = [
    'mcp__happy__change_title',
    'session-hook-',
    '--started-by daemon',
];

/** Patterns that exclude a process even if it has happy markers (daemon infrastructure). */
const EXCLUDED_PATTERNS = [
    'daemon start',
    'daemon stop',
    'doctor',
    'daemon status',
];

/**
 * Filter a process list to find happy-spawned Claude processes NOT in the tracked set.
 *
 * A process is considered happy-spawned if its cmdline contains at least one of
 * the HAPPY_MARKERS. Processes matching EXCLUDED_PATTERNS, the daemon PID, or
 * already-tracked PIDs are excluded.
 */
export function findOrphanedHappyProcesses(
    processes: ProcessInfo[],
    trackedPids: Set<number>,
    daemonPid: number,
): ProcessInfo[] {
    return processes.filter(proc => {
        // Skip daemon itself and tracked sessions
        if (proc.pid === daemonPid) return false;
        if (trackedPids.has(proc.pid)) return false;

        // Must have at least one happy marker
        const hasHappyMarker = HAPPY_MARKERS.some(marker => proc.cmdline.includes(marker));
        if (!hasHappyMarker) return false;

        // Exclude daemon infrastructure commands
        const isExcluded = EXCLUDED_PATTERNS.some(pattern => proc.cmdline.includes(pattern));
        if (isExcluded) return false;

        return true;
    });
}

/** Grace period in milliseconds before an orphan is eligible for kill. */
const ORPHAN_GRACE_PERIOD_MS = 90_000;

/**
 * Apply a grace period to orphan candidates. An orphan must be seen as orphaned
 * for >= 90 seconds before it is included in the kill list.
 *
 * `seenOrphans` is mutated in-place: new orphans are recorded, stale entries
 * (PIDs no longer in the orphan list) are cleaned up.
 */
export function filterOrphansReadyToKill(
    currentOrphans: ProcessInfo[],
    seenOrphans: Map<number, number>,
    now: number,
): ProcessInfo[] {
    const currentPids = new Set(currentOrphans.map(o => o.pid));

    // Clean up entries for PIDs no longer orphaned
    for (const pid of seenOrphans.keys()) {
        if (!currentPids.has(pid)) {
            seenOrphans.delete(pid);
        }
    }

    const readyToKill: ProcessInfo[] = [];

    for (const orphan of currentOrphans) {
        const firstSeen = seenOrphans.get(orphan.pid);

        if (firstSeen === undefined) {
            // First time seeing this orphan — record and skip
            seenOrphans.set(orphan.pid, now);
            continue;
        }

        if (now - firstSeen >= ORPHAN_GRACE_PERIOD_MS) {
            readyToKill.push(orphan);
        }
    }

    return readyToKill;
}

/**
 * Read all process cmdlines from /proc on Linux.
 * Returns empty array on non-Linux platforms or on error.
 * Null bytes in cmdline are replaced with spaces.
 */
export function readAllProcessCmdlines(): ProcessInfo[] {
    if (process.platform !== 'linux') return [];

    try {
        const entries = readdirSync('/proc');
        const processes: ProcessInfo[] = [];

        for (const entry of entries) {
            const pid = parseInt(entry, 10);
            if (isNaN(pid)) continue;

            try {
                const raw = readFileSync(`/proc/${pid}/cmdline`, 'utf-8');
                if (!raw) continue;
                const cmdline = raw.replace(/\0/g, ' ').trim();
                if (cmdline) {
                    processes.push({ pid, cmdline });
                }
            } catch {
                // Process may have exited between readdir and readFile — skip
            }
        }

        return processes;
    } catch {
        return [];
    }
}
