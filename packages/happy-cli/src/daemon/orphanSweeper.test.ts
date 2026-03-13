import { describe, it, expect } from 'vitest';
import { findOrphanedHappyProcesses, filterOrphansReadyToKill, isDescendantOfTracked } from './orphanSweeper';
import type { ProcessInfo, GetParentPidFn } from './orphanSweeper';

const DAEMON_PID = 1000;

/** Helper: create a mock getParentPid from a pid→ppid map */
function mockParentPid(tree: Record<number, number>): GetParentPidFn {
    return (pid: number) => tree[pid] ?? null;
}

/** No-op parent resolver — all PIDs have no parent (simulates non-Linux). */
const noParent: GetParentPidFn = () => null;

describe('isDescendantOfTracked', () => {
    it('returns true for direct child of tracked PID', () => {
        const trackedPids = new Set([100]);
        const getParentPid = mockParentPid({ 200: 100 });
        expect(isDescendantOfTracked(200, trackedPids, getParentPid)).toBe(true);
    });

    it('returns true for grandchild of tracked PID', () => {
        const trackedPids = new Set([100]);
        const getParentPid = mockParentPid({ 300: 200, 200: 100 });
        expect(isDescendantOfTracked(300, trackedPids, getParentPid)).toBe(true);
    });

    it('returns false when no ancestor is tracked', () => {
        const trackedPids = new Set([100]);
        const getParentPid = mockParentPid({ 300: 200, 200: 50 });
        expect(isDescendantOfTracked(300, trackedPids, getParentPid)).toBe(false);
    });

    it('returns false when parent PID is 1 (init)', () => {
        const trackedPids = new Set([100]);
        const getParentPid = mockParentPid({ 200: 1 });
        expect(isDescendantOfTracked(200, trackedPids, getParentPid)).toBe(false);
    });

    it('returns false when getParentPid returns null', () => {
        const trackedPids = new Set([100]);
        expect(isDescendantOfTracked(200, trackedPids, noParent)).toBe(false);
    });

    it('respects maxDepth limit', () => {
        const trackedPids = new Set([100]);
        // Chain: 600→500→400→300→200→100, but maxDepth=3 won't reach 100
        const getParentPid = mockParentPid({ 600: 500, 500: 400, 400: 300, 300: 200, 200: 100 });
        expect(isDescendantOfTracked(600, trackedPids, getParentPid, 3)).toBe(false);
        expect(isDescendantOfTracked(600, trackedPids, getParentPid, 5)).toBe(true);
    });
});

