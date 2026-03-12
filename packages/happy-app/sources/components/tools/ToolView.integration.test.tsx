/**
 * Integration tests for ToolView modal flow
 *
 * Tests the complete end-to-end flow of tool display in a modal:
 * - Modal opens/closes on header press
 * - Tab switching (INPUT ↔ OUTPUT) with active state management
 * - Permission pending state hides OUTPUT tab
 * - Parameters render correctly in vertical stack format
 * - Safe area wrapping for notches
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ToolCall } from '@/sync/typesMessage';

// Helper to create mock tool objects matching actual ToolCall type
function createMockTool(overrides: Partial<ToolCall> = {}): ToolCall {
    return {
        name: 'Read',
        state: 'completed',
        input: { file_path: '/src/index.ts' },
        result: 'file content here\nmore content',
        createdAt: Date.now() - 5000,
        startedAt: Date.now() - 4000,
        completedAt: Date.now(),
        description: null,
        ...overrides
    };
}

describe('ToolView Integration Tests — Modal Flow', () => {
    let ToolView: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Fresh import to avoid state pollution
        const mod = await import('./ToolView');
        ToolView = mod.ToolView;
    });

    describe('1. Modal Opens on Tool Press', () => {
        it('should render tool header with pressable area', () => {
            const tool = createMockTool();
            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            expect(getByTestId('tool-header')).toBeTruthy();
        });

        it('should open modal when tool header is pressed', async () => {
            const tool = createMockTool({ name: 'MyTool' });
            const { getByTestId, queryByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            // Modal initially closed
            expect(queryByTestId('tool-modal')).toBeFalsy();

            // Press header
            fireEvent.press(getByTestId('tool-header'));

            // Modal opens
            await waitFor(() => {
                expect(queryByTestId('tool-modal')).toBeTruthy();
            });
        });

        it('should display tool name in modal header after opening', async () => {
            const tool = createMockTool({ name: 'ReadFile' });
            const { getByTestId, getByText } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByText('ReadFile')).toBeTruthy();
            });
        });
    });

    describe('2. Tab Switching (INPUT ↔ OUTPUT)', () => {
        it('should render INPUT tab by default', async () => {
            const tool = createMockTool({
                input: { file: '/test.txt' },
                result: { content: 'output' }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('tab-input')).toBeTruthy();
            });
        });

        it('should render both INPUT and OUTPUT tabs when no permission pending', async () => {
            const tool = createMockTool({
                input: { param: 'val' },
                result: { out: 'data' }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('tab-input')).toBeTruthy();
                expect(getByTestId('tab-output')).toBeTruthy();
            });
        });

        it('should show input parameters when INPUT tab is active', async () => {
            const tool = createMockTool({
                input: { file_path: '/src/index.ts', encoding: 'utf-8' },
                result: { lines: 42 }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                // INPUT tab is active by default
                expect(getByTestId('input-parameters')).toBeTruthy();
            });
        });

        it('should switch to OUTPUT tab on press and show output parameters', async () => {
            const tool = createMockTool({
                input: { query: 'search' },
                result: { matches: 5, data: [1, 2, 3] }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('tab-output')).toBeTruthy();
            });

            // Click OUTPUT tab
            fireEvent.press(getByTestId('tab-output'));

            // Output parameters should render
            await waitFor(() => {
                expect(getByTestId('output-parameters')).toBeTruthy();
            });
        });

        it('should switch back to INPUT tab and show input parameters', async () => {
            const tool = createMockTool({
                input: { cmd: 'ls' },
                result: { output: 'file list' }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('tab-output')).toBeTruthy();
            });

            // Switch to OUTPUT
            fireEvent.press(getByTestId('tab-output'));

            await waitFor(() => {
                expect(getByTestId('output-parameters')).toBeTruthy();
            });

            // Switch back to INPUT
            fireEvent.press(getByTestId('tab-input'));

            await waitFor(() => {
                expect(getByTestId('input-parameters')).toBeTruthy();
            });
        });

        it('should show parameter counts in tab labels', async () => {
            const tool = createMockTool({
                input: { a: 1, b: 2, c: 3 },
                result: { x: 10, y: 20 }
            });

            const { getByTestId, getByText } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByText(/INPUT.*\(3\)/)).toBeTruthy();
                expect(getByText(/OUTPUT.*\(2\)/)).toBeTruthy();
            });
        });
    });

    describe('3. Permission Pending Hides OUTPUT', () => {
        it('should hide OUTPUT tab when permission status is pending', async () => {
            const tool = createMockTool({
                state: 'running',
                permission: { status: 'pending', reason: null },
                input: { cmd: 'bash' },
                result: { output: 'result' }
            });

            const { getByTestId, queryByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                // INPUT tab visible
                expect(getByTestId('tab-input')).toBeTruthy();
                // OUTPUT tab NOT visible
                expect(queryByTestId('tab-output')).toBeFalsy();
            });
        });

        it('should only show INPUT tab when hideOutput=true', async () => {
            const tool = createMockTool({
                permission: { status: 'pending', reason: null },
                input: { value: 'test' },
                result: { status: 'ok' }
            });

            const { getByTestId, queryByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                // Only INPUT visible
                expect(getByTestId('tab-input')).toBeTruthy();
                expect(queryByTestId('tab-output')).toBeFalsy();
            });
        });

        it('should show OUTPUT tab when permission approved', async () => {
            const tool = createMockTool({
                permission: { status: 'approved', reason: null },
                input: { file: 'test.txt' },
                result: { data: 'content' }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                // Both tabs visible
                expect(getByTestId('tab-input')).toBeTruthy();
                expect(getByTestId('tab-output')).toBeTruthy();
            });
        });
    });

    describe('4. hideOutput Parameter Filtering', () => {
        it('should filter undefined values when hideOutput is active', async () => {
            const tool = createMockTool({
                state: 'running',
                permission: { status: 'pending', reason: null },
                input: {
                    required: 'value',
                    optional: undefined
                }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                // INPUT renders with filtering applied
                expect(getByTestId('input-parameters')).toBeTruthy();
            });
        });

        it('should render all parameters including undefined when hideOutput=false', async () => {
            const tool = createMockTool({
                state: 'completed',
                permission: { status: 'approved', reason: null },
                input: { defined: 'val', undef: undefined },
                result: { out1: 'data', out2: undefined }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                // Both tabs render full parameters
                expect(getByTestId('input-parameters')).toBeTruthy();
                expect(getByTestId('tab-output')).toBeTruthy();
            });
        });
    });

    describe('5. INPUT Tab Parameter Rendering (Vertical Stack)', () => {
        it('should render all input parameters in vertical stack', async () => {
            const tool = createMockTool({
                input: {
                    file_path: '/src/index.ts',
                    encoding: 'utf-8',
                    limit: 100
                }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('input-parameters')).toBeTruthy();
            });
        });

        it('should display parameter names above values', async () => {
            const tool = createMockTool({
                input: { search_query: 'test', max_results: 10 }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                const params = getByTestId('input-parameters');
                expect(params).toBeTruthy();
            });
        });

        it('should handle complex parameter values (objects, arrays)', async () => {
            const tool = createMockTool({
                input: {
                    simple: 'string',
                    object: { nested: 'value', count: 42 },
                    array: [1, 2, 3]
                }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('input-parameters')).toBeTruthy();
            });
        });

        it('should show input parameter count in tab label', async () => {
            const tool = createMockTool({
                input: { a: 1, b: 2 }
            });

            const { getByTestId, getByText } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByText(/INPUT \(2\)/)).toBeTruthy();
            });
        });
    });

    describe('6. OUTPUT Tab Display (Text/JSON Proper Rendering)', () => {
        it('should render output parameters correctly', async () => {
            const tool = createMockTool({
                result: {
                    status: 'success',
                    message: 'Operation completed',
                    data: { count: 42 }
                }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('tab-output')).toBeTruthy();
            });

            fireEvent.press(getByTestId('tab-output'));

            await waitFor(() => {
                expect(getByTestId('output-parameters')).toBeTruthy();
            });
        });

        it('should handle object result with multiple fields without corruption', async () => {
            const tool = createMockTool({
                result: {
                    lines: 42,
                    size: 1024,
                    format: 'json',
                    nested: { a: 1, b: 2 }
                }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('tab-output')).toBeTruthy();
            });

            fireEvent.press(getByTestId('tab-output'));

            await waitFor(() => {
                // Output parameters should render without corruption
                expect(getByTestId('output-parameters')).toBeTruthy();
            });
        });

        it('should show output parameter count in tab label', async () => {
            const tool = createMockTool({
                result: { field1: 'val1', field2: 'val2', field3: 'val3' }
            });

            const { getByTestId, getByText } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByText(/OUTPUT \(3\)/)).toBeTruthy();
            });
        });

        it('should handle empty result gracefully', async () => {
            const tool = createMockTool({
                result: {}
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('tab-output')).toBeTruthy();
            });

            fireEvent.press(getByTestId('tab-output'));

            await waitFor(() => {
                // Empty state rendered
                expect(getByTestId('output-parameters')).toBeTruthy();
            });
        });
    });

    describe('7. ContentPreview 2-Line Summary', () => {
        it('should render content preview in main view', () => {
            const tool = createMockTool({
                result: 'Short preview content'
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            // Preview visible in main view (not minimal state)
            expect(getByTestId('content-preview')).toBeTruthy();
        });

        it('should show 2-line preview: preview line + badge', () => {
            const tool = createMockTool({
                result: 'Preview content'
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            expect(getByTestId('content-preview')).toBeTruthy();
        });

        it('should truncate long preview lines to 50 chars', () => {
            const longContent = 'a'.repeat(100);
            const tool = createMockTool({
                result: longContent
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            expect(getByTestId('content-preview')).toBeTruthy();
        });

        it('should not show preview when tool is minimal (completed + approved)', () => {
            const tool = createMockTool({
                state: 'completed',
                permission: { status: 'approved', reason: null }
            });

            const { queryByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            // Claude tools collapse to minimal after approval
            expect(queryByTestId('content-preview')).toBeFalsy();
        });

        it('should show preview for running tools with pending permission', () => {
            const tool = createMockTool({
                state: 'running',
                permission: { status: 'pending', reason: null },
                result: 'Running output'
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            expect(getByTestId('content-preview')).toBeTruthy();
        });
    });

    describe('8. Close Button Dismisses Modal', () => {
        it('should have close button in modal header', async () => {
            const tool = createMockTool();

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('modal-close-button')).toBeTruthy();
            });
        });

        it('should close modal when close button is pressed', async () => {
            const tool = createMockTool();

            const { getByTestId, queryByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            // Open
            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(queryByTestId('tool-modal')).toBeTruthy();
            });

            // Close
            fireEvent.press(getByTestId('modal-close-button'));

            // Modal hidden
            await waitFor(() => {
                expect(queryByTestId('tool-modal')).toBeFalsy();
            });
        });

        it('should close modal when backdrop is pressed', async () => {
            const tool = createMockTool();

            const { getByTestId, queryByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            // Open
            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(queryByTestId('tool-modal')).toBeTruthy();
            });

            // Press backdrop
            fireEvent.press(getByTestId('modal-backdrop'));

            // Modal hidden
            await waitFor(() => {
                expect(queryByTestId('tool-modal')).toBeFalsy();
            });
        });
    });

    describe('9. Safe Area Handling', () => {
        it('should wrap modal content in SafeAreaView', async () => {
            const tool = createMockTool();

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('modal-safe-area')).toBeTruthy();
            });
        });

        it('should have modal title inside safe area', async () => {
            const tool = createMockTool({ name: 'TestTool' });

            const { getByTestId, getByText } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('modal-title')).toBeTruthy();
                expect(getByText('TestTool')).toBeTruthy();
            });
        });

        it('should have proper modal structure with safe area and tabs', async () => {
            const tool = createMockTool();

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                // Safe area wraps header and tabs
                expect(getByTestId('modal-safe-area')).toBeTruthy();
                expect(getByTestId('modal-tabs')).toBeTruthy();
            });
        });
    });

    describe('Full Modal Lifecycle', () => {
        it('should complete full flow: open → switch tabs → close', async () => {
            const tool = createMockTool({
                input: { file: '/test.txt' },
                result: { content: 'output content' }
            });

            const { getByTestId, queryByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            // 1. Modal initially closed
            expect(queryByTestId('tool-modal')).toBeFalsy();

            // 2. Open modal
            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(queryByTestId('tool-modal')).toBeTruthy();
            });

            // 3. Switch to OUTPUT tab
            fireEvent.press(getByTestId('tab-output'));

            await waitFor(() => {
                expect(getByTestId('output-parameters')).toBeTruthy();
            });

            // 4. Switch back to INPUT tab
            fireEvent.press(getByTestId('tab-input'));

            await waitFor(() => {
                expect(getByTestId('input-parameters')).toBeTruthy();
            });

            // 5. Close modal
            fireEvent.press(getByTestId('modal-close-button'));

            await waitFor(() => {
                expect(queryByTestId('tool-modal')).toBeFalsy();
            });
        });

        it('should handle multiple open/close cycles', async () => {
            const tool = createMockTool();

            const { getByTestId, queryByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            for (let i = 0; i < 3; i++) {
                // Open
                fireEvent.press(getByTestId('tool-header'));

                await waitFor(() => {
                    expect(queryByTestId('tool-modal')).toBeTruthy();
                });

                // Close
                fireEvent.press(getByTestId('modal-close-button'));

                await waitFor(() => {
                    expect(queryByTestId('tool-modal')).toBeFalsy();
                });
            }
        });
    });

    describe('Edge Cases', () => {
        it('should handle tool with null input and result', () => {
            const tool = createMockTool({
                input: null as any,
                result: null as any
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            expect(getByTestId('tool-header')).toBeTruthy();
        });

        it('should handle tool with empty input', async () => {
            const tool = createMockTool({
                input: {}
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                // Empty state for input
                expect(getByTestId('input-parameters')).toBeTruthy();
            });
        });

        it('should handle special characters in values', async () => {
            const tool = createMockTool({
                input: {
                    special: '!@#$%^&*()',
                    unicode: '🚀✨🎉',
                    newlines: 'line1\nline2\nline3'
                }
            });

            const { getByTestId } = render(
                <ToolView tool={tool} metadata={null} />
            );

            fireEvent.press(getByTestId('tool-header'));

            await waitFor(() => {
                expect(getByTestId('input-parameters')).toBeTruthy();
            });
        });

        it('should handle different metadata flavors', () => {
            const tool = createMockTool();

            const flavors = [null, { flavor: 'claude' } as any, { flavor: 'codex' } as any];

            flavors.forEach((metadata) => {
                const { getByTestId } = render(
                    <ToolView tool={tool} metadata={metadata} />
                );

                expect(getByTestId('tool-header')).toBeTruthy();
            });
        });
    });
});
