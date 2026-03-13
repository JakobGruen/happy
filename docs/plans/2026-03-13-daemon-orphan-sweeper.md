# Daemon Orphan Process Sweeper

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the daemon reliably kills all happy-spawned Claude processes, even those it lost track of.

**Architecture:** Add a periodic orphan sweeper to the daemon heartbeat that scans `/proc/*/cmdline` for Claude processes spawned by Happy (identified by `mcp__happy__change_title` or `session-hook-` markers in their args). Untracked processes get auto-adopted and killed. Also improve the app-side `sessionArchive()` to fall back to the daemon's `stop-session` RPC when the direct CLI kill fails.

**Tech Stack:** Node.js `/proc` filesystem reads (Linux), existing daemon heartbeat loop, Socket.IO machine RPC

---

## Problem Statement

When the app archives a session:
1. `sessionKill()` sends RPC **directly to the CLI process** via Socket.IO
2. If the CLI's socket is disconnected (common for old/idle sessions), the RPC times out
3. The fallback only sends `session-end` to the **server** (marks DB inactive) — the **OS process stays alive**
4. The daemon never learns about the kill request
5. The daemon's idle timeout only covers **tracked** sessions — orphans are invisible
6. Result: zombie Claude processes accumulate for days, consuming ~40-100 MiB RSS each

Evidence: memory report from 2026-03-13 shows 12+ stale Claude processes from 5 days ago, all with `ppid=1` (orphaned), while `daemon.children.json` is empty.

## Root Causes

1. **Archive bypasses daemon** — kill RPC goes App → Server → CLI session, not through daemon
2. **Some sessions never register** — simpler `--resume` spawns without full happy pipeline skip the webhook
3. **Daemon tracking is lossy** — if daemon restarts and `daemon.children.json` wasn't persisted, PIDs vanish
4. **No process discovery** — daemon only knows what it tracks, has no way to find untracked orphans

## Solution: Two-Pronged Fix

### Prong 1: Orphan Sweeper (daemon-side)
New pure function that scans `/proc/*/cmdline` for happy-spawned Claude processes not in the tracking map. Integrated into the heartbeat loop with a 2-tick grace period (process must be seen as orphan for 2 consecutive heartbeats before being killed, to avoid race conditions with just-starting sessions).

### Prong 2: Daemon Fallback (app-side)
When `sessionKill()` RPC fails, before giving up, try `machineRPC('stop-session', { sessionId })` to ask the daemon to kill it. The daemon has the PID and can SIGTERM directly.

---

## Task 1: Orphan Sweeper Pure Function

**Files:**
- Create: `packages/happy-cli/src/daemon/orphanSweeper.ts`
- Create: `packages/happy-cli/src/daemon/orphanSweeper.test.ts`

### Step 1: Write the failing test

