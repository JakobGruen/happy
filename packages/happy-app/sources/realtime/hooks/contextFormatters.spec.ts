import { describe, it, expect } from 'vitest';
import { formatLogSteps, formatNewLogSteps } from './contextFormatters';

describe('formatLogSteps', () => {
    it('returns placeholder when no logSteps', () => {
        expect(formatLogSteps(undefined)).toBe('No activity logged yet.');
        expect(formatLogSteps({})).toBe('No activity logged yet.');
    });

    it('formats a single step with title and summary', () => {
        const result = formatLogSteps({
            '1': {
                title: 'Fixed auth bug',
                summary: '- Updated token validation\n- Added expiry check',
                createdAt: Date.now(),
            }
        });
        expect(result).toContain('[Step 1] Fixed auth bug');
        expect(result).toContain('Updated token validation');
        expect(result).toContain('Added expiry check');
    });

    it('formats stats when present', () => {
        const result = formatLogSteps({
            '1': {
                title: 'Refactored module',
                summary: '- Changed stuff',
                stats: { linesAdded: 50, linesRemoved: 20, filesChanged: 3, testsPassed: 10 },
                createdAt: Date.now(),
            }
        });
        expect(result).toContain('+50');
        expect(result).toContain('-20');
        expect(result).toContain('3 files');
        expect(result).toContain('10 tests passed');
    });

    it('sorts steps by numeric key', () => {
        const result = formatLogSteps({
            '3': { title: 'Third', summary: '', createdAt: 3 },
            '1': { title: 'First', summary: '', createdAt: 1 },
            '2': { title: 'Second', summary: '', createdAt: 2 },
        });
        const firstIdx = result.indexOf('[Step 1]');
        const secondIdx = result.indexOf('[Step 2]');
        const thirdIdx = result.indexOf('[Step 3]');
        expect(firstIdx).toBeLessThan(secondIdx);
        expect(secondIdx).toBeLessThan(thirdIdx);
    });
});

describe('formatNewLogSteps', () => {
    it('includes session ID and formatted steps', () => {
        const result = formatNewLogSteps('sess-123', {
            '5': { title: 'New work', summary: '- Did thing', createdAt: Date.now() },
        });
        expect(result).toContain('sess-123');
        expect(result).toContain('[Step 5] New work');
    });
});
