import { describe, it, expect } from 'vitest';
import { getProcessCpuTicks, detectActiveProcesses } from './processActivity';

describe('getProcessCpuTicks', () => {
    it('returns a number for the current process (Linux only)', () => {
        const ticks = getProcessCpuTicks(process.pid);
        if (process.platform === 'linux') {
            expect(ticks).toBeTypeOf('number');
            expect(ticks).toBeGreaterThan(0);
        } else {
            expect(ticks).toBeNull();
        }
    });

    it('returns null for a non-existent process', () => {
        expect(getProcessCpuTicks(999999999)).toBeNull();
    });
});

describe('detectActiveProcesses', () => {
    it('detects activity when CPU ticks increase', () => {
        const lastKnownTicks = new Map([[1234, 100]]);

        // Simulate: current process has more ticks than last known
        // We can't easily mock /proc, so test the logic with the real process
        const firstRead = getProcessCpuTicks(process.pid);
        if (firstRead === null) return; // Skip on non-Linux

        // Do some CPU work to ensure ticks increase
        let sum = 0;
        for (let i = 0; i < 1_000_000; i++) sum += Math.sqrt(i);

        const knownTicks = new Map([[process.pid, firstRead]]);
        const { updatedTicks, activePids } = detectActiveProcesses([process.pid], knownTicks);

        // The process should have consumed more CPU
        expect(updatedTicks.has(process.pid)).toBe(true);
        const newTicks = updatedTicks.get(process.pid)!;
        expect(newTicks).toBeGreaterThanOrEqual(firstRead);

        // If ticks increased, pid should be in activePids
        if (newTicks > firstRead) {
            expect(activePids.has(process.pid)).toBe(true);
        }

        // Use sum to prevent optimization
        expect(sum).toBeGreaterThan(0);
    });

    it('does not report activity on first check (no previous ticks)', () => {
        const emptyTicks = new Map<number, number>();
        const { activePids, updatedTicks } = detectActiveProcesses([process.pid], emptyTicks);

        // First check: no previous data to compare, so not "active"
        expect(activePids.size).toBe(0);

        // But we should have recorded the ticks for next time
        if (process.platform === 'linux') {
            expect(updatedTicks.has(process.pid)).toBe(true);
        }
    });

    it('skips non-existent processes', () => {
        const knownTicks = new Map([[999999999, 50]]);
        const { updatedTicks, activePids } = detectActiveProcesses([999999999], knownTicks);

        expect(activePids.size).toBe(0);
        expect(updatedTicks.has(999999999)).toBe(false);
    });
});