```typescript
// orphanSweeper.test.ts
import { describe, it, expect } from 'vitest';
import { findOrphanedHappyProcesses, type ProcessInfo } from './orphanSweeper';

describe('findOrphanedHappyProcesses', () => {
    const DAEMON_PID = 1000;

    it('identifies happy-spawned claude process by mcp__happy__change_title marker', () => {
        const processes: ProcessInfo[] = [
            { pid: 2000, cmdline: '/home/user/.local/share/claude/versions/2.1.71 --append-system-prompt mcp__happy__change_title --permission-prompt-tool stdio' },
        ];
        const trackedPids = new Set<number>();
        const result = findOrphanedHappyProcesses(processes, trackedPids, DAEMON_PID);
        expect(result).toEqual([{ pid: 2000, cmdline: processes[0].cmdline }]);
    });

    it('identifies happy-spawned claude process by session-hook marker', () => {
        const processes: ProcessInfo[] = [
            { pid: 2000, cmdline: '/home/user/.local/share/claude/versions/2.1.71 --settings /home/user/.happy/tmp/hooks/session-hook-12345.json' },
        ];
        const trackedPids = new Set<number>();
        const result = findOrphanedHappyProcesses(processes, trackedPids, DAEMON_PID);
        expect(result).toEqual([{ pid: 2000, cmdline: processes[0].cmdline }]);
    });

    it('excludes already-tracked PIDs', () => {
        const processes: ProcessInfo[] = [
            { pid: 2000, cmdline: 'claude --append-system-prompt mcp__happy__change_title' },
        ];
        const trackedPids = new Set([2000]);
        const result = findOrphanedHappyProcesses(processes, trackedPids, DAEMON_PID);
        expect(result).toEqual([]);
    });

    it('excludes daemon PID itself', () => {
        const processes: ProcessInfo[] = [
            { pid: DAEMON_PID, cmdline: 'node dist/index.mjs daemon start-sync' },
        ];
        const trackedPids = new Set<number>();
        const result = findOrphanedHappyProcesses(processes, trackedPids, DAEMON_PID);
        expect(result).toEqual([]);
    });

    it('excludes non-happy claude processes (e.g. VS Code, user terminal)', () => {
        const processes: ProcessInfo[] = [
            { pid: 3000, cmdline: 'claude' },
            { pid: 3001, cmdline: 'claude -c' },
            { pid: 3002, cmdline: '/path/to/claude --output-format stream-json --verbose --input-format stream-json --max-thinking-tokens 31999' },
        ];
        const trackedPids = new Set<number>();
        const result = findOrphanedHappyProcesses(processes, trackedPids, DAEMON_PID);
        expect(result).toEqual([]);
    });

    it('excludes happy daemon and doctor processes', () => {
        const processes: ProcessInfo[] = [
            { pid: 4000, cmdline: 'node dist/index.mjs daemon start-sync' },
            { pid: 4001, cmdline: 'node dist/index.mjs doctor' },
        ];
        const trackedPids = new Set<number>();
        const result = findOrphanedHappyProcesses(processes, trackedPids, DAEMON_PID);
        expect(result).toEqual([]);
    });

    it('returns empty for empty process list', () => {
        const result = findOrphanedHappyProcesses([], new Set(), DAEMON_PID);
        expect(result).toEqual([]);
    });
});
```

### Step 2: Run test to verify it fails

Run: `cd packages/happy-cli && npx vitest run src/daemon/orphanSweeper.test.ts`
Expected: FAIL — module not found

### Step 3: Write the implementation

```typescript
// orphanSweeper.ts
/**
 * Orphan sweeper — finds happy-spawned Claude processes not tracked by the daemon.
 *
 * Pure function: takes process list + tracked PIDs, returns orphans.
 * The caller (heartbeat) handles reading /proc and killing.
 */

import { readdirSync, readFileSync } from 'fs';

export interface ProcessInfo {
    pid: number;
    cmdline: string;
}

/**
 * Markers that distinguish happy-spawned Claude processes from user/VS Code sessions.
 * A process must contain at least one of these in its cmdline.
 */
const HAPPY_SPAWNED_MARKERS = [
    'mcp__happy__change_title',
    'session-hook-',
    '--started-by daemon',
] as const;

/**
 * Patterns that indicate non-session processes (daemon, doctor, etc.) — skip these.
 */
const EXCLUDED_PATTERNS = [
    'daemon start',
    'daemon stop',
    'doctor',
    'daemon status',
] as const;

/**
 * Given a list of processes and the set of currently tracked PIDs,
 * returns processes that look like happy-spawned Claude sessions
 * but are NOT in the tracked set.
 */
export function findOrphanedHappyProcesses(
    processes: ProcessInfo[],
    trackedPids: Set<number>,
    daemonPid: number,
): ProcessInfo[] {
    return processes.filter(proc => {
        // Skip ourselves and tracked sessions
        if (proc.pid === daemonPid || trackedPids.has(proc.pid)) return false;

        const cmd = proc.cmdline;

        // Skip daemon/doctor/control processes
        if (EXCLUDED_PATTERNS.some(p => cmd.includes(p))) return false;

        // Must have at least one happy-spawned marker
        return HAPPY_SPAWNED_MARKERS.some(marker => cmd.includes(marker));
    });
}

/**
 * Reads all process cmdlines from /proc on Linux.
 * Returns empty array on non-Linux or on error.
 */
export function readAllProcessCmdlines(): ProcessInfo[] {
    try {
        const entries = readdirSync('/proc', { withFileTypes: true });
        const processes: ProcessInfo[] = [];

        for (const entry of entries) {
            const pid = parseInt(entry.name);
            if (isNaN(pid)) continue;

            try {
                const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf-8')
                    .replace(/\0/g, ' ')
                    .trim();
                if (cmdline) {
                    processes.push({ pid, cmdline });
                }
            } catch {
                // Process may have exited between readdir and read — ignore
            }
        }

        return processes;
    } catch {
        return [];
    }
}
```

