/**
 * Unit tests for ContentFormatter component
 *
 * Tests validate the detectContentType function
 * Detection priority order: JSON → Diff → Code → Markdown → Text
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

        it('detects diff by --- marker', () => {
            const diff = '--- a/file.txt\n+++ b/file.txt';
            expect(detectContentType(diff)).toBe('diff');
        });

        it('detects diff by +++ marker', () => {
            const diff = '+++ b/file.txt\n--- a/file.txt';
            expect(detectContentType(diff)).toBe('diff');
        });

        it('detects diff by @@ marker (hunk header)', () => {
            const diff = '@@ -1,3 +1,3 @@\n old line\n-removed\n+added';
            expect(detectContentType(diff)).toBe('diff');
        });

        it('detects diff with mixed markers', () => {
            const diff = '--- a/file.txt\n+++ b/file.txt\n@@ -1,3 +1,3 @@\n-old\n+new';
            expect(detectContentType(diff)).toBe('diff');
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

        it('detects JavaScript import statement', () => {
            expect(detectContentType('import React from "react";')).toBe('code');
        });

        it('detects JavaScript arrow function', () => {
            expect(detectContentType('const add = (a, b) => a + b;')).toBe('code');
        });

        it('detects if statement', () => {
            expect(detectContentType('if (condition) { doSomething(); }')).toBe('code');
        });

        it('detects for loop', () => {
            expect(detectContentType('for (let i = 0; i < 10; i++) { }')).toBe('code');
        });

        it('detects while loop', () => {
            expect(detectContentType('while (running) { update(); }')).toBe('code');
        });

        it('detects Python code with def', () => {
            expect(detectContentType('def hello(): pass')).toBe('code');
        });

        it('detects Python code with class', () => {
            expect(detectContentType('class MyClass: pass')).toBe('code');
        });

        it('detects Python import', () => {
            expect(detectContentType('import os')).toBe('code');
        });

        it('detects markdown heading with #', () => {
            expect(detectContentType('# Heading')).toBe('markdown');
        });

        it('detects markdown subheading', () => {
            expect(detectContentType('## Section')).toBe('markdown');
        });

        it('detects markdown list with -', () => {
            expect(detectContentType('- List item')).toBe('markdown');
        });

        it('detects markdown list with *', () => {
            expect(detectContentType('* Item')).toBe('markdown');
        });

        it('detects markdown list with +', () => {
            expect(detectContentType('+ Another item')).toBe('markdown');
        });

        it('detects markdown link', () => {
            expect(detectContentType('[Link](url)')).toBe('markdown');
        });

        it('detects markdown bold text', () => {
            expect(detectContentType('**bold text**')).toBe('markdown');
        });

        it('detects markdown italic text', () => {
            expect(detectContentType('*italic text*')).toBe('markdown');
        });

        it('detects markdown code block', () => {
            expect(detectContentType('```\ncode\n```')).toBe('markdown');
        });

        it('detects markdown blockquote', () => {
            expect(detectContentType('> quote')).toBe('markdown');
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

        it('prioritizes diff over code when both patterns match', () => {
            const content = '+++\n--- old\n+++ new\nconst x = 1;';
            expect(detectContentType(content)).toBe('diff');
        });

        it('prioritizes JSON over code when both patterns match', () => {
            const jsonWithCode = '{"code": "const x = 1;"}';
            expect(detectContentType(jsonWithCode)).toBe('json');
        });

        it('prioritizes JSON over markdown', () => {
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
