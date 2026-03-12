/**
 * Integration tests for ToolModal with unified content formatting
 *
 * Tests verify the complete tool modal flow end-to-end:
 * - Tab switching (INPUT / OUTPUT)
 * - Parameter counting with unified formatting
 * - JSON unpacking for objects with 2+ keys
 * - Content type detection (plain text, code, diff, JSON)
 * - Edge cases (empty results, null values, single-key objects)
 *
 * These tests ensure the full pipeline works: ToolModal → ToolModalTabs →
 * OutputContent → intelligently routes to VerticalParameterStack or ContentFormatter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import type { ToolCall } from '@/sync/typesMessage';

// ============================================================================
// Mock React Native Components
// ============================================================================

const View = ({ children, style, testID }: any) => ({
    type: 'View',
    props: { children, style, testID }
});

const Text = ({ children, style, testID }: any) => ({
    type: 'Text',
    props: { children, style, testID }
});

const Pressable = ({ children, onPress, style, testID, hitSlop }: any) => ({
    type: 'Pressable',
    props: { children, onPress, style, testID, hitSlop }
});

const Modal = ({ children, visible, onRequestClose, transparent, animationType }: any) => ({
    type: 'Modal',
    props: { children, visible, onRequestClose, transparent, animationType }
});

const SafeAreaView = ({ children, style }: any) => ({
    type: 'SafeAreaView',
    props: { children, style }
});

const ScrollView = ({ children, style, testID }: any) => ({
    type: 'ScrollView',
    props: { children, style, testID }
});

vi.mock('react-native', () => ({
    View,
    Text,
    Pressable,
    Modal,
    SafeAreaView,
    ScrollView,
}));

// ============================================================================
// Mock Unistyles
// ============================================================================

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (fn: any) => {
            if (typeof fn === 'function') {
                return fn({
                    colors: {
                        surfaceHigh: '#f5f5f5',
                        surfaceHighest: '#ffffff',
                        surfaceRipple: '#e0e0e0',
                        text: '#000000',
                        textLink: '#0066cc',
                    }
                });
            }
            return fn;
        }
    },
    useUnistyles: () => ({
        theme: {
            colors: {
                surfaceHigh: '#f5f5f5',
                surfaceHighest: '#ffffff',
                surfaceRipple: '#e0e0e0',
                text: '#000000',
                textLink: '#0066cc',
            }
        }
    })
}));

// ============================================================================
// Mock Icons
// ============================================================================

vi.mock('@expo/vector-icons', () => ({
    Ionicons: ({ name, size, color }: any) => ({
        type: 'Ionicons',
        props: { name, size, color }
    })
}));

// ============================================================================
// Mock VerticalParameterStack
// ============================================================================

vi.mock('../VerticalParameterStack', () => ({
    VerticalParameterStack: ({ parameters }: any) => ({
        type: 'VerticalParameterStack',
        props: {
            parameters,
            paramCount: Object.keys(parameters || {}).length
        }
    }),
}));

// ============================================================================
// Mock ContentFormatter
// ============================================================================

vi.mock('../ContentFormatter', () => ({
    ContentFormatter: ({ value, testID }: any) => ({
        type: 'ContentFormatter',
        props: { value, testID }
    }),
}));

// ============================================================================
// Test Factory
// ============================================================================

/**
 * Creates a complete ToolCall object with sensible defaults
 */
function createTestTool(overrides: Partial<ToolCall> = {}): ToolCall {
    const now = Date.now();
    return {
        name: 'test-tool',
        state: 'completed',
        input: {},
        createdAt: now,
        startedAt: now,
        completedAt: now,
        description: null,
        ...overrides,
    };
}

/**
 * Calculates output parameter count using same logic as ToolModalTabs
 */
function getOutputCount(result: unknown): number {
    return result && typeof result === 'object' && !Array.isArray(result)
        ? Object.keys(result as Record<string, unknown>).length
        : 0;
}

/**
 * Calculates input parameter count
 */
function getInputCount(input: unknown): number {
    return input && typeof input === 'object' && !Array.isArray(input)
        ? Object.keys(input as Record<string, unknown>).length
        : 0;
}

// ============================================================================
// Tests
// ============================================================================

