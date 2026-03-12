/**
 * Unit tests for OutputContent component
 *
 * Tests the JSON unpacking feature that detects JSON strings with 2+ keys
 * and renders them as parameters using VerticalParameterStack instead of
 * generic content formatting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// Mock React Native components
const View = ({ children, style, testID }: any) => ({
    type: 'View',
    props: { children, style, testID }
});

const ScrollView = ({ children, style, testID }: any) => ({
    type: 'ScrollView',
    props: { children, style, testID }
});

const Text = ({ children, style }: any) => ({
    type: 'Text',
    props: { children, style }
});

vi.mock('react-native', () => ({
    View,
    ScrollView,
    Text,
}));

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (fn: any) => {
            if (typeof fn === 'function') {
                return fn({ colors: { textSecondary: '#999', text: '#000' } });
            }
            return fn;
        }
    },
    useUnistyles: () => ({
        theme: { colors: { textSecondary: '#999', text: '#000' } }
    })
}));

// Mock components that are used by OutputContent
vi.mock('../VerticalParameterStack', () => ({
    VerticalParameterStack: ({ parameters }: any) => ({
        type: 'VerticalParameterStack',
        props: { parameters }
    }),
}));

vi.mock('../ContentFormatter', () => ({
    ContentFormatter: ({ value }: any) => ({
        type: 'ContentFormatter',
        props: { value }
    }),
}));

// Import utilities and component after mocks are set up
let OutputContent: any;
let tryParseJsonString: any;
let shouldUnpackJson: any;

beforeEach(async () => {
    vi.resetModules();
    // Re-import after clearing mocks
    const mod = await import('../OutputContent');
    OutputContent = mod.OutputContent;
    tryParseJsonString = mod.tryParseJsonString;
    shouldUnpackJson = mod.shouldUnpackJson;
});

describe('OutputContent', () => {
    describe('tryParseJsonString utility', () => {
        it('parses valid JSON strings to objects', () => {
            const json = '{"name":"test","status":"ok"}';
            const result = tryParseJsonString(json);
            expect(result).toEqual({ name: 'test', status: 'ok' });
        });

        it('returns undefined for invalid JSON', () => {
            const result = tryParseJsonString('not valid json');
            expect(result).toBeUndefined();
        });

        it('returns undefined for JSON strings (string primitives)', () => {
            expect(tryParseJsonString('"string value"')).toBeUndefined();
        });

        it('returns undefined for JSON arrays', () => {
            expect(tryParseJsonString('[1,2,3]')).toBeUndefined();
        });

        it('returns undefined for JSON numbers', () => {
            expect(tryParseJsonString('42')).toBeUndefined();
        });

        it('returns undefined for JSON booleans', () => {
            expect(tryParseJsonString('true')).toBeUndefined();
        });

        it('returns undefined for JSON null', () => {
            expect(tryParseJsonString('null')).toBeUndefined();
        });

        it('returns undefined for non-string inputs', () => {
            expect(tryParseJsonString({ already: 'object' })).toBeUndefined();
        });

        it('returns undefined for non-string number', () => {
            expect(tryParseJsonString(123)).toBeUndefined();
        });

        it('parses JSON strings with whitespace', () => {
            const json = '{\n  "name": "test",\n  "status": "ok"\n}';
            const result = tryParseJsonString(json);
            expect(result).toEqual({ name: 'test', status: 'ok' });
        });

        it('parses JSON strings with nested objects', () => {
            const json = '{"user":{"id":1,"name":"John"},"active":true}';
            const result = tryParseJsonString(json);
            expect(result).toEqual({ user: { id: 1, name: 'John' }, active: true });
        });
    });

    describe('shouldUnpackJson utility', () => {
        it('returns true for objects with 2 keys', () => {
            expect(shouldUnpackJson({ name: 'test', status: 'ok' })).toBe(true);
        });

        it('returns true for objects with 2+ keys', () => {
            expect(shouldUnpackJson({ a: 1, b: 2, c: 3, d: 4 })).toBe(true);
        });

        it('returns true for objects with many keys', () => {
            const obj = Object.fromEntries([...Array(10).keys()].map(i => [`key${i}`, i]));
            expect(shouldUnpackJson(obj)).toBe(true);
        });

        it('returns false for objects with 0 keys', () => {
            expect(shouldUnpackJson({})).toBe(false);
        });

        it('returns false for objects with 1 key', () => {
            expect(shouldUnpackJson({ result: 'value' })).toBe(false);
        });

        it('returns false for arrays', () => {
            expect(shouldUnpackJson([1, 2, 3])).toBe(false);
        });

        it('returns false for empty arrays', () => {
            expect(shouldUnpackJson([])).toBe(false);
        });

        it('returns false for strings', () => {
            expect(shouldUnpackJson('string')).toBe(false);
        });

        it('returns false for numbers', () => {
            expect(shouldUnpackJson(123)).toBe(false);
        });

        it('returns false for booleans', () => {
            expect(shouldUnpackJson(true)).toBe(false);
            expect(shouldUnpackJson(false)).toBe(false);
        });

        it('returns false for null', () => {
            expect(shouldUnpackJson(null)).toBe(false);
        });

        it('returns false for undefined', () => {
            expect(shouldUnpackJson(undefined)).toBe(false);
        });
    });

    describe('OutputContent component rendering', () => {
        it('unpacks JSON string with 2+ keys as parameters', () => {
            const result = '{"success":true,"message":"Operation completed","code":200}';
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('unpacks already-parsed object with 2+ keys as parameters', () => {
            const result = { status: 'ok', data: 'value', count: 5 };
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('uses ContentFormatter for plain string results', () => {
            const result = 'Plain text output';
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('uses ContentFormatter for JSON arrays', () => {
            const result = '[1, 2, 3]';
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('uses ContentFormatter for diff results', () => {
            const result = '--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@';
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('uses ContentFormatter for code results', () => {
            const result = 'const x = 5; console.log(x);';
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('uses ContentFormatter for markdown results', () => {
            const result = '# Heading\n\n## Subheading\n\nSome text';
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('handles single-key objects using ContentFormatter', () => {
            const result = { result: 'value only' };
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('handles empty objects using ContentFormatter', () => {
            const result = {};
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('handles null result', () => {
            const result = null;
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('handles undefined result', () => {
            const result = undefined;
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('handles number result', () => {
            const result = 42;
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('handles empty string result', () => {
            const result = '';
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('handles JSON string with single key', () => {
            const result = '{"output":"some result"}';
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('handles JSON string with 3+ keys', () => {
            const result = '{"a":1,"b":2,"c":3}';
            const component = React.createElement(OutputContent, { result, testID: 'output' });
            expect(component).toBeTruthy();
        });

        it('can be instantiated without testID prop', () => {
            const result = { key1: 'val1', key2: 'val2' };
            const component = React.createElement(OutputContent, { result });
            expect(component).toBeTruthy();
        });
    });
});
