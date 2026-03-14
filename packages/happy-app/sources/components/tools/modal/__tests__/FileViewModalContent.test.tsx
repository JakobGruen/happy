import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import * as z from 'zod';

// --- Mocks must be before any imports that use mocked modules ---

// Mock react-native with functional components for react-test-renderer compatibility
function MockView(props: any) { return props.children ?? null; }
function MockText(props: any) { return props.children ?? null; }
function MockScrollView(props: any) { return props.children ?? null; }
function MockPressable(props: any) { return props.children ?? null; }

vi.mock('react-native', () => ({
    View: MockView,
    Text: MockText,
    ScrollView: MockScrollView,
    Pressable: MockPressable,
    Platform: { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default },
    StyleSheet: {
        absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
        create: (styles: any) => styles,
    },
    InteractionManager: {
        runAfterInteractions: (cb: () => void) => { cb(); return { cancel: () => {} }; },
    },
}));

// Mock react-native-reanimated
function MockAnimatedScrollView(props: any) { return props.children ?? null; }
MockAnimatedScrollView.displayName = 'AnimatedScrollView';
vi.mock('react-native-reanimated', () => ({
    default: {
        ScrollView: MockAnimatedScrollView,
        View: MockView,
    },
    useSharedValue: (initial: any) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    useAnimatedScrollHandler: () => undefined,
    useAnimatedRef: () => ({ current: null }),
    scrollTo: () => {},
    runOnUI: (fn: any) => () => fn(),
}));

// Mock react-native-unistyles
vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (fn: any) => {
            const fakeTheme = {
                colors: {
                    surfaceHigh: '#1a1a1a',
                    surfaceRipple: '#2a2a2a',
                    textSecondary: '#999',
                },
            };
            return typeof fn === 'function' ? fn(fakeTheme) : fn;
        },
    },
    useUnistyles: () => ({
        theme: {
            colors: {
                surfaceHigh: '#1a1a1a',
                surfaceRipple: '#2a2a2a',
                textSecondary: '#999',
            },
        },
    }),
}));

// Mock SimpleSyntaxHighlighter — functional component that preserves props
function MockSyntaxHighlighter(props: { code: string; language: string | null; selectable?: boolean }) {
    return null;
}
vi.mock('@/components/SimpleSyntaxHighlighter', () => ({
    SimpleSyntaxHighlighter: MockSyntaxHighlighter,
}));

// Mock Ionicons
function MockIonicons(props: any) { return null; }
vi.mock('@expo/vector-icons', () => ({
    Ionicons: MockIonicons,
}));

// Mock Typography
vi.mock('@/constants/Typography', () => ({
    Typography: {
        mono: () => ({ fontFamily: 'monospace' }),
    },
}));

// Mock useSettingMutable
let mockWrapLines = false;
const mockSetWrapLines = vi.fn();
vi.mock('@/sync/storage', () => ({
    useSettingMutable: (key: string) => {
        if (key === 'wrapLinesInDiffs') return [mockWrapLines, mockSetWrapLines];
        return [false, vi.fn()];
    },
}));

// Mock languageFromPath with a simplified version
vi.mock('@/utils/languageFromPath', () => ({
    languageFromPath: (path: string) => {
        if (!path) return null;
        const ext = path.split('.').pop();
        const map: Record<string, string> = {
            ts: 'typescript', tsx: 'typescript',
            py: 'python', js: 'javascript',
            json: 'json', md: 'markdown',
        };
        return map[ext || ''] ?? null;
    },
}));

// Mock knownTools with real Zod schemas matching the actual structure
vi.mock('@/components/tools/knownTools', () => ({
    knownTools: {
        Read: {
            input: z.object({
                file_path: z.string(),
                limit: z.number().optional(),
                offset: z.number().optional(),
            }).partial().passthrough(),
            result: z.object({
                file: z.object({
                    filePath: z.string(),
                    content: z.string(),
                    numLines: z.number(),
                    startLine: z.number(),
                    totalLines: z.number(),
                }).passthrough().optional(),
            }).partial().passthrough(),
        },
        Write: {
            input: z.object({
                file_path: z.string(),
                content: z.string(),
            }).partial().passthrough(),
        },
    },
}));

// Import after mocks
import renderer, { act } from 'react-test-renderer';
import { ToolCall } from '@/sync/typesMessage';
import {
    extractFileViewData,
    FileViewData,
    FileViewModalContent,
} from '../FileViewModalContent';

// --- Render helpers ---

