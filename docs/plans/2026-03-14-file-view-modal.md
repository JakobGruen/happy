# File View Modal — Read & Write Tool Display

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display Read and Write tool calls with a full-file syntax-highlighted view (instead of generic INPUT/OUTPUT tabs or all-green diff), with language detection based on file extension.

**Architecture:** New `FileViewModalContent` component renders file content with `SimpleSyntaxHighlighter`, reusing the existing `DiffHeader` pattern for the filename bar. A shared `languageFromPath()` utility maps file extensions → language strings. The `ToolModal` routing table is updated to send Read/Write to this new component instead of their current targets.

**Tech Stack:** React Native, Unistyles, SimpleSyntaxHighlighter (existing), Zod schemas from knownTools (existing)

---

## Task 1: Create `languageFromPath()` utility

**Files:**
- Create: `packages/happy-app/sources/utils/languageFromPath.ts`
- Test: `packages/happy-app/sources/utils/__tests__/languageFromPath.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/happy-app/sources/utils/__tests__/languageFromPath.test.ts
import { describe, it, expect } from 'vitest';
import { languageFromPath } from '../languageFromPath';

describe('languageFromPath', () => {
    it('detects TypeScript from .ts extension', () => {
        expect(languageFromPath('/home/user/foo.ts')).toBe('typescript');
    });

    it('detects TypeScript from .tsx extension', () => {
        expect(languageFromPath('/src/Component.tsx')).toBe('typescript');
    });

    it('detects JavaScript from .js extension', () => {
        expect(languageFromPath('index.js')).toBe('javascript');
    });

    it('detects JavaScript from .jsx extension', () => {
        expect(languageFromPath('App.jsx')).toBe('javascript');
    });

    it('detects Python from .py extension', () => {
        expect(languageFromPath('main.py')).toBe('python');
    });

    it('detects JSON from .json extension', () => {
        expect(languageFromPath('package.json')).toBe('json');
    });

    it('detects Go from .go extension', () => {
        expect(languageFromPath('main.go')).toBe('go');
    });

    it('detects Rust from .rs extension', () => {
        expect(languageFromPath('lib.rs')).toBe('rust');
    });

    it('detects CSS from .css extension', () => {
        expect(languageFromPath('styles.css')).toBe('css');
    });

    it('detects HTML from .html extension', () => {
        expect(languageFromPath('index.html')).toBe('html');
    });

    it('detects Markdown from .md extension', () => {
        expect(languageFromPath('README.md')).toBe('markdown');
    });

    it('detects YAML from .yml extension', () => {
        expect(languageFromPath('config.yml')).toBe('yaml');
    });

    it('detects YAML from .yaml extension', () => {
        expect(languageFromPath('docker-compose.yaml')).toBe('yaml');
    });

    it('detects Shell from .sh extension', () => {
        expect(languageFromPath('build.sh')).toBe('shell');
    });

    it('detects SQL from .sql extension', () => {
        expect(languageFromPath('migration.sql')).toBe('sql');
    });

    it('detects Ruby from .rb extension', () => {
        expect(languageFromPath('Gemfile.rb')).toBe('ruby');
    });

    it('detects Java from .java extension', () => {
        expect(languageFromPath('Main.java')).toBe('java');
    });

    it('detects Kotlin from .kt extension', () => {
        expect(languageFromPath('App.kt')).toBe('kotlin');
    });

    it('detects Swift from .swift extension', () => {
        expect(languageFromPath('ViewController.swift')).toBe('swift');
    });

    it('detects C from .c extension', () => {
        expect(languageFromPath('main.c')).toBe('c');
    });

    it('detects C++ from .cpp extension', () => {
        expect(languageFromPath('main.cpp')).toBe('cpp');
    });

    it('detects C header from .h extension', () => {
        expect(languageFromPath('header.h')).toBe('c');
    });

    it('detects Julia from .jl extension', () => {
        expect(languageFromPath('model.jl')).toBe('julia');
    });

    it('returns null for unknown extensions', () => {
        expect(languageFromPath('/path/to/file.xyz')).toBeNull();
    });

    it('returns null for files without extension', () => {
        expect(languageFromPath('Makefile')).toBeNull();
    });

    it('handles empty string', () => {
        expect(languageFromPath('')).toBeNull();
    });

    it('is case-insensitive for extensions', () => {
        expect(languageFromPath('README.MD')).toBe('markdown');
        expect(languageFromPath('foo.PY')).toBe('python');
    });

    it('detects Prisma from .prisma extension', () => {
        expect(languageFromPath('schema.prisma')).toBe('prisma');
    });

    it('detects TOML from .toml extension', () => {
        expect(languageFromPath('pyproject.toml')).toBe('toml');
    });

    it('detects Dockerfile (no extension, name-based)', () => {
        expect(languageFromPath('Dockerfile')).toBe('dockerfile');
        expect(languageFromPath('Dockerfile.server')).toBe('dockerfile');
    });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/happy-app && bunx vitest run sources/utils/__tests__/languageFromPath.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// packages/happy-app/sources/utils/languageFromPath.ts

const EXTENSION_MAP: Record<string, string> = {
    // JavaScript / TypeScript
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.tsx': 'typescript',

    // Python
    '.py': 'python',
    '.pyi': 'python',

    // Data / Config
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.xml': 'xml',
    '.csv': 'text',
    '.env': 'shell',

    // Web
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'css',
    '.less': 'css',
    '.svg': 'xml',

    // Shell
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.fish': 'shell',

    // Systems
    '.go': 'go',
    '.rs': 'rust',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.hpp': 'cpp',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.java': 'java',

    // Other
    '.rb': 'ruby',
    '.php': 'php',
    '.sql': 'sql',
    '.md': 'markdown',
    '.mdx': 'markdown',
    '.prisma': 'prisma',
    '.graphql': 'graphql',
    '.gql': 'graphql',
    '.jl': 'julia',
    '.lua': 'lua',
    '.r': 'r',
    '.R': 'r',
    '.zig': 'zig',
    '.ex': 'elixir',
    '.exs': 'elixir',
};

/** Name-based detection for extensionless files */
const NAME_MAP: Record<string, string> = {
    'Dockerfile': 'dockerfile',
    'Makefile': 'makefile',
    'Jenkinsfile': 'groovy',
    'Vagrantfile': 'ruby',
};

/**
 * Detect programming language from a file path's extension.
 * Returns null if the language cannot be determined.
 */
export function languageFromPath(filePath: string): string | null {
    if (!filePath) return null;

    // Check name-based matches first (Dockerfile, Dockerfile.server, etc.)
    const basename = filePath.split('/').pop() || filePath;
    const namePrefix = basename.split('.')[0];
    if (NAME_MAP[namePrefix]) return NAME_MAP[namePrefix];
    if (NAME_MAP[basename]) return NAME_MAP[basename];

    // Extract extension
    const dotIndex = basename.lastIndexOf('.');
    if (dotIndex === -1) return null;

    const ext = basename.slice(dotIndex).toLowerCase();
    return EXTENSION_MAP[ext] ?? null;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/happy-app && bunx vitest run sources/utils/__tests__/languageFromPath.test.ts`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add packages/happy-app/sources/utils/languageFromPath.ts packages/happy-app/sources/utils/__tests__/languageFromPath.test.ts
