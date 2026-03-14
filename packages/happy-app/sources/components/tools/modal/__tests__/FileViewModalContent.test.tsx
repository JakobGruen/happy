import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as z from 'zod';

// --- Mocks must be before any imports that use mocked modules ---

// Mock react-native
vi.mock('react-native', () => ({
    View: 'View',
    Text: 'Text',
    ScrollView: 'ScrollView',
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

// Mock SimpleSyntaxHighlighter
vi.mock('@/components/SimpleSyntaxHighlighter', () => ({
    SimpleSyntaxHighlighter: () => 'SimpleSyntaxHighlighter',
}));

// Mock useSetting
let mockShowLineNumbers = false;
vi.mock('@/sync/storage', () => ({
    useSetting: (key: string) => {
        if (key === 'showLineNumbersInToolViews') return mockShowLineNumbers;
        return false;
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
import { ToolCall } from '@/sync/typesMessage';
import {
    extractFileViewData,
    FileViewData,
} from '../FileViewModalContent';

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
        mockShowLineNumbers = false;
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

        it('returns null when result.file is missing filePath (Zod validation fails on file sub-object)', () => {
            const tool = makeReadTool({
                input: { file_path: '/home/user/fallback.py' },
                result: {
                    file: {
                        // filePath is required in the Zod schema; missing → file becomes undefined
                        content: 'x = 1',
                        numLines: 1,
                        startLine: 1,
                        totalLines: 1,
                    },
                },
            });
            const data = extractFileViewData(tool);

            // file sub-object fails validation, so file is undefined → null
            expect(data).toBeNull();
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
});