### Step 4: Run test to verify it passes

Run: `cd packages/happy-cli && npx vitest run src/daemon/orphanSweeper.test.ts`
Expected: PASS (all 7 tests)

### Step 5: Commit

```bash
git add packages/happy-cli/src/daemon/orphanSweeper.ts packages/happy-cli/src/daemon/orphanSweeper.test.ts
git commit -m "feat(daemon): add orphan sweeper pure function for finding untracked happy processes"
```

---

## Task 2: Integrate Orphan Sweeper into Heartbeat

**Files:**
- Modify: `packages/happy-cli/src/daemon/run.ts` (heartbeat section, ~line 863)

### Step 1: Write a test for the grace period logic

Add to `orphanSweeper.test.ts`:

```typescript
import { filterOrphansReadyToKill } from './orphanSweeper';

describe('filterOrphansReadyToKill', () => {
    it('does not kill orphan seen for the first time', () => {
        const orphans: ProcessInfo[] = [{ pid: 2000, cmdline: 'claude ...' }];
        const seenBefore = new Map<number, number>(); // empty — first time
        const result = filterOrphansReadyToKill(orphans, seenBefore, Date.now());
        expect(result).toEqual([]);
        expect(seenBefore.has(2000)).toBe(true);
    });

    it('kills orphan seen in previous heartbeat', () => {
        const orphans: ProcessInfo[] = [{ pid: 2000, cmdline: 'claude ...' }];
        const seenBefore = new Map([[2000, Date.now() - 120_000]]); // seen 2 min ago
        const result = filterOrphansReadyToKill(orphans, seenBefore, Date.now());
        expect(result).toEqual([{ pid: 2000, cmdline: 'claude ...' }]);
    });

    it('does not kill orphan seen very recently (within grace period)', () => {
        const now = Date.now();
        const orphans: ProcessInfo[] = [{ pid: 2000, cmdline: 'claude ...' }];
        const seenBefore = new Map([[2000, now - 30_000]]); // seen 30s ago
        const result = filterOrphansReadyToKill(orphans, seenBefore, now);
        expect(result).toEqual([]);
    });

    it('cleans up entries for processes no longer orphaned', () => {
        const orphans: ProcessInfo[] = []; // PID 2000 not in current orphan list
        const seenBefore = new Map([[2000, Date.now() - 300_000]]);
        filterOrphansReadyToKill(orphans, seenBefore, Date.now());
        expect(seenBefore.has(2000)).toBe(false);
    });
});
```

### Step 2: Run test to verify it fails

Run: `cd packages/happy-cli && npx vitest run src/daemon/orphanSweeper.test.ts`
Expected: FAIL — `filterOrphansReadyToKill` not exported

### Step 3: Add grace period function to orphanSweeper.ts

Append to `orphanSweeper.ts`:

```typescript
/**
 * Grace period: orphans must be seen for at least this long
 * before being killed (avoids killing just-starting sessions).
 */
const ORPHAN_GRACE_PERIOD_MS = 90_000; // 90 seconds (> 1 heartbeat interval)

/**
 * Filters orphans to only those that have been seen as orphaned
 * for longer than the grace period. Mutates `seenOrphans` map
 * to track first-seen timestamps.
 *
 * Also cleans up entries for processes no longer in the orphan list.
 */
export function filterOrphansReadyToKill(
    currentOrphans: ProcessInfo[],
    seenOrphans: Map<number, number>,
    now: number,
): ProcessInfo[] {
    const currentPids = new Set(currentOrphans.map(o => o.pid));

    // Clean up entries for processes no longer orphaned
    for (const pid of seenOrphans.keys()) {
        if (!currentPids.has(pid)) {
            seenOrphans.delete(pid);
        }
    }

    const readyToKill: ProcessInfo[] = [];

    for (const orphan of currentOrphans) {
        const firstSeen = seenOrphans.get(orphan.pid);
        if (firstSeen === undefined) {
            // First time seeing this orphan — start grace period
            seenOrphans.set(orphan.pid, now);
        } else if (now - firstSeen >= ORPHAN_GRACE_PERIOD_MS) {
            // Grace period elapsed — ready to kill
            readyToKill.push(orphan);
        }
        // else: within grace period — wait
    }

    return readyToKill;
}
```