describe('findOrphanedHappyProcesses', () => {
    it('identifies process by mcp__happy__change_title marker', () => {
        const processes: ProcessInfo[] = [
            { pid: 2000, cmdline: 'node claude --mcp__happy__change_title some-session' },
        ];
        const result = findOrphanedHappyProcesses(processes, new Set(), DAEMON_PID, noParent);
        expect(result).toEqual([{ pid: 2000, cmdline: 'node claude --mcp__happy__change_title some-session' }]);
    });

    it('identifies process by session-hook- marker', () => {
        const processes: ProcessInfo[] = [
            { pid: 2001, cmdline: 'node claude --session-hook-url http://localhost:3456/hook' },
        ];
        const result = findOrphanedHappyProcesses(processes, new Set(), DAEMON_PID, noParent);
        expect(result).toEqual([{ pid: 2001, cmdline: 'node claude --session-hook-url http://localhost:3456/hook' }]);
    });

    it('identifies process by --started-by daemon marker', () => {
        const processes: ProcessInfo[] = [
            { pid: 2002, cmdline: 'node happy --started-by daemon --happy-starting-mode remote' },
        ];
        const result = findOrphanedHappyProcesses(processes, new Set(), DAEMON_PID, noParent);
        expect(result).toEqual([{ pid: 2002, cmdline: 'node happy --started-by daemon --happy-starting-mode remote' }]);
    });

    it('excludes already-tracked PIDs', () => {
        const processes: ProcessInfo[] = [
            { pid: 2000, cmdline: 'node claude --mcp__happy__change_title some-session' },
            { pid: 2001, cmdline: 'node claude --session-hook-url http://localhost:3456/hook' },
        ];
        const trackedPids = new Set([2000]);
        const result = findOrphanedHappyProcesses(processes, trackedPids, DAEMON_PID, noParent);
        expect(result).toEqual([{ pid: 2001, cmdline: 'node claude --session-hook-url http://localhost:3456/hook' }]);
    });

    it('excludes daemon PID', () => {
        const processes: ProcessInfo[] = [
            { pid: DAEMON_PID, cmdline: 'node happy daemon start --mcp__happy__change_title' },
        ];
        const result = findOrphanedHappyProcesses(processes, new Set(), DAEMON_PID, noParent);
        expect(result).toEqual([]);
    });

    it('excludes non-happy claude processes (bare claude, claude -c, VS Code claude)', () => {
        const processes: ProcessInfo[] = [
            { pid: 3000, cmdline: 'claude' },
            { pid: 3001, cmdline: 'claude -c "fix the bug"' },
            { pid: 3002, cmdline: '/usr/bin/claude --print "hello"' },
            { pid: 3003, cmdline: '/home/user/.vscode/extensions/claude-code/claude' },
        ];
        const result = findOrphanedHappyProcesses(processes, new Set(), DAEMON_PID, noParent);
        expect(result).toEqual([]);
    });

    it('excludes daemon/doctor processes', () => {
        const processes: ProcessInfo[] = [
            { pid: 4000, cmdline: 'node happy daemon start --mcp__happy__change_title' },
            { pid: 4001, cmdline: 'node happy daemon stop' },
            { pid: 4002, cmdline: 'node happy doctor' },
            { pid: 4003, cmdline: 'node happy daemon status' },
        ];
        const result = findOrphanedHappyProcesses(processes, new Set(), DAEMON_PID, noParent);
        expect(result).toEqual([]);
    });

    it('excludes child processes of tracked PIDs', () => {
        const trackedPids = new Set([1500]); // Happy CLI PID
        const processes: ProcessInfo[] = [
            // node claude_remote_launcher.cjs (child of 1500)
            { pid: 1501, cmdline: 'node claude_remote_launcher.cjs --output-format stream-json --append-system-prompt mcp__happy__change_title' },
            // native claude binary (grandchild of 1500, child of 1501)
            { pid: 1502, cmdline: '/home/user/.local/share/claude/versions/2.1.71 --output-format stream-json --append-system-prompt mcp__happy__change_title' },
            // actual orphan (parent is init/1)
            { pid: 9000, cmdline: 'node claude --mcp__happy__change_title orphan-session' },
        ];
        const getParentPid = mockParentPid({ 1501: 1500, 1502: 1501, 9000: 1 });
        const result = findOrphanedHappyProcesses(processes, trackedPids, DAEMON_PID, getParentPid);
        expect(result).toEqual([{ pid: 9000, cmdline: 'node claude --mcp__happy__change_title orphan-session' }]);
    });

    it('returns empty for empty process list', () => {
        const result = findOrphanedHappyProcesses([], new Set(), DAEMON_PID, noParent);
        expect(result).toEqual([]);
    });
});

describe('filterOrphansReadyToKill', () => {
    const GRACE_PERIOD = 90_000;

    it('does not kill orphan seen for first time (but adds to seenOrphans)', () => {
        const orphans: ProcessInfo[] = [
            { pid: 2000, cmdline: 'node claude --mcp__happy__change_title' },
        ];
        const seenOrphans = new Map<number, number>();
        const now = 1_000_000;

        const result = filterOrphansReadyToKill(orphans, seenOrphans, now);

        expect(result).toEqual([]);
        expect(seenOrphans.get(2000)).toBe(now);
    });

    it('kills orphan seen >= 90s ago', () => {
        const orphans: ProcessInfo[] = [
            { pid: 2000, cmdline: 'node claude --mcp__happy__change_title' },
        ];
        const firstSeen = 1_000_000;
        const seenOrphans = new Map<number, number>([[2000, firstSeen]]);
        const now = firstSeen + GRACE_PERIOD;

        const result = filterOrphansReadyToKill(orphans, seenOrphans, now);

        expect(result).toEqual([{ pid: 2000, cmdline: 'node claude --mcp__happy__change_title' }]);
    });

    it('does not kill orphan seen < 90s ago', () => {
        const orphans: ProcessInfo[] = [
            { pid: 2000, cmdline: 'node claude --mcp__happy__change_title' },
        ];
        const firstSeen = 1_000_000;
        const seenOrphans = new Map<number, number>([[2000, firstSeen]]);
        const now = firstSeen + GRACE_PERIOD - 1;

        const result = filterOrphansReadyToKill(orphans, seenOrphans, now);

        expect(result).toEqual([]);
    });

    it('cleans up entries for processes no longer orphaned', () => {
        const orphans: ProcessInfo[] = [
            { pid: 2000, cmdline: 'node claude --mcp__happy__change_title' },
        ];
        const seenOrphans = new Map<number, number>([
            [2000, 900_000],
            [9999, 800_000], // no longer in orphan list
        ]);
        const now = 1_000_000;

        filterOrphansReadyToKill(orphans, seenOrphans, now);

        expect(seenOrphans.has(9999)).toBe(false);
        expect(seenOrphans.has(2000)).toBe(true);
    });
});
