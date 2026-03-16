/**
 * Unit tests for ToolBubbleHeader.
 * Verifies title formatting, subtitle visibility, icon rendering, and status display.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// --- React Native mocks (inline in factory — vi.mock is hoisted) ---
vi.mock('react-native', () => ({
    View: ({ children, testID, style }: any) => ({ type: 'View', props: { children, testID, style } }),
    Text: ({ children, style, numberOfLines, testID }: any) => ({ type: 'Text', props: { children, style, numberOfLines, testID } }),
    TouchableOpacity: ({ children, onPress, testID, style, activeOpacity }: any) => ({
        type: 'TouchableOpacity',
        props: { children, onPress, testID, style, activeOpacity },
    }),
    ActivityIndicator: ({ size, color, style }: any) => ({
        type: 'ActivityIndicator',
        props: { size, color, style },
    }),
    Platform: { select: (opts: any) => opts.default ?? opts.web },
}));

// Unistyles mock
vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (fn: any) => (typeof fn === 'function' ? fn({
            colors: {
                text: '#000',
                textSecondary: '#999',
                surfaceHighest: '#f0f0f0',
                warning: '#ff9500',
            },
        }) : fn),
    },
    useUnistyles: () => ({
        theme: {
            colors: {
                text: '#000',
                textSecondary: '#999',
                surfaceHighest: '#f0f0f0',
                warning: '#ff9500',
            },
        },
    }),
}));

// Expo vector icons mocks
vi.mock('@expo/vector-icons', () => ({
    Ionicons: ({ name, size, color }: any) => ({ type: 'Ionicons', props: { name, size, color } }),
    Octicons: ({ name, size, color }: any) => ({ type: 'Octicons', props: { name, size, color } }),
}));

// ContentPreview mock
vi.mock('@/components/tools/modal/ContentPreview', () => ({
    ContentPreview: ({ tool }: any) => ({
        type: 'ContentPreview',
        props: { tool },
    }),
}));

// useElapsedTime mock
vi.mock('@/hooks/useElapsedTime', () => ({
    useElapsedTime: () => 2.5,
}));

// parseToolUseError mock
vi.mock('@/utils/toolErrorParser', () => ({
    parseToolUseError: (result: any) => ({
        isToolUseError: typeof result === 'string' && result.includes('ToolUseError'),
        errorMessage: null,
    }),
}));

// knownTools mock
vi.mock('@/components/tools/knownTools', () => ({
    knownTools: {
        Bash: {
            title: (opts: any) => opts.tool.description || 'Terminal',
            icon: (size: number, color: string) => ({ type: 'Octicons', props: { name: 'terminal', size, color } }),
            extractSubtitle: (opts: any) => opts.tool.input?.command ?? null,
            extractStatus: () => null,
        },
        Read: {
            title: 'Read File',
            icon: (size: number, color: string) => ({ type: 'Octicons', props: { name: 'eye', size, color } }),
            extractSubtitle: (opts: any) => opts.tool.input?.file_path ?? null,
            extractStatus: () => null,
        },
    },
}));

// formatMCPTitle mock
vi.mock('@/components/tools/views/MCPToolView', () => ({
    formatMCPTitle: (name: string) => {
        const withoutPrefix = name.replace(/^mcp__/, '');
        const parts = withoutPrefix.split('__');
        if (parts.length >= 2) {
            return `${parts[0]}: ${parts.slice(1).join('_')}`;
        }
        return withoutPrefix;
    },
}));

// i18n mock
vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

import { ToolBubbleHeader } from '../modal/ToolBubbleHeader';
import { ToolCall } from '@/sync/typesMessage';

// --- Test helpers ---

function makeTool(overrides: Partial<ToolCall> = {}): ToolCall {
    return {
        name: 'Bash',
        state: 'completed',
        input: { command: 'ls -la' },
        createdAt: Date.now(),
        startedAt: Date.now(),
        completedAt: Date.now(),
        description: null,
        result: 'file1.txt\nfile2.txt',
        ...overrides,
    };
}

/**
 * Render a memo-wrapped component by calling its inner render function.
 */
function renderComponent(props: any): any {
    const memoType = (ToolBubbleHeader as any).type;
    if (memoType?.render) {
        return memoType.render(props);
    }
    return memoType(props);
}

/**
 * Recursively flatten the render tree into a list of nodes.
 * Handles both React elements (type is a function) and mock objects (type is a string).
 * Calls through function-type nodes to get their rendered output.
 */
function flattenTree(node: any, depth: number = 0): any[] {
    if (!node || typeof node !== 'object' || depth > 20) return [];
    const results: any[] = [node];

    // If this is a React element whose type is a function, call it to get rendered output
    if (typeof node.type === 'function' && node.props) {
        try {
            const rendered = node.type(node.props);
            results.push(...flattenTree(rendered, depth + 1));
        } catch {
            // Ignore render errors in traversal
        }
    }

    // Traverse children
    const children = node.props?.children;
    if (children) {
        const childArray = Array.isArray(children) ? children : [children];
        for (const child of childArray) {
            if (child && typeof child === 'object') {
                results.push(...flattenTree(child, depth + 1));
            }
        }
    }

    return results;
}

/**
 * Find nodes by their string type field (works with mock objects).
 */
