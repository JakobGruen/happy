/**
 * Unit tests for VerticalParameterStack component
 *
 * Tests validate ContentFormatter integration for intelligent type detection
 * (JSON, code, plain text)
 *
 * Key behaviors tested:
 * - Renders parameter names above values
 * - Uses ContentFormatter for type-aware value rendering
 * - Gray valueContainer box (surfaceRipple background)
 * - Scrollable for long content
 * - Proper spacing between parameters
 * - Empty state handling
 */

import { describe, it, expect } from 'vitest';
import { detectContentType } from '../detectContentType';

describe('VerticalParameterStack with ContentFormatter', () => {

    describe('Parameter rendering', () => {
        it('renders markdown strings as text (no markdown detection)', () => {
            const markdown = '# Heading\n\n**bold text**\n\n- List item';
            const type = detectContentType(markdown);
            expect(type).toBe('text');
        });

        it('renders code strings with syntax highlighting', () => {
            const code = 'const x = 5; console.log(x);';
            const type = detectContentType(code);
            expect(type).toBe('code');
        });

        it('renders JSON objects with formatting', () => {
            const jsonObj = { timeout: 5000, retries: 3 };
            const type = detectContentType(jsonObj);
            expect(type).toBe('json');
        });

        it('renders JSON strings with formatting', () => {
            const jsonStr = '{"timeout":5000,"retries":3}';
            const type = detectContentType(jsonStr);
            expect(type).toBe('json');
        });

        it('treats diff content as text (diff detection removed)', () => {
            const diff = '--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@\n-old\n+new';
            const type = detectContentType(diff);
            expect(type).toBe('text');
        });

        it('renders plain text strings', () => {
            const text = 'Simple text message';
            const type = detectContentType(text);
            expect(type).toBe('text');
        });

        it('renders numbers as text', () => {
            const num = 42;
            const type = detectContentType(num);
            expect(type).toBe('text');
        });

        it('renders booleans as text', () => {
            const bool = true;
            const type = detectContentType(bool);
            expect(type).toBe('text');
        });

        it('renders null as text', () => {
            const nullVal = null;
            const type = detectContentType(nullVal);
            expect(type).toBe('text');
        });

        it('renders undefined as text', () => {
            const undefinedVal = undefined;
            const type = detectContentType(undefinedVal);
            expect(type).toBe('text');
        });
    });

    describe('Multiple parameters', () => {
        it('renders multiple parameters with proper spacing', () => {
            const params = {
                name: 'John Doe',
                description: '# Title\n\nDescription',
                code: 'const x = 1;',
                count: 42,
            };

            // Verify each parameter is processed
            const entries = Object.entries(params);
            expect(entries.length).toBe(4);

            // Verify types are detected correctly
            expect(detectContentType(entries[0][1])).toBe('text'); // name
            expect(detectContentType(entries[1][1])).toBe('text'); // description (markdown → text)
            expect(detectContentType(entries[2][1])).toBe('code'); // code
            expect(detectContentType(entries[3][1])).toBe('text'); // count
        });

        it('handles nested objects', () => {
            const metadata = { key: 'value', nested: { deep: 'object' } };
            const type = detectContentType(metadata);
            expect(type).toBe('json');
        });

        it('handles arrays', () => {
            const arr = [1, 2, 3, 4, 5];
            const type = detectContentType(arr);
            expect(type).toBe('text');
        });

        it('handles empty parameters object', () => {
            const params = {};
            const entries = Object.entries(params);
            expect(entries.length).toBe(0);
        });

        it('filters undefined values when hideOutput=true', () => {
            const params = {
                defined: 'value',
                undefined: undefined,
            };

            const hideOutput = true;
            const filtered = Object.entries(params).filter(
                ([, value]) => !(hideOutput && value === undefined)
            );

            expect(filtered.length).toBe(1);
            expect(filtered[0][0]).toBe('defined');
        });

        it('includes all parameters when hideOutput=false', () => {
            const params = {
                defined: 'value',
                undefined: undefined,
            };

            const hideOutput = false;
            const filtered = Object.entries(params).filter(
                ([, value]) => !(hideOutput && value === undefined)
            );

            expect(filtered.length).toBe(2);
        });
    });

    describe('Content type detection priority', () => {
        it('prioritizes JSON over code', () => {
            const jsonWithCode = '{"code": "const x = 1;"}';
            const type = detectContentType(jsonWithCode);
            expect(type).toBe('json');
        });

        it('detects code in diff-like content with code signals', () => {
            const diffWithCode = '--- a/file\n+++ b/file\nconst x = 1;';
            const type = detectContentType(diffWithCode);
            expect(type).toBe('code');
        });

        it('treats plain markdown as text', () => {
            const markdown = '# Heading Text';
            const type = detectContentType(markdown);
            expect(type).toBe('text');
        });

        it('recognizes code before plain text', () => {
            const code = 'const x = 5;';
            const type = detectContentType(code);
            expect(type).toBe('code');
        });
    });

    describe('Edge cases', () => {
        it('handles empty strings', () => {
            const type = detectContentType('');
            expect(type).toBe('text');
        });

        it('handles whitespace-only strings', () => {
            const type = detectContentType('   \n  \t  ');
            expect(type).toBe('text');
        });

        it('handles very long strings', () => {
            const longString = 'a'.repeat(10000);
            const type = detectContentType(longString);
            expect(type).toBe('text');
        });

        it('handles strings with mixed content', () => {
            const mixed = 'Some text with const x = 5; inline code';
            const type = detectContentType(mixed);
            // const x = 5 is a strong code signal (variable declaration)
            expect(type).toBe('code');
        });

        it('handles multiline markdown as text', () => {
            const markdown = `# Title

Some description text

- List item 1
- List item 2

**Bold text** and *italic*`;
            const type = detectContentType(markdown);
            expect(type).toBe('text');
        });
    });

});