### Step 4: Run test to verify it passes

Run: `cd packages/happy-cli && npx vitest run src/daemon/orphanSweeper.test.ts`
Expected: PASS (all 11 tests)

### Step 5: Integrate into heartbeat loop in run.ts

Add after the idle eviction block (~line 863), before memory stats collection:

```typescript
// Sweep for orphaned happy-spawned processes not in our tracking map
if (process.platform === 'linux') {
    try {
        const allProcs = readAllProcessCmdlines();
        const trackedPids = new Set(pidToTrackedSession.keys());
        const orphans = findOrphanedHappyProcesses(allProcs, trackedPids, process.pid);
        const toKill = filterOrphansReadyToKill(orphans, seenOrphanPids, Date.now());

        for (const orphan of toKill) {
            logger.debug(`[DAEMON RUN] Killing orphaned happy process PID ${orphan.pid}: ${orphan.cmdline.slice(0, 120)}`);
            try {
                process.kill(orphan.pid, 'SIGTERM');
            } catch {
                // Already dead
            }
            trackArchived(orphan.pid, undefined, 'orphan-sweep');
            seenOrphanPids.delete(orphan.pid);
        }

        if (toKill.length > 0) {
            logger.debug(`[DAEMON RUN] Orphan sweep killed ${toKill.length} process(es)`);
        }
    } catch (err) {
        logger.debug('[DAEMON RUN] Orphan sweep failed', err);
    }
}
```

Also add the imports at the top of `run.ts`:
```typescript
import { findOrphanedHappyProcesses, filterOrphansReadyToKill, readAllProcessCmdlines } from './orphanSweeper';
```

And declare the `seenOrphanPids` map near the other state variables (~line 198, after `recentlyArchived`):
```typescript
/** Tracks first-seen timestamps for orphan grace period */
const seenOrphanPids = new Map<number, number>();
```

### Step 6: Run existing daemon tests to verify no breakage

Run: `cd packages/happy-cli && npx vitest run src/daemon/`
Expected: PASS

### Step 7: Commit

```bash
git add packages/happy-cli/src/daemon/orphanSweeper.ts packages/happy-cli/src/daemon/orphanSweeper.test.ts packages/happy-cli/src/daemon/run.ts
git commit -m "feat(daemon): integrate orphan sweeper into heartbeat loop with grace period"
```

---

## Task 3: Improve App-Side Archive Fallback

**Files:**
- Modify: `packages/happy-app/sources/sync/ops.ts` (function `sessionArchive`, ~line 550)

### Step 1: Write the failing test (conceptual — app tests may use different setup)

This is a straightforward code change. The key behavioral change: when `sessionKill()` fails, try `machineRPC('stop-session')` before giving up.

### Step 2: Modify `sessionArchive` to try daemon kill

The current code:
```typescript
export async function sessionArchive(sessionId: string): Promise<SessionKillResponse> {
    const killResult = await sessionKill(sessionId);
    if (killResult.success) {
        return killResult;
    }
    // Kill failed (session likely dead/disconnected) — tell server directly
    try {
        apiSocket.send('session-end', { sid: sessionId, time: Date.now() });
    } catch {
        // Best-effort
    }
    return { success: true, message: 'Session archived (process already exited)' };
}
```

Change to:
```typescript
export async function sessionArchive(sessionId: string, machineId?: string): Promise<SessionKillResponse> {
    // Try 1: Direct RPC to CLI process (fast path)
    const killResult = await sessionKill(sessionId);
    if (killResult.success) {
        return killResult;
    }

    // Try 2: Ask daemon to kill by sessionId (it has the PID)
    if (machineId) {
        try {
            const daemonResult = await apiSocket.machineRPC<{ success: boolean }, { sessionId: string }>(
                machineId,
                'stop-session',
                { sessionId }
            );
            if (daemonResult.success) {
                return { success: true, message: 'Session killed via daemon' };
            }
        } catch {
            // Daemon might not be running or session not tracked — continue to fallback
        }
    }

    // Fallback: Tell server directly so it gets marked inactive
    try {
        apiSocket.send('session-end', { sid: sessionId, time: Date.now() });
    } catch {
        // Best-effort
    }
    return { success: true, message: 'Session archived (process already exited)' };
}
```

