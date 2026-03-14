/**
 * Unit tests for ContentFormatter component
 *
 * Tests validate the detectContentType function
 * Detection priority order: JSON → Code → Text
 * (diff and markdown detection removed — handled elsewhere or same as text)
 */

import { describe, it, expect } from 'vitest';

// Import from the utility module
import { detectContentType } from '../detectContentType';

describe('ContentFormatter', () => {

    describe('detectContentType function', () => {
        it('detects JSON objects (plain objects)', () => {
            expect(detectContentType({ name: 'test', value: 123 })).toBe('json');
        });

        it('detects JSON objects with nested structure', () => {
            expect(detectContentType({ user: { id: 1, name: 'John' }, active: true })).toBe('json');
        });

        it('detects JSON strings that parse to objects', () => {
            expect(detectContentType('{"name":"test","value":123}')).toBe('json');
        });

        it('detects JSON strings with whitespace', () => {
            expect(detectContentType('{\n  "name": "test",\n  "value": 123\n}')).toBe('json');
        });

        // Diff detection removed — diff content now treated as text
        // (Edit/Write/MultiEdit use DiffModalContent instead)
        it('treats diff markers as text (no diff detection)', () => {
            expect(detectContentType('--- a/file.txt\n+++ b/file.txt')).toBe('text');
        });

        it('treats @@ hunk headers as text', () => {
            expect(detectContentType('@@ -1,3 +1,3 @@\n old line\n-removed\n+added')).toBe('text');
        });

        it('detects code in diff-like content with code signals', () => {
            const content = '+++\n--- old\n+++ new\nconst x = 1;';
            expect(detectContentType(content)).toBe('code');
        });

        it('detects JavaScript code with const', () => {
            expect(detectContentType('const x = 5;')).toBe('code');
        });

        it('detects JavaScript code with let', () => {
            expect(detectContentType('let count = 0;')).toBe('code');
        });

        it('detects JavaScript code with var', () => {
            expect(detectContentType('var isActive = true;')).toBe('code');
        });

        it('detects JavaScript function declaration', () => {
            expect(detectContentType('function foo() { return 42; }')).toBe('code');
        });

        it('detects JavaScript import with semicolon (2 weak signals)', () => {
            expect(detectContentType('import React from "react";')).toBe('code');
        });

        it('detects JavaScript arrow function', () => {
            expect(detectContentType('const add = (a, b) => a + b;')).toBe('code');
        });

        it('detects if statement with braces (2 weak signals)', () => {
            expect(detectContentType('if (condition) { doSomething(); }')).toBe('code');
        });

        it('detects for loop with variable declaration', () => {
            expect(detectContentType('for (let i = 0; i < 10; i++) { }')).toBe('code');
        });

        it('detects while loop with braces (2 weak signals)', () => {
            expect(detectContentType('while (running) { update(); }')).toBe('code');
        });

        it('detects Python code with def', () => {
            expect(detectContentType('def hello(): pass')).toBe('code');
        });

        it('treats lone class keyword as text (single weak signal)', () => {
            expect(detectContentType('class MyClass: pass')).toBe('text');
        });

        it('treats lone import as text (single weak signal)', () => {
            expect(detectContentType('import os')).toBe('text');
        });

        // Markdown detection removed — all markdown treated as text
        it('treats markdown headings as text', () => {
            expect(detectContentType('# Heading')).toBe('text');
        });

        it('treats markdown subheadings as text', () => {
            expect(detectContentType('## Section')).toBe('text');
        });

        it('treats markdown lists as text', () => {
            expect(detectContentType('- List item')).toBe('text');
            expect(detectContentType('* Item')).toBe('text');
            expect(detectContentType('+ Another item')).toBe('text');
        });

        it('treats markdown links as text', () => {
            expect(detectContentType('[Link](url)')).toBe('text');
        });

        it('treats markdown bold as text', () => {
            expect(detectContentType('**bold text**')).toBe('text');
        });

        it('treats markdown italic as text', () => {
            expect(detectContentType('*italic text*')).toBe('text');
        });

        it('treats markdown code blocks as text', () => {
            expect(detectContentType('```\ncode\n```')).toBe('text');
        });

        it('treats markdown blockquotes as text', () => {
            expect(detectContentType('> quote')).toBe('text');
        });

        it('defaults to text for plain unformatted content', () => {
            expect(detectContentType('just some plain text')).toBe('text');
        });

        it('defaults to text for simple words', () => {
            expect(detectContentType('hello world')).toBe('text');
        });

        it('defaults to text for numbers without context', () => {
            expect(detectContentType('42')).toBe('text');
        });

        it('returns text for arrays', () => {
            expect(detectContentType([1, 2, 3])).toBe('text');
        });

        it('returns text for numbers', () => {
            expect(detectContentType(42)).toBe('text');
        });

        it('returns text for booleans', () => {
            expect(detectContentType(true)).toBe('text');
        });

        it('returns text for null', () => {
            expect(detectContentType(null)).toBe('text');
        });

        it('returns text for undefined', () => {
            expect(detectContentType(undefined)).toBe('text');
        });

        it('prioritizes JSON over code when both patterns match', () => {
            const jsonWithCode = '{"code": "const x = 1;"}';
            expect(detectContentType(jsonWithCode)).toBe('json');
        });

        it('prioritizes JSON over markdown-like content', () => {
            const jsonWithMarkdown = '{"title": "# Heading"}';
            expect(detectContentType(jsonWithMarkdown)).toBe('json');
        });

        it('handles empty strings', () => {
            expect(detectContentType('')).toBe('text');
        });

        it('handles whitespace-only strings', () => {
            expect(detectContentType('   \n  \t  ')).toBe('text');
        });

        it('handles very long strings', () => {
            const longString = 'a'.repeat(10000);
            expect(detectContentType(longString)).toBe('text');
        });
    });

});