/** Create a rendered test instance and return the root for querying */
function renderComponent(tool: ToolCall) {
    let inst: renderer.ReactTestRenderer;
    act(() => {
        inst = renderer.create(<FileViewModalContent tool={tool} />);
    });
    return inst!;
}

/** Collect all text strings from the rendered tree via testInstance API */
function collectAllText(root: renderer.ReactTestInstance): string[] {
    const textNodes = root.findAllByType(MockText);
    const texts: string[] = [];
    for (const node of textNodes) {
        for (const child of node.children) {
            if (typeof child === 'string') {
                texts.push(child);
            }
        }
    }
    return texts;
}

// --- Test helpers ---

function makeReadTool(overrides?: {
    input?: any;
    result?: any;
    state?: ToolCall['state'];
}): ToolCall {
    const hasResultOverride = overrides != null && 'result' in overrides;
    return {
        name: 'Read',
        state: overrides?.state ?? 'completed',
        input: overrides?.input ?? {
            file_path: '/home/user/project/src/index.ts',
        },
        createdAt: Date.now(),
        startedAt: Date.now(),
        completedAt: Date.now(),
        description: null,
        result: hasResultOverride ? overrides!.result : {
            file: {
                filePath: '/home/user/project/src/index.ts',
                content: 'const x = 1;\nconsole.log(x);',
                numLines: 2,
                startLine: 1,
                totalLines: 2,
            },
        },
    };
}

function makeWriteTool(overrides?: {
    input?: any;
    result?: any;
    state?: ToolCall['state'];
}): ToolCall {
    return {
        name: 'Write',
        state: overrides?.state ?? 'completed',
        input: overrides?.input ?? {
            file_path: '/home/user/project/src/app.py',
            content: 'print("hello")\nprint("world")',
        },
        createdAt: Date.now(),
        startedAt: Date.now(),
        completedAt: Date.now(),
        description: null,
        result: overrides?.result ?? {},
    };
}

// --- Tests ---

