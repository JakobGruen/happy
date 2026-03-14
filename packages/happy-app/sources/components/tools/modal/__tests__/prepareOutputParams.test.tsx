/**
 * Unit tests for prepareOutputParams utility
 *
 * Converts tool.result (unknown) into Record<string, any> for unified
 * rendering through VerticalParameterStack in the OUTPUT tab.
 */

import { describe, it, expect } from 'vitest';
import { prepareOutputParams } from '../prepareOutputParams';

describe('prepareOutputParams', () => {

    describe('null/undefined handling', () => {
        it('returns null for null', () => {
            expect(prepareOutputParams(null)).toBeNull();
        });

        it('returns null for undefined', () => {
            expect(prepareOutputParams(undefined)).toBeNull();
        });
    });

    describe('object results', () => {
        it('returns object directly when it has keys', () => {
            const obj = { status: 'ok', message: 'Done' };
            expect(prepareOutputParams(obj)).toEqual(obj);
        });

        it('returns null for empty objects', () => {
            expect(prepareOutputParams({})).toBeNull();
        });

        it('preserves nested objects', () => {
            const obj = { user: { id: 1, name: 'John' }, active: true };
            expect(prepareOutputParams(obj)).toEqual(obj);
        });

        it('returns single-key objects directly', () => {
            const obj = { result: 'value' };
            expect(prepareOutputParams(obj)).toEqual(obj);
        });
    });

    describe('JSON string results', () => {
        it('parses JSON string with 2+ keys into object', () => {
            const json = '{"stdout":"output","stderr":"","exitCode":0}';
            expect(prepareOutputParams(json)).toEqual({
                stdout: 'output',
                stderr: '',
                exitCode: 0,
            });
        });

        it('parses JSON string with single key into object', () => {
            const json = '{"output":"value"}';
            expect(prepareOutputParams(json)).toEqual({ output: 'value' });
        });

        it('wraps non-object JSON (array) as result string', () => {
            const json = '[1, 2, 3]';
            const result = prepareOutputParams(json);
            expect(result).toEqual({ result: json });
        });
    });

    describe('plain string results', () => {
        it('wraps plain string as { result: string }', () => {
            const str = 'File not found';
            expect(prepareOutputParams(str)).toEqual({ result: 'File not found' });
        });

        it('unescapes \\n in strings', () => {
            const str = 'line1\\nline2\\nline3';
            expect(prepareOutputParams(str)).toEqual({ result: 'line1\nline2\nline3' });
        });

        it('unescapes \\t in strings', () => {
            const str = 'col1\\tcol2';
            expect(prepareOutputParams(str)).toEqual({ result: 'col1\tcol2' });
        });

        it('preserves actual newlines', () => {
            const str = 'line1\nline2';
            expect(prepareOutputParams(str)).toEqual({ result: 'line1\nline2' });
        });

        it('wraps empty string as { result: "" }', () => {
            expect(prepareOutputParams('')).toEqual({ result: '' });
        });
    });

    describe('other types', () => {
        it('wraps arrays as { result: stringified }', () => {
            expect(prepareOutputParams([1, 2, 3])).toEqual({ result: '1,2,3' });
        });

        it('wraps numbers as { result: string }', () => {
            expect(prepareOutputParams(42)).toEqual({ result: '42' });
        });

        it('wraps booleans as { result: string }', () => {
            expect(prepareOutputParams(true)).toEqual({ result: 'true' });
        });
    });
});
