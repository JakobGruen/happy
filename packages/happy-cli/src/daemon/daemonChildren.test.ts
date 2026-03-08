import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import { readDaemonChildren, writeDaemonChildren, clearDaemonChildren } from '@/persistence';
import { configuration } from '@/configuration';
import type { PersistedChild } from './types';

const childrenFile = configuration.daemonChildrenFile;

describe('daemon children persistence', () => {
    beforeEach(() => {
        // Clean slate
        if (existsSync(childrenFile)) {
            unlinkSync(childrenFile);
        }
    });

    afterEach(() => {
        if (existsSync(childrenFile)) {
            unlinkSync(childrenFile);
        }
    });

    describe('readDaemonChildren', () => {
        it('returns empty array when file does not exist', () => {
            expect(readDaemonChildren()).toEqual([]);
        });

        it('returns empty array when file is corrupted JSON', () => {
            const { writeFileSync } = require('fs');
            writeFileSync(childrenFile, 'not-json{{{', 'utf-8');
            expect(readDaemonChildren()).toEqual([]);
        });

        it('returns empty array when file contains non-array JSON', () => {
            const { writeFileSync } = require('fs');
            writeFileSync(childrenFile, '{"pid": 123}', 'utf-8');
            expect(readDaemonChildren()).toEqual([]);
        });

        it('reads persisted children correctly', () => {
            const children: PersistedChild[] = [
                { pid: 1234, sessionId: 'abc', startedAt: 1000 },
                { pid: 5678, startedAt: 2000 }
            ];
            writeDaemonChildren(children);

            const result = readDaemonChildren();
            expect(result).toEqual(children);
        });
    });

    describe('writeDaemonChildren', () => {
        it('writes children to disk as JSON', () => {
            const children: PersistedChild[] = [
                { pid: 42, sessionId: 'sess-1', startedAt: 999 }
            ];
            writeDaemonChildren(children);

            expect(existsSync(childrenFile)).toBe(true);
            const raw = JSON.parse(readFileSync(childrenFile, 'utf-8'));
            expect(raw).toEqual(children);
        });

        it('overwrites previous content', () => {
            writeDaemonChildren([{ pid: 1, startedAt: 1 }]);
            writeDaemonChildren([{ pid: 2, startedAt: 2 }, { pid: 3, startedAt: 3 }]);

            const result = readDaemonChildren();
            expect(result).toHaveLength(2);
            expect(result[0].pid).toBe(2);
        });

        it('writes empty array correctly', () => {
            writeDaemonChildren([{ pid: 1, startedAt: 1 }]);
            writeDaemonChildren([]);

            expect(readDaemonChildren()).toEqual([]);
        });
    });

    describe('clearDaemonChildren', () => {
        it('removes the file', () => {
            writeDaemonChildren([{ pid: 1, startedAt: 1 }]);
            expect(existsSync(childrenFile)).toBe(true);

            clearDaemonChildren();
            expect(existsSync(childrenFile)).toBe(false);
        });

        it('does not throw when file does not exist', () => {
            expect(() => clearDaemonChildren()).not.toThrow();
        });
    });
});