git commit -m "feat(app): add languageFromPath utility for file extension → language mapping"
```

---

## Task 2: Create `FileViewModalContent` component

**Files:**
- Create: `packages/happy-app/sources/components/tools/modal/FileViewModalContent.tsx`
- Test: `packages/happy-app/sources/components/tools/modal/__tests__/FileViewModalContent.test.tsx`

**Context:**
- Reuses the `DiffHeader` pattern from `DiffModalContent.tsx` (filename bar at top)
- Uses `SimpleSyntaxHighlighter` with language from `languageFromPath()`
- Shows line numbers in a gutter column (respects `showLineNumbersInToolViews` setting)
- For **Read**: extracts content from `tool.result.file.content` (per `knownTools.Read.result` schema), file path from `tool.input.file_path`
- For **Write**: extracts content from `tool.input.content`, file path from `tool.input.file_path`
- Shows a metadata bar: file path, line count, partial-read indicator (e.g. "Lines 50–100 of 200")

**Step 1: Write the failing test**

```typescript
// packages/happy-app/sources/components/tools/modal/__tests__/FileViewModalContent.test.tsx
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { FileViewModalContent } from '../FileViewModalContent';
import type { ToolCall } from '@/sync/typesMessage';

// Mock SimpleSyntaxHighlighter to avoid complex rendering in tests
vi.mock('@/components/SimpleSyntaxHighlighter', () => ({
    SimpleSyntaxHighlighter: ({ code, language }: { code: string; language: string | null }) => {
        const { Text } = require('react-native');
        return <Text testID="syntax-highlighter">{`[${language}] ${code.substring(0, 50)}`}</Text>;
    },
}));