function findByType(tree: any, typeName: string): any[] {
    const allNodes = flattenTree(tree);
    return allNodes.filter((n) => n?.type === typeName);
}

/**
 * Extract all text content from a rendered tree (shallow, no function calling).
 */
function extractText(node: any): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (node?.props?.children) {
        const children = Array.isArray(node.props.children)
            ? node.props.children
            : [node.props.children];
        return children.map(extractText).join('');
    }
    return '';
}

/**
 * Extract all text, calling through function-typed React elements.
 */
function deepExtractText(tree: any): string {
    const allNodes = flattenTree(tree);
    const textNodes = allNodes.filter((n) => n?.type === 'Text');
    return textNodes.map((n) => extractText(n)).join(' ');
}

// --- Tests ---

describe('ToolBubbleHeader', () => {
    describe('Title formatting', () => {
        it('renders "[Tool Name]: [description]" for known tools with subtitle', () => {
            const tool = makeTool({ name: 'Bash', input: { command: 'git status' } });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const text = extractText(rendered);
            expect(text).toContain('Terminal: git status');
        });

        it('renders tool name only when no subtitle', () => {
            const tool = makeTool({ name: 'Read', input: {} });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const text = extractText(rendered);
            expect(text).toContain('Read File');
            expect(text).not.toContain('Read File:');
        });

        it('renders MCP tool with formatted title', () => {
            const tool = makeTool({
                name: 'mcp__docker__list_containers',
                input: { all: 'true' },
            });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const text = extractText(rendered);
            expect(text).toContain('docker: list_containers');
        });

        it('uses tool.name as fallback for unknown tools', () => {
            const tool = makeTool({ name: 'SomeUnknownTool', input: {} });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const text = extractText(rendered);
            expect(text).toContain('SomeUnknownTool');
        });
    });

    describe('Subtitle (ContentPreview)', () => {
        it('shows ContentPreview when expanded=false', () => {
            const tool = makeTool();
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const previews = findByType(rendered, 'ContentPreview');
            expect(previews.length).toBeGreaterThanOrEqual(1);
        });

        it('hides ContentPreview when expanded=true', () => {
            const tool = makeTool();
            const rendered = renderComponent({ tool, metadata: null, expanded: true });

            const previews = findByType(rendered, 'ContentPreview');
            expect(previews.length).toBe(0);
        });
    });

    describe('Icon rendering', () => {
        it('renders known tool icon', () => {
            const tool = makeTool({ name: 'Bash', input: { command: 'ls' } });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const icons = findByType(rendered, 'Octicons');
            const terminalIcon = icons.find((i: any) => i.props.name === 'terminal');
            expect(terminalIcon).toBeDefined();
        });

        it('renders puzzle icon for MCP tools', () => {
            const tool = makeTool({ name: 'mcp__server__tool', input: {} });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const icons = findByType(rendered, 'Ionicons');
            const puzzleIcon = icons.find((i: any) => i.props.name === 'extension-puzzle-outline');
            expect(puzzleIcon).toBeDefined();
        });

        it('renders default construct icon for unknown tools', () => {
            const tool = makeTool({ name: 'SomeUnknownTool', input: {} });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const icons = findByType(rendered, 'Ionicons');
            const constructIcon = icons.find((i: any) => i.props.name === 'construct-outline');
            expect(constructIcon).toBeDefined();
        });
    });

    describe('Status display', () => {
        it('shows ActivityIndicator when tool is running', () => {
            const tool = makeTool({ state: 'running', completedAt: null });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const indicators = findByType(rendered, 'ActivityIndicator');
            expect(indicators.length).toBeGreaterThanOrEqual(1);
        });

        it('shows elapsed time when tool is running', () => {
            const tool = makeTool({ state: 'running', completedAt: null });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const text = deepExtractText(rendered);
            expect(text).toContain('2.5s');
        });

        it('shows error icon when tool has error', () => {
            const tool = makeTool({ state: 'error', result: 'Something went wrong' });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const icons = findByType(rendered, 'Ionicons');
            const errorIcon = icons.find((i: any) => i.props.name === 'alert-circle-outline');
            expect(errorIcon).toBeDefined();
        });

        it('shows denied icon when permission denied', () => {
            const tool = makeTool({
                state: 'completed',
                permission: { id: 'p1', status: 'denied' },
            });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const icons = findByType(rendered, 'Ionicons');
            const deniedIcon = icons.find((i: any) => i.props.name === 'remove-circle-outline');
            expect(deniedIcon).toBeDefined();
        });
    });

    describe('Press behavior', () => {
        it('wraps in TouchableOpacity when onPress provided', () => {
            const tool = makeTool();
            const onPress = vi.fn();
            const rendered = renderComponent({ tool, metadata: null, expanded: false, onPress });

            // The outer element should have onPress
            expect(rendered.props.onPress).toBe(onPress);
        });

        it('wraps in plain View when onPress not provided', () => {
            const tool = makeTool();
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            expect(rendered.props.onPress).toBeUndefined();
        });
    });

    describe('MCP tool subtitle', () => {
        it('extracts string params as key=value subtitle', () => {
            const tool = makeTool({
                name: 'mcp__docker__list_containers',
                input: { status: 'running', limit: 10 },
            });
            const rendered = renderComponent({ tool, metadata: null, expanded: false });

            const text = extractText(rendered);
            expect(text).toContain('status=running');
        });
    });
});