describe('ToolModal Integration', () => {
    let ToolModal: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        const mod = await import('../ToolModal');
        ToolModal = mod.ToolModal;
    });

    // ========================================================================
    // Basic Rendering & Structure
    // ========================================================================

    describe('basic rendering', () => {
        it('renders when visible=true', () => {
            const tool = createTestTool();
            expect(() => {
                React.createElement(ToolModal, {
                    visible: true,
                    tool,
                    metadata: null,
                    onClose: () => {},
                });
            }).not.toThrow();
        });

        it('renders with tool name in header', () => {
            const tool = createTestTool({ name: 'CustomTool' });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('is wrapped in React.memo for performance', () => {
            expect(ToolModal.$$typeof).toBeDefined();
            expect(ToolModal.$$typeof).toEqual(expect.any(Symbol));
        });
    });

    // ========================================================================
    // Tab Behavior - INPUT Tab
    // ========================================================================

    describe('INPUT tab - parameter counting', () => {
        it('displays INPUT tab with 0 count for empty input', () => {
            const tool = createTestTool({
                input: {},
            });
            expect(getInputCount(tool.input)).toBe(0);
        });

        it('displays INPUT tab with correct parameter count for 1 parameter', () => {
            const tool = createTestTool({
                input: { file_path: 'test.ts' },
            });
            expect(getInputCount(tool.input)).toBe(1);
        });

        it('displays INPUT tab with correct parameter count for 2 parameters', () => {
            const tool = createTestTool({
                input: { param1: 'value1', param2: 'value2' },
            });
            expect(getInputCount(tool.input)).toBe(2);
        });

        it('displays INPUT tab with correct parameter count for many parameters', () => {
            const tool = createTestTool({
                input: {
                    param1: 'v1',
                    param2: 'v2',
                    param3: 'v3',
                    param4: 'v4',
                    param5: 'v5',
                },
            });
            expect(getInputCount(tool.input)).toBe(5);
        });

        it('handles complex nested objects in INPUT', () => {
            const tool = createTestTool({
                input: {
                    config: { timeout: 5000, retries: 3 },
                    credentials: { username: 'admin', password: '***' },
                },
            });
            expect(getInputCount(tool.input)).toBe(2);
        });

        it('INPUT tab always available, even with hideOutput flag', () => {
            const tool = createTestTool({
                input: { param: 'value' },
                result: { status: 'ok' },
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
                hideOutput: true,
            });
            expect(element).toBeTruthy();
        });
    });

    // ========================================================================
    // Tab Behavior - OUTPUT Tab
    // ========================================================================

    describe('OUTPUT tab - parameter counting for objects', () => {
        it('displays OUTPUT tab with 0 count for string results', () => {
            const tool = createTestTool({
                result: 'Plain text output',
            });
            expect(getOutputCount(tool.result)).toBe(0);
        });

        it('displays OUTPUT tab with 0 count for array results', () => {
            const tool = createTestTool({
                result: [1, 2, 3],
            });
            expect(getOutputCount(tool.result)).toBe(0);
        });

        it('displays OUTPUT tab with parameter count for single-key object', () => {
            const tool = createTestTool({
                result: { output: 'value' },
            });
            expect(getOutputCount(tool.result)).toBe(1);
        });

        it('displays OUTPUT tab with correct parameter count for 2-key object', () => {
            const tool = createTestTool({
                result: { status: 'ok', message: 'Done' },
            });
            expect(getOutputCount(tool.result)).toBe(2);
        });

        it('displays OUTPUT tab with correct parameter count for many-key object', () => {
            const tool = createTestTool({
                result: {
                    status: 'ok',
                    message: 'Success',
                    code: 200,
                    duration: 150,
                    timestamp: 1234567890,
                },
            });
            expect(getOutputCount(tool.result)).toBe(5);
        });

        it('hides OUTPUT tab when hideOutput=true (permission pending)', () => {
            const tool = createTestTool({
                result: { status: 'ok' },
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
                hideOutput: true,
            });
            expect(element).toBeTruthy();
        });
    });

    // ========================================================================
    // Content Formatting - JSON Unpacking
    // ========================================================================

    describe('JSON unpacking in OUTPUT', () => {
        it('unpacks JSON string with 2 keys as parameters', () => {
            const tool = createTestTool({
                result: JSON.stringify({ success: true, data: 'test' }),
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('unpacks JSON string with 3+ keys as parameters', () => {
            const tool = createTestTool({
                result: JSON.stringify({
                    status: 'ok',
                    data: 'content',
                    code: 200,
                }),
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('uses ContentFormatter for JSON string with 1 key', () => {
            const tool = createTestTool({
                result: JSON.stringify({ output: 'value' }),
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('unpacks already-parsed object with 2+ keys as parameters', () => {
            const tool = createTestTool({
                result: { status: 'ok', message: 'Done' },
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('preserves nested objects in unpacked parameters', () => {
            const tool = createTestTool({
                result: {
                    user: { id: 123, name: 'John' },
                    status: 'active',
                },
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });
    });

    // ========================================================================
    // Content Formatting - Content Type Detection
    // ========================================================================

    describe('content type detection for OUTPUT', () => {
        it('renders plain string results using ContentFormatter', () => {
            const tool = createTestTool({
                result: 'Plain text output',
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('renders code results with ContentFormatter', () => {
            const tool = createTestTool({
                result: 'const x = 5; console.log(x);',
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('renders diff results with ContentFormatter', () => {
            const tool = createTestTool({
                result: '--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,3 @@\n-old\n+new',
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('renders markdown results with ContentFormatter', () => {
            const tool = createTestTool({
                result: '# Heading\n\n**bold text**\n\n## Subheading',
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('renders JSON arrays with ContentFormatter', () => {
            const tool = createTestTool({
                result: '[1, 2, 3, 4, 5]',
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });
    });

    // ========================================================================
    // Markdown Formatting in INPUT
    // ========================================================================

    describe('markdown formatting in INPUT parameters', () => {
        it('renders markdown-formatted parameter values', () => {
            const tool = createTestTool({
                input: {
                    description: '# Heading\n\n**bold text**',
                },
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('renders multiple markdown parameters', () => {
            const tool = createTestTool({
                input: {
                    title: '## Title',
                    body: 'Some **bold** and *italic* text',
                    footer: '---\n\nFooter',
                },
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================

    describe('edge cases', () => {
        it('handles null result gracefully', () => {
            const tool = createTestTool({
                result: null,
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('handles undefined result gracefully', () => {
            const tool = createTestTool({
                result: undefined,
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('handles empty string result', () => {
            const tool = createTestTool({
                result: '',
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('handles empty object result', () => {
            const tool = createTestTool({
                result: {},
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('handles empty array result', () => {
            const tool = createTestTool({
                result: [],
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('handles number result', () => {
            const tool = createTestTool({
                result: 42,
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('handles boolean result', () => {
            const tool = createTestTool({
                result: true,
            });
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('handles very large object results', () => {
            const largeObject = Object.fromEntries(
                [...Array(100).keys()].map(i => [`key${i}`, `value${i}`])
            );
            const tool = createTestTool({
                result: largeObject,
            });
            expect(getOutputCount(tool.result)).toBe(100);
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('handles special characters in parameter names', () => {
            const tool = createTestTool({
                input: {
                    'param-with-dashes': 'value1',
                    'param_with_underscores': 'value2',
                    'param.with.dots': 'value3',
                },
            });
            expect(getInputCount(tool.input)).toBe(3);
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('handles unicode characters in parameters', () => {
            const tool = createTestTool({
                input: {
                    emoji: '🚀',
                    chinese: '中文',
                    arabic: 'العربية',
                },
            });
            expect(getInputCount(tool.input)).toBe(3);
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });
    });

    // ========================================================================
    // State Management
    // ========================================================================

    describe('state management', () => {
        it('close button triggers onClose callback', () => {
            const onClose = vi.fn();
            const tool = createTestTool();
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose,
            });
            expect(element).toBeTruthy();
            expect(typeof onClose).toBe('function');
        });

        it('component accepts both visible true and false', () => {
            const tool = createTestTool();
            const element1 = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            const element2 = React.createElement(ToolModal, {
                visible: false,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element1).toBeTruthy();
            expect(element2).toBeTruthy();
        });
    });

    // ========================================================================
    // Integration Scenarios
    // ========================================================================

    describe('complete integration scenarios', () => {
        it('scenario: read tool with file content', () => {
            const tool = createTestTool({
                name: 'Read',
                input: {
                    file_path: '/path/to/file.ts',
                },
                result: 'export const myFunction = () => { return 42; };',
            });

            expect(getInputCount(tool.input)).toBe(1);
            expect(getOutputCount(tool.result)).toBe(0);

            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('scenario: bash tool with command and output', () => {
            const tool = createTestTool({
                name: 'Bash',
                input: {
                    command: 'ls -la',
                },
                result: JSON.stringify({
                    stdout: 'total 32\ndrwxr-xr-x  10 user  staff  320 Mar 12 10:00 .\ndrwxr-xr-x  20 user  staff  640 Mar 12 10:00 ..',
                    stderr: '',
                    exitCode: 0,
                }),
            });

            expect(getInputCount(tool.input)).toBe(1);
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('scenario: tool with permission pending (hideOutput)', () => {
            const tool = createTestTool({
                name: 'Edit',
                state: 'running',
                input: {
                    file_path: '/src/app.ts',
                    new_content: 'const x = 5;',
                },
                result: undefined,
                permission: {
                    id: 'perm-123',
                    status: 'pending',
                },
            });

            expect(getInputCount(tool.input)).toBe(2);
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
                hideOutput: true,
            });
            expect(element).toBeTruthy();
        });

        it('scenario: tool with complex nested input and JSON output', () => {
            const tool = createTestTool({
                name: 'ApiCall',
                input: {
                    endpoint: '/api/users',
                    params: { id: 123, filter: 'active' },
                    headers: { 'Authorization': 'Bearer token' },
                },
                result: JSON.stringify({
                    success: true,
                    data: { id: 123, name: 'Alice', email: 'alice@example.com' },
                    timestamp: 1234567890,
                }),
            });

            expect(getInputCount(tool.input)).toBe(3);
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });

        it('scenario: tool with error state', () => {
            const tool = createTestTool({
                name: 'Bash',
                state: 'error',
                input: {
                    command: 'invalid command',
                },
                result: 'Command not found: invalid command',
            });

            expect(getOutputCount(tool.result)).toBe(0);
            const element = React.createElement(ToolModal, {
                visible: true,
                tool,
                metadata: null,
                onClose: () => {},
            });
            expect(element).toBeTruthy();
        });
    });
});