// Mock useSetting
vi.mock('@/sync/storage', () => ({
    useSetting: (key: string) => {
        if (key === 'showLineNumbersInToolViews') return true;
        if (key === 'wrapLinesInDiffs') return false;
        return undefined;
    },
}));

const makeReadTool = (overrides?: Partial<ToolCall>): ToolCall => ({
    id: 'tool-1',
    name: 'Read',
    input: { file_path: '/home/user/project/src/index.ts' },
    result: {
        file: {
            filePath: '/home/user/project/src/index.ts',
            content: 'const x = 1;\nconst y = 2;\nexport { x, y };',
            numLines: 3,
            startLine: 1,
            totalLines: 3,
        },
    },
    state: 'completed',
    createdAt: Date.now(),
    ...overrides,
});

const makeWriteTool = (overrides?: Partial<ToolCall>): ToolCall => ({
    id: 'tool-2',
    name: 'Write',
    input: {
        file_path: '/home/user/project/config.json',
        content: '{\n  "name": "test"\n}',
    },
    result: null,
    state: 'completed',
    createdAt: Date.now(),
    ...overrides,
});

describe('FileViewModalContent', () => {
    describe('Read tool', () => {
        it('renders file content from result', () => {
            render(<FileViewModalContent tool={makeReadTool()} />);
            const highlighter = screen.getByTestId('syntax-highlighter');
            expect(highlighter).toBeTruthy();
            expect(highlighter.props.children).toContain('const x = 1');
        });

        it('detects language from file path', () => {
            render(<FileViewModalContent tool={makeReadTool()} />);
            const highlighter = screen.getByTestId('syntax-highlighter');
            expect(highlighter.props.children).toContain('[typescript]');
        });

        it('shows filename in header', () => {
            render(<FileViewModalContent tool={makeReadTool()} />);
            expect(screen.getByText('index.ts')).toBeTruthy();
        });

        it('shows partial read indicator when startLine > 1', () => {
            render(<FileViewModalContent tool={makeReadTool({
                result: {
                    file: {
                        filePath: '/src/big.ts',
                        content: 'line50\nline51',
                        numLines: 2,
                        startLine: 50,
                        totalLines: 200,
                    },
                },
            })} />);
            expect(screen.getByText(/50–51 of 200/)).toBeTruthy();
        });

        it('renders fallback when result is missing', () => {
            render(<FileViewModalContent tool={makeReadTool({ result: null })} />);
            expect(screen.getByText(/waiting for result|no content/i)).toBeTruthy();
        });
    });

    describe('Write tool', () => {
        it('renders content from input', () => {
            render(<FileViewModalContent tool={makeWriteTool()} />);
            const highlighter = screen.getByTestId('syntax-highlighter');
            expect(highlighter.props.children).toContain('[json]');
            expect(highlighter.props.children).toContain('"name"');
        });

        it('shows filename in header', () => {
            render(<FileViewModalContent tool={makeWriteTool()} />);
            expect(screen.getByText('config.json')).toBeTruthy();
        });
    });

    describe('unknown tool', () => {
        it('renders fallback for unsupported tool name', () => {
            render(<FileViewModalContent tool={{ ...makeReadTool(), name: 'Unknown' }} />);
            expect(screen.getByText(/unable to display/i)).toBeTruthy();
        });
    });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/happy-app && bunx vitest run sources/components/tools/modal/__tests__/FileViewModalContent.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```tsx
// packages/happy-app/sources/components/tools/modal/FileViewModalContent.tsx
import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall } from '@/sync/typesMessage';
import { knownTools } from '@/components/tools/knownTools';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { languageFromPath } from '@/utils/languageFromPath';
import { useSetting } from '@/sync/storage';

interface FileViewModalContentProps {
    tool: ToolCall;
}

/**
 * Full-file view with syntax highlighting for Read and Write tools.
 * - Read: shows file content from tool.result.file
 * - Write: shows content being written from tool.input.content
 */
export const FileViewModalContent = React.memo<FileViewModalContentProps>(({ tool }) => {
    const { theme } = useUnistyles();
    const showLineNumbers = useSetting('showLineNumbersInToolViews');

    // Extract file path and content based on tool type
    const { filePath, content, meta } = React.useMemo(() => {
        if (tool.name === 'Read') {
            const parsed = knownTools.Read.input.safeParse(tool.input);
            const inputPath = parsed.success ? parsed.data.file_path : undefined;

            // Result has nested file object
            const result = tool.result as any;
            const file = result?.file;
            if (file && typeof file.content === 'string') {
                return {
                    filePath: file.filePath || inputPath || '',
                    content: file.content,
                    meta: {
                        startLine: file.startLine as number | undefined,
                        numLines: file.numLines as number | undefined,
                        totalLines: file.totalLines as number | undefined,
                    },
                };
            }

            // Fallback: result might be a plain string
            if (typeof result === 'string') {
                return { filePath: inputPath || '', content: result, meta: {} };
            }

            return { filePath: inputPath || '', content: null, meta: {} };
        }

        if (tool.name === 'Write') {
            const parsed = knownTools.Write.input.safeParse(tool.input);
            if (parsed.success) {
                return {
                    filePath: parsed.data.file_path || '',
                    content: typeof parsed.data.content === 'string' ? parsed.data.content : null,
                    meta: {},
                };
            }
            return { filePath: '', content: null, meta: {} };
        }

        return { filePath: '', content: null, meta: {} };
    }, [tool.name, tool.input, tool.result]);

    const language = React.useMemo(
        () => (filePath ? languageFromPath(filePath) : null),
        [filePath],
    );

    const fileName = filePath ? filePath.split('/').pop() || filePath : '';

    // Build metadata line (e.g. "Lines 50–51 of 200")
    const metaLabel = React.useMemo(() => {
        if (!meta.startLine || !meta.numLines || !meta.totalLines) return null;
        if (meta.startLine === 1 && meta.numLines === meta.totalLines) return null;
        const endLine = meta.startLine + meta.numLines - 1;
        return `Lines ${meta.startLine}–${endLine} of ${meta.totalLines}`;
    }, [meta]);

    if (content === null) {
        return (
            <View style={styles.fallback}>
                <Text style={[styles.fallbackText, { color: theme.colors.textSecondary }]}>
                    {tool.state === 'running' ? 'Waiting for result…' : 'No content available'}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* File header */}
            {fileName ? (
                <View style={[styles.fileHeader, { borderBottomColor: theme.colors.surfaceRipple }]}>
                    <Text
                        style={[styles.fileName, { color: theme.colors.textSecondary }]}
                        numberOfLines={1}
                    >
                        {fileName}
                    </Text>
                    {metaLabel && (
                        <Text style={[styles.metaLabel, { color: theme.colors.textSecondary }]}>
                            {metaLabel}
                        </Text>
                    )}
                </View>
            ) : null}

            {/* File content with syntax highlighting */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator
            >
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator
                    contentContainerStyle={styles.horizontalContent}
                >
                    {showLineNumbers && (
                        <LineNumbers
                            lineCount={content.split('\n').length}
                            startLine={meta.startLine ?? 1}
                        />
                    )}
                    <View style={styles.codeContainer}>
                        <SimpleSyntaxHighlighter
                            code={content}
                            language={language}
                            selectable
                        />
                    </View>
                </ScrollView>
            </ScrollView>
        </View>
    );
});

/** Line number gutter */
const LineNumbers = React.memo<{ lineCount: number; startLine: number }>(
    ({ lineCount, startLine }) => {
        const { theme } = useUnistyles();
        const lines = React.useMemo(() => {
            const arr: string[] = [];
            for (let i = 0; i < lineCount; i++) {
                arr.push(String(startLine + i));
            }
            return arr;
        }, [lineCount, startLine]);

        return (
            <View style={[styles.lineNumbers, { borderRightColor: theme.colors.surfaceRipple }]}>
                {lines.map((num, i) => (
                    <Text
                        key={i}
                        style={[styles.lineNumber, { color: theme.colors.textSecondary }]}
                    >
                        {num}
                    </Text>
                ))}
            </View>
        );
    },
);

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surfaceHigh,
    },
    fileHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    fileName: {
        fontSize: 13,
        fontFamily: 'monospace',
        fontWeight: '500',
        flexShrink: 1,
    },
    metaLabel: {
        fontSize: 12,
        fontFamily: 'monospace',
        marginLeft: 12,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    horizontalContent: {
        flexDirection: 'row',
        flexGrow: 1,
        paddingVertical: 8,
    },
    lineNumbers: {
        paddingHorizontal: 8,
        borderRightWidth: 1,
        alignItems: 'flex-end',
        marginRight: 8,
    },
    lineNumber: {
        fontSize: 12,
        fontFamily: 'monospace',
        lineHeight: 20,
        opacity: 0.5,
    },
    codeContainer: {
        flex: 1,
        paddingRight: 16,
    },
    fallback: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    fallbackText: {
        fontSize: 14,
        fontStyle: 'italic',
    },
}));
```

**Step 4: Run test to verify it passes**

Run: `cd packages/happy-app && bunx vitest run sources/components/tools/modal/__tests__/FileViewModalContent.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/FileViewModalContent.tsx packages/happy-app/sources/components/tools/modal/__tests__/FileViewModalContent.test.tsx
git commit -m "feat(app): add FileViewModalContent for Read/Write tool syntax-highlighted file view"
```

---

## Task 3: Update `ToolModal` routing

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/ToolModal.tsx` (lines 24, 157–161)
- Test: `packages/happy-app/sources/components/tools/modal/__tests__/ToolModal.test.tsx` (update existing)

**Step 1: Update the routing constants and imports in ToolModal.tsx**

Change `DIFF_TOOLS` set to exclude `Write`, and add a new `FILE_VIEW_TOOLS` set:

```diff
- const DIFF_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
+ const DIFF_TOOLS = new Set(['Edit', 'MultiEdit']);
+ const FILE_VIEW_TOOLS = new Set(['Read', 'Write']);
  const AGENT_TOOLS = new Set(['Task', 'Agent']);
```

Add import:
```diff
  import { DiffModalContent } from './DiffModalContent';
+ import { FileViewModalContent } from './FileViewModalContent';
  import { AgentModalContent } from './AgentModalContent';
```

Update the content routing (around line 157):
```diff
  {/* Content — route by tool type */}
  {AGENT_TOOLS.has(tool.name)
      ? <AgentModalContent tool={tool} metadata={metadata} messages={messages || []} />
      : DIFF_TOOLS.has(tool.name)
      ? <DiffModalContent tool={tool} />
+     : FILE_VIEW_TOOLS.has(tool.name)
+     ? <FileViewModalContent tool={tool} />
      : <ToolModalTabs tool={tool} hideOutput={hideOutput} />
  }
```

**Step 2: Update existing ToolModal tests**

Add test cases in the existing `ToolModal.test.tsx` (or `ToolModal.integration.test.tsx`) to verify routing:

```typescript
it('routes Read tool to FileViewModalContent', () => {
    const tool = makeToolCall({ name: 'Read', input: { file_path: '/foo.ts' }, result: { file: { content: 'code', filePath: '/foo.ts', numLines: 1, startLine: 1, totalLines: 1 } } });
    render(<ToolModal visible={true} tool={tool} metadata={null} onClose={() => {}} />);
    // FileViewModalContent renders the filename
    expect(screen.getByText('foo.ts')).toBeTruthy();
});

it('routes Write tool to FileViewModalContent', () => {
    const tool = makeToolCall({ name: 'Write', input: { file_path: '/bar.json', content: '{}' } });
    render(<ToolModal visible={true} tool={tool} metadata={null} onClose={() => {}} />);
    expect(screen.getByText('bar.json')).toBeTruthy();
});

it('routes Edit tool to DiffModalContent (not FileView)', () => {
    const tool = makeToolCall({ name: 'Edit', input: { file_path: '/baz.ts', old_string: 'a', new_string: 'b' } });
    render(<ToolModal visible={true} tool={tool} metadata={null} onClose={() => {}} />);
    // DiffModalContent renders DiffHeader, not FileView's metaLabel
    expect(screen.queryByTestId('syntax-highlighter')).toBeNull();
});
```

**Step 3: Run all tool modal tests**

Run: `cd packages/happy-app && bunx vitest run sources/components/tools/modal/__tests__/`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/ToolModal.tsx packages/happy-app/sources/components/tools/modal/__tests__/ToolModal.test.tsx
git commit -m "feat(app): route Read/Write tools to FileViewModalContent in ToolModal"
```

---

## Task 4: Update `ContentPreview` for Read/Write

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/ContentPreview.tsx`

**Context:** Currently the 2-line preview in the chat bubble shows generic first-parameter content. For Read/Write, it should show the filename + language badge instead of raw content.

**Step 1: Update ContentPreview to show file-aware previews**

Add Read/Write awareness: when the tool is `Read` or `Write`, show the language detected from the file path and a line count.

```diff
+ import { languageFromPath } from '@/utils/languageFromPath';

  const previewLine = React.useMemo(() => {
+     // File-aware preview for Read/Write
+     if (tool.name === 'Read' || tool.name === 'Write') {
+         const filePath = tool.input?.file_path;
+         if (typeof filePath === 'string') {
+             const lang = languageFromPath(filePath);
+             const langLabel = lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : 'File';
+             if (tool.name === 'Read' && tool.result) {
+                 const file = (tool.result as any)?.file;
+                 if (file?.totalLines) {
+                     return `${langLabel} • ${file.totalLines} lines`;
+                 }
+             }
+             if (tool.name === 'Write' && tool.input?.content) {
+                 const lineCount = String(tool.input.content).split('\n').length;
+                 return `${langLabel} • ${lineCount} lines`;
+             }
+             return langLabel;
+         }
+     }
+
      // First try result/output ...
```

**Step 2: Run all tests**

Run: `cd packages/happy-app && bunx vitest run sources/components/tools/modal/__tests__/`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/ContentPreview.tsx
git commit -m "feat(app): show language + line count in ContentPreview for Read/Write tools"
```

---

## Task 5: Update `EditSheetContent` to handle Read/Write in permission sheet

**Files:**
- Modify: `packages/happy-app/sources/components/tools/EditSheetContent.tsx`

**Context:** The permission sheet uses `EditSheetContent` for Edit/Write/MultiEdit tools. Now that Write has its own file view component, the permission sheet should also show a file view (not diff) for Write. Additionally, Read tools don't normally trigger permissions, but if they do (e.g. reading sensitive files), they should also get the file view.

**Step 1: Add file view rendering for Write in permission sheet**

```diff
+ import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
+ import { languageFromPath } from '@/utils/languageFromPath';

  if (tool === 'Write') {
      const parsed = knownTools.Write.input.safeParse(input);
      if (!parsed.success) return null;
      const contents = typeof parsed.data.content === 'string' ? parsed.data.content : '';
+     const language = parsed.data.file_path ? languageFromPath(parsed.data.file_path) : null;

      return (
          <View style={styles.container}>
              <ScrollView ...>
-                 <ToolDiffView oldText="" newText={contents} ... />
+                 <SimpleSyntaxHighlighter code={contents} language={language} selectable />
              </ScrollView>
          </View>
      );
  }
```

**Step 2: Run tests**

Run: `cd packages/happy-app && bunx vitest run sources/components/tools/`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/happy-app/sources/components/tools/EditSheetContent.tsx
git commit -m "feat(app): use syntax-highlighted file view for Write in permission sheet"
```

---

## Task 6: Export FileViewModalContent from modal index + run full test suite

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/index.ts`

**Step 1: Add export**

```diff
+ export { FileViewModalContent } from './FileViewModalContent';
```

**Step 2: Run full test suite**

Run: `cd packages/happy-app && bunx vitest run`
Expected: PASS (no regressions)

**Step 3: Run typecheck**

Run: `cd packages/happy-app && bun typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/index.ts
git commit -m "chore(app): export FileViewModalContent from modal index"
```

---

## Summary

| Task | What | Key File |
|------|------|----------|
| 1 | `languageFromPath()` utility | `utils/languageFromPath.ts` |
| 2 | `FileViewModalContent` component | `modal/FileViewModalContent.tsx` |
| 3 | Route Read/Write in `ToolModal` | `modal/ToolModal.tsx` |
| 4 | File-aware `ContentPreview` | `modal/ContentPreview.tsx` |
| 5 | Permission sheet Write update | `EditSheetContent.tsx` |
| 6 | Export + full test suite | `modal/index.ts` |

**Routing after changes:**
- `Edit`, `MultiEdit` → `DiffModalContent` (diff viewer) ← unchanged
- `Read`, `Write` → `FileViewModalContent` (syntax-highlighted file view) ← NEW
- `Task`, `Agent` → `AgentModalContent` (3-tab modal) ← unchanged
- Everything else → `ToolModalTabs` (generic INPUT/OUTPUT) ← unchanged