### Step 3: Update callers to pass machineId

Search for all callers of `sessionArchive` in the app and ensure they pass the `machineId`. Common call sites will be in session info/detail screens where `machineId` is available from session metadata.

Look in these files (from the earlier grep):
- `packages/happy-app/sources/-session/SessionView.tsx`
- `packages/happy-app/sources/app/(app)/session/[id]/info.tsx`
- `packages/happy-app/sources/components/ActiveSessionsGroup.tsx`
- `packages/happy-app/sources/components/ActiveSessionsGroupCompact.tsx`

The `machineId` is typically available from session data (`session.machineId`). Pass it through.

### Step 4: Also wire up the daemon-side `stop-session` machine RPC

Check if the daemon already handles `stop-session` as a machine RPC (not just HTTP). Looking at `run.ts`, the daemon registers machine RPCs for `spawn-happy-session`, `stop-daemon`, and `bash`. We need to add `stop-session`:

In `run.ts`, find where machine RPC handlers are registered and add:

```typescript
// In the machineRPC handler section
case 'stop-session': {
    const { sessionId } = params as { sessionId: string };
    const success = stopSession(sessionId);
    return { success };
}
```

### Step 5: Run app typecheck

Run: `bun run --filter happy-app typecheck`
Expected: PASS

### Step 6: Commit

```bash
git add packages/happy-app/sources/sync/ops.ts packages/happy-cli/src/daemon/run.ts
# Also add any updated caller files
git commit -m "fix(archive): fall back to daemon kill when direct session RPC fails"
```

---

## Task 4: Add `orphan-sweep` to Archive Reason Type

**Files:**
- Modify: `packages/happy-cli/src/daemon/run.ts` (audit trail, ~line 200)

### Step 1: Verify `orphan-sweep` is accepted

The `recentlyArchived` array uses `reason: string`, so no type change needed. But check if the app displays these reasons and add a translation if needed.

### Step 2: Add app translation for new reason

In `packages/happy-app/sources/text/_default.ts`, find the `archivedOrphan` key area and add:

```typescript
archivedOrphanSweep: 'Orphan cleanup (sweep)',
```

And in the display logic where archive reasons are rendered, add a case for `'orphan-sweep'`.

### Step 3: Commit

```bash
git add packages/happy-app/sources/text/_default.ts
# Also add any translation files that need updating
git commit -m "feat(app): add display label for orphan-sweep archive reason"
```

---

## Task 5: End-to-End Verification

### Step 1: Build CLI

Run: `cd packages/happy-cli && bun run build`

### Step 2: Restart daemon with new code

Run: `cd packages/happy-cli && ./bin/happy.mjs daemon stop && ./bin/happy.mjs daemon start`

### Step 3: Check daemon logs for orphan sweep activity

Run: `tail -f ~/.happy/logs/*daemon.log | grep -i orphan`

The sweep should detect the 12+ stale processes from the memory report and kill them over 2 heartbeat cycles (~2 minutes).

### Step 4: Verify processes are gone

Run: `ps -eo pid,etime,args | grep -E 'session-hook|mcp__happy__change_title' | grep -v grep`
Expected: Only active/recent sessions remain

### Step 5: Final commit

```bash
git commit --allow-empty -m "test: verified orphan sweeper kills stale processes on restart"
```

---

## Summary of Changes

| Component | Change | Impact |
|-----------|--------|--------|
| `orphanSweeper.ts` (new) | Pure functions for finding untracked happy-spawned Claude processes | Core logic, testable |
| `run.ts` (heartbeat) | Integrate sweep after idle eviction, 90s grace period | Kills orphans within ~2-3 minutes |
| `ops.ts` (app) | Add daemon fallback to `sessionArchive()` | More reliable archive from app |
| `run.ts` (RPC) | Add `stop-session` machine RPC handler | Daemon can receive kill requests from app |
| Translations | New `orphan-sweep` reason label | UI completeness |

**Estimated process savings**: Eliminates ~570 MiB RSS + significant swap from the 12+ stale processes in the current report. Prevents future accumulation.