describe('FileViewModalContent', () => {
    beforeEach(() => {
        mockWrapLines = false;
        mockSetWrapLines.mockClear();
    });

    describe('extractFileViewData — Read tool', () => {
        it('extracts content and metadata from a completed Read tool', () => {
            const tool = makeReadTool();
            const data = extractFileViewData(tool);

            expect(data).not.toBeNull();
            expect(data!.content).toBe('const x = 1;\nconsole.log(x);');
            expect(data!.filePath).toBe('/home/user/project/src/index.ts');
            expect(data!.fileName).toBe('index.ts');
            expect(data!.language).toBe('typescript');
            expect(data!.startLine).toBe(1);
            expect(data!.numLines).toBe(2);
            expect(data!.totalLines).toBe(2);
            expect(data!.isPartialRead).toBe(false);
        });

        it('detects partial read when startLine > 1', () => {
            const tool = makeReadTool({
                result: {
                    file: {
                        filePath: '/home/user/file.ts',
                        content: 'line50\nline51',
                        numLines: 2,
                        startLine: 50,
                        totalLines: 200,
                    },
                },
            });
            const data = extractFileViewData(tool);

            expect(data!.isPartialRead).toBe(true);
            expect(data!.startLine).toBe(50);
            expect(data!.totalLines).toBe(200);
        });

        it('detects partial read when numLines < totalLines', () => {
            const tool = makeReadTool({
                result: {
                    file: {
                        filePath: '/home/user/file.ts',
                        content: 'line1\nline2',
                        numLines: 2,
                        startLine: 1,
                        totalLines: 500,
                    },
                },
            });
            const data = extractFileViewData(tool);

            expect(data!.isPartialRead).toBe(true);
            expect(data!.numLines).toBe(2);
            expect(data!.totalLines).toBe(500);
        });

        it('returns null for running Read tool (no result)', () => {
            const tool = makeReadTool({ state: 'running', result: undefined });
            const data = extractFileViewData(tool);

            expect(data).toBeNull();
        });

        it('returns null when result has no file property', () => {
            const tool = makeReadTool({ result: {} });
            const data = extractFileViewData(tool);

            expect(data).toBeNull();
        });

        it('returns null when file.content is missing', () => {
            const tool = makeReadTool({
                result: {
                    file: {
                        filePath: '/home/user/file.ts',
                        numLines: 2,
                        startLine: 1,
                        totalLines: 2,
                    },
                },
            });
            const data = extractFileViewData(tool);

            expect(data).toBeNull();
        });

        it('extracts content from result.file even when filePath is missing (falls back to input.file_path)', () => {
            const tool = makeReadTool({
                input: { file_path: '/home/user/fallback.py' },
                result: {
                    file: {
                        content: 'x = 1',
                        numLines: 1,
                        startLine: 1,
                        totalLines: 1,
                    },
                },
            });
            const data = extractFileViewData(tool);

            expect(data).not.toBeNull();
            expect(data!.content).toBe('x = 1');
            expect(data!.fileName).toBe('fallback.py');
        });

        it('extracts filename from deep path', () => {
            const tool = makeReadTool({
                result: {
                    file: {
                        filePath: '/very/deep/nested/path/to/Component.tsx',
                        content: 'export default function() {}',
                        numLines: 1,
                        startLine: 1,
                        totalLines: 1,
                    },
                },
            });
            const data = extractFileViewData(tool);

            expect(data!.fileName).toBe('Component.tsx');
            expect(data!.language).toBe('typescript');
        });
    });

    describe('extractFileViewData — wire format (string result with cat -n)', () => {
        it('strips tab-separated line numbers from cat -n output', () => {
            const tool = makeReadTool({
                input: { file_path: '/src/index.ts' },
                result: "     1\tconst x = 1;\n     2\tconsole.log(x);",
            });
            const data = extractFileViewData(tool);

            expect(data).not.toBeNull();
            expect(data!.content).toBe('const x = 1;\nconsole.log(x);');
            expect(data!.startLine).toBe(1);
        });

        it('strips arrow-separated line numbers (U+2192) from Read tool output', () => {
            const tool = makeReadTool({
                input: { file_path: '/src/index.ts' },
                result: "     1\u2192const x = 1;\n     2\u2192console.log(x);",
            });
            const data = extractFileViewData(tool);

            expect(data).not.toBeNull();
            expect(data!.content).toBe('const x = 1;\nconsole.log(x);');
            expect(data!.startLine).toBe(1);
        });

        it('detects startLine from cat -n with offset', () => {
            const tool = makeReadTool({
                input: { file_path: '/src/big.ts', offset: 50 },
                result: "    50\u2192line fifty\n    51\u2192line fifty-one",
            });
            const data = extractFileViewData(tool);

            expect(data!.startLine).toBe(50);
            expect(data!.isPartialRead).toBe(true);
        });

        it('handles content block array format', () => {
            const tool = makeReadTool({
                input: { file_path: '/src/app.ts' },
                result: [
                    { type: 'text', text: "     1\u2192const a = 1;\n     2\u2192const b = 2;" },
                ],
            });
            const data = extractFileViewData(tool);

            expect(data).not.toBeNull();
            expect(data!.content).toBe('const a = 1;\nconst b = 2;');
        });
    });

    describe('extractFileViewData — Write tool', () => {
        it('extracts content from Write tool input', () => {
            const tool = makeWriteTool();
            const data = extractFileViewData(tool);

            expect(data).not.toBeNull();
            expect(data!.content).toBe('print("hello")\nprint("world")');
            expect(data!.filePath).toBe('/home/user/project/src/app.py');
            expect(data!.fileName).toBe('app.py');
            expect(data!.language).toBe('python');
            expect(data!.isPartialRead).toBe(false);
            expect(data!.startLine).toBe(1);
        });

        it('returns null when Write input has no content', () => {
            const tool = makeWriteTool({ input: { file_path: '/file.ts' } });
            const data = extractFileViewData(tool);

            expect(data).toBeNull();
        });

        it('returns data with empty filename when file_path is missing', () => {
            const tool = makeWriteTool({ input: { content: 'hello' } });
            const data = extractFileViewData(tool);

            expect(data).not.toBeNull();
            expect(data!.fileName).toBe('');
            expect(data!.language).toBeNull();
        });

        it('handles Write tool in running state (content from input)', () => {
            const tool = makeWriteTool({ state: 'running' });
            const data = extractFileViewData(tool);

            expect(data).not.toBeNull();
            expect(data!.content).toBe('print("hello")\nprint("world")');
        });
    });

    describe('extractFileViewData — unsupported tools', () => {
        it('returns null for Bash tool', () => {
            const tool: ToolCall = {
                name: 'Bash',
                state: 'completed',
                input: { command: 'ls' },
                createdAt: Date.now(),
                startedAt: Date.now(),
                completedAt: Date.now(),
                description: null,
                result: 'file1.txt\nfile2.txt',
            };
            const data = extractFileViewData(tool);

            expect(data).toBeNull();
        });

        it('returns null for Edit tool', () => {
            const tool: ToolCall = {
                name: 'Edit',
                state: 'completed',
                input: { file_path: '/f.ts', old_string: 'a', new_string: 'b' },
                createdAt: Date.now(),
                startedAt: Date.now(),
                completedAt: Date.now(),
                description: null,
            };
            const data = extractFileViewData(tool);

            expect(data).toBeNull();
        });
    });

    describe('extractFileViewData — language detection', () => {
        it('detects language from .json extension', () => {
            const tool = makeReadTool({
                result: {
                    file: {
                        filePath: '/config/package.json',
                        content: '{}',
                        numLines: 1,
                        startLine: 1,
                        totalLines: 1,
                    },
                },
            });
            const data = extractFileViewData(tool);
            expect(data!.language).toBe('json');
        });

        it('returns null language for unknown extension', () => {
            const tool = makeReadTool({
                result: {
                    file: {
                        filePath: '/home/user/data.xyz',
                        content: 'unknown format',
                        numLines: 1,
                        startLine: 1,
                        totalLines: 1,
                    },
                },
            });
            const data = extractFileViewData(tool);
            expect(data!.language).toBeNull();
        });
    });

    describe('partial read indicator formatting', () => {
        it('computes "Lines X\u2013Y of Z" from FileViewData', () => {
            const data: FileViewData = {
                content: 'a\nb',
                filePath: '/file.ts',
                fileName: 'file.ts',
                language: 'typescript',
                startLine: 50,
                numLines: 2,
                totalLines: 200,
                isPartialRead: true,
            };
            const endLine = data.startLine + data.numLines - 1;
            const rangeText = `Lines ${data.startLine}\u2013${endLine} of ${data.totalLines}`;
            expect(rangeText).toBe('Lines 50\u201351 of 200');
        });

        it('computes single line range correctly', () => {
            const data: FileViewData = {
                content: 'single line',
                filePath: '/file.ts',
                fileName: 'file.ts',
                language: 'typescript',
                startLine: 100,
                numLines: 1,
                totalLines: 500,
                isPartialRead: true,
            };
            const endLine = data.startLine + data.numLines - 1;
            const rangeText = `Lines ${data.startLine}\u2013${endLine} of ${data.totalLines}`;
            expect(rangeText).toBe('Lines 100\u2013100 of 500');
        });
    });

    describe('FileViewModalContent rendering', () => {
        describe('fallback states', () => {
            it('shows "Waiting for result…" for a running Read tool', () => {
                const tool = makeReadTool({ state: 'running', result: undefined });
                const inst = renderComponent(tool);
                const texts = collectAllText(inst.root);

                expect(texts.some(t => t.startsWith('Waiting for result'))).toBe(true);
            });

            it('shows "No content available" when Read result has no file data', () => {
                const tool = makeReadTool({ result: {} });
                const inst = renderComponent(tool);
                const texts = collectAllText(inst.root);

                expect(texts).toContain('No content available');
            });

            it('shows "No content available" when Write input has no content', () => {
                const tool = makeWriteTool({ input: { file_path: '/file.ts' } });
                const inst = renderComponent(tool);
                const texts = collectAllText(inst.root);

                expect(texts).toContain('No content available');
            });

            it('shows "Unable to display file" for an unsupported tool', () => {
                const tool: ToolCall = {
                    name: 'Bash',
                    state: 'completed',
                    input: { command: 'ls' },
                    createdAt: Date.now(),
                    startedAt: Date.now(),
                    completedAt: Date.now(),
                    description: null,
                    result: 'output',
                };
                const inst = renderComponent(tool);
                const texts = collectAllText(inst.root);

                expect(texts).toContain('Unable to display file');
            });
        });

        describe('line numbers (always shown per-line)', () => {
            it('renders line numbers alongside each code line', () => {
                const tool = makeReadTool({
                    result: {
                        file: {
                            filePath: '/src/app.ts',
                            content: 'line1\nline2\nline3',
                            numLines: 3,
                            startLine: 1,
                            totalLines: 3,
                        },
                    },
                });
                const inst = renderComponent(tool);
                const texts = collectAllText(inst.root);

                expect(texts).toContain('1');
                expect(texts).toContain('2');
                expect(texts).toContain('3');
            });

            it('renders line numbers starting from startLine for partial reads', () => {
                const tool = makeReadTool({
                    result: {
                        file: {
                            filePath: '/src/app.ts',
                            content: 'a\nb',
                            numLines: 2,
                            startLine: 50,
                            totalLines: 200,
                        },
                    },
                });
                const inst = renderComponent(tool);
                const texts = collectAllText(inst.root);

                expect(texts).toContain('50');
                expect(texts).toContain('51');
                expect(texts).not.toContain('1');
            });
        });

        describe('SimpleSyntaxHighlighter props', () => {
            it('passes per-line code and language to SimpleSyntaxHighlighter for Read tool', () => {
                const tool = makeReadTool({
                    result: {
                        file: {
                            filePath: '/src/index.ts',
                            content: 'const x = 1;',
                            numLines: 1,
                            startLine: 1,
                            totalLines: 1,
                        },
                    },
                });
                const inst = renderComponent(tool);
                const highlighters = inst.root.findAllByType(MockSyntaxHighlighter as any);

                // Both wrapped + unwrapped views are always mounted, so 2x highlighters
                expect(highlighters).toHaveLength(2);
                expect(highlighters[0].props.code).toBe('const x = 1;');
                expect(highlighters[0].props.language).toBe('typescript');
            });

            it('renders one highlighter per line for multi-line content', () => {
                const tool = makeWriteTool({
                    input: {
                        file_path: '/src/app.py',
                        content: 'print("hello")\nprint("world")',
                    },
                });
                const inst = renderComponent(tool);
                const highlighters = inst.root.findAllByType(MockSyntaxHighlighter as any);

                // Both wrapped + unwrapped views are always mounted, so 2x highlighters per line
                expect(highlighters).toHaveLength(4);
                expect(highlighters[0].props.code).toBe('print("hello")');
                expect(highlighters[1].props.code).toBe('print("world")');
                expect(highlighters[0].props.language).toBe('python');
            });

            it('passes null language for unknown file extensions', () => {
                const tool = makeReadTool({
                    result: {
                        file: {
                            filePath: '/data/file.xyz',
                            content: 'unknown',
                            numLines: 1,
                            startLine: 1,
                            totalLines: 1,
                        },
                    },
                });
                const inst = renderComponent(tool);
                const highlighters = inst.root.findAllByType(MockSyntaxHighlighter as any);

                // Both wrapped + unwrapped views are always mounted
                expect(highlighters).toHaveLength(2);
                expect(highlighters[0].props.code).toBe('unknown');
                expect(highlighters[0].props.language).toBeNull();
            });
        });

        describe('FileHeader rendering', () => {
            it('renders the filename in the header', () => {
                const tool = makeReadTool();
                const inst = renderComponent(tool);
                const texts = collectAllText(inst.root);

                expect(texts).toContain('index.ts');
            });

            it('renders partial-read range indicator for partial reads', () => {
                const tool = makeReadTool({
                    result: {
                        file: {
                            filePath: '/src/big.ts',
                            content: 'a\nb\nc',
                            numLines: 3,
                            startLine: 10,
                            totalLines: 100,
                        },
                    },
                });
                const inst = renderComponent(tool);
                const texts = collectAllText(inst.root);

                expect(texts).toContain('big.ts');
                expect(texts).toContain('Lines 10\u201312 of 100');
            });

            it('does not render range indicator for full reads', () => {
                const tool = makeReadTool({
                    result: {
                        file: {
                            filePath: '/src/small.ts',
                            content: 'x',
                            numLines: 1,
                            startLine: 1,
                            totalLines: 1,
                        },
                    },
                });
                const inst = renderComponent(tool);
                const texts = collectAllText(inst.root);

                expect(texts).toContain('small.ts');
                expect(texts.some(t => t.includes('Lines'))).toBe(false);
            });

            it('does not render header when filename is empty', () => {
                const tool = makeWriteTool({ input: { content: 'hello' } });
                const inst = renderComponent(tool);
                const highlighters = inst.root.findAllByType(MockSyntaxHighlighter as any);

                // Syntax highlighter should still render (2x for dual views)
                expect(highlighters).toHaveLength(2);
                // No range text
                const texts = collectAllText(inst.root);
                expect(texts.some(t => t.includes('Lines'))).toBe(false);
            });
        });

        describe('wrap toggle', () => {
            it('renders the wrap toggle button in the header', () => {
                const tool = makeReadTool();
                const inst = renderComponent(tool);
                const pressables = inst.root.findAllByType(MockPressable);

                // At least one Pressable for the wrap toggle
                expect(pressables.length).toBeGreaterThanOrEqual(1);
            });
        });
    });
});
