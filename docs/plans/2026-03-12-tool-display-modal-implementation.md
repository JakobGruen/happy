# Tool Display Modal Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Replace inline tool expansion in chat with a bottom-sheet modal showing INPUT/OUTPUT tabs in vertical stack layout.

**Architecture:** 
- Remove expand/collapse logic from ToolView
- Create new ToolModal (bottom sheet) with tab navigation
- Build VerticalParameterStack to render name/value pairs
- Adapt VariableFormatter for single-column vertical layout
- Modify ToolView to show static 2-line preview with modal trigger

**Tech Stack:** React Native, Expo Router, Unistyles, existing bottom sheet library

---

## Task 1: Create VerticalParameterStack Component

**Files:**
- Create: `packages/happy-app/sources/components/tools/modal/VerticalParameterStack.tsx`

**Step 1: Write the component skeleton**

```typescript
import React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { VariableFormatter } from '../adaptive/VariableFormatter';

interface VerticalParameterStackProps {
    parameters: Record<string, any>;
    hideOutput?: boolean; // For permission pending state
}

export const VerticalParameterStack = React.memo<VerticalParameterStackProps>(
    ({ parameters, hideOutput }) => {
        const { theme } = useUnistyles();

        const entries = Object.entries(parameters || {}).filter(
            ([key, value]) => !(hideOutput && value === undefined)
        );

        if (entries.length === 0) {
            return (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No parameters</Text>
                </View>
            );
        }

        return (
            <View style={styles.container}>
                {entries.map(([key, value], idx) => (
                    <View key={`${key}-${idx}`} style={styles.parameterGroup}>
                        <Text style={styles.parameterName}>{key}</Text>
                        <VariableFormatter
                            name={key}
                            value={value}
                            isVertical={true}
                        />
                    </View>
                ))}
            </View>
        );
    }
);

const styles = StyleSheet.create((theme) => ({
    container: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    parameterGroup: {
        marginBottom: 12,
    },
    parameterName: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.textSecondary,
        marginBottom: 4,
    },
    emptyContainer: {
        paddingHorizontal: 12,
        paddingVertical: 16,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
    },
}));
```

**Step 2: Create tests directory and test file**

```bash
mkdir -p packages/happy-app/sources/components/tools/modal/__tests__
touch packages/happy-app/sources/components/tools/modal/__tests__/VerticalParameterStack.test.tsx
```

**Step 3: Write basic test**

```typescript
import { render } from '@testing-library/react-native';
import { VerticalParameterStack } from '../VerticalParameterStack';

describe('VerticalParameterStack', () => {
    it('renders parameter groups with name and value', () => {
        const params = {
            file_path: 'src/index.ts',
            count: 5,
        };
        const { getByText } = render(<VerticalParameterStack parameters={params} />);
        
        expect(getByText('file_path')).toBeTruthy();
        expect(getByText('src/index.ts')).toBeTruthy();
    });

    it('renders empty state when no parameters', () => {
        const { getByText } = render(<VerticalParameterStack parameters={{}} />);
        expect(getByText('No parameters')).toBeTruthy();
    });
});
```

**Step 4: Run tests**

```bash
cd packages/happy-app && yarn test VerticalParameterStack.test.tsx
```

Expected: PASS

**Step 5: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/VerticalParameterStack.tsx
git add packages/happy-app/sources/components/tools/modal/__tests__/VerticalParameterStack.test.tsx
git commit -m "feat(tools): add VerticalParameterStack component for modal tab display"
```

---

## Task 2: Adapt VariableFormatter for Vertical Layout

**Files:**
- Modify: `packages/happy-app/sources/components/tools/adaptive/VariableFormatter.tsx`

**Step 1: Read current VariableFormatter implementation**

```bash
head -100 packages/happy-app/sources/components/tools/adaptive/VariableFormatter.tsx
```

**Step 2: Add `isVertical` prop to component**

Update the component signature:

```typescript
interface VariableFormatterProps {
    name: string;
    value: any;
    isVertical?: boolean; // NEW: vertical layout mode
}

export const VariableFormatter = React.memo<VariableFormatterProps>(
    ({ name, value, isVertical = false }) => {
        // ... existing logic
    }
);
```

**Step 3: Update layout logic for vertical mode**

In the render section, when `isVertical=true`:
- Remove grid layout logic
- Display value below the name (already handled by parent VerticalParameterStack)
- For nested JSON: show as code block with full width
- For simple values: show inline below name

```typescript
if (isVertical) {
    return (
        <View style={styles.verticalValue}>
            {renderValueContent()}
        </View>
    );
}
```

**Step 4: Add vertical styles**

```typescript
const styles = StyleSheet.create((theme) => ({
    // ... existing styles
    verticalValue: {
        marginLeft: 0,
        paddingLeft: 0,
    },
    verticalCodeBlock: {
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 4,
        padding: 8,
        marginTop: 4,
    },
}));
```

**Step 5: Update tests**

```bash
# Add test for vertical mode
# In packages/happy-app/sources/components/tools/adaptive/__tests__/VariableFormatter.test.tsx
```

Add test case:

```typescript
it('renders in vertical mode without grid', () => {
    const { getByText, queryByTestId } = render(
        <VariableFormatter name="data" value={{ id: 1 }} isVertical={true} />
    );
    
    expect(getByText('data')).toBeTruthy();
    // Verify code block is rendered, not grid
});
```

**Step 6: Run tests**

```bash
cd packages/happy-app && yarn test VariableFormatter
```

Expected: All tests PASS

**Step 7: Commit**

```bash
git add packages/happy-app/sources/components/tools/adaptive/VariableFormatter.tsx
git commit -m "feat(tools): add vertical layout mode to VariableFormatter"
```

---

## Task 3: Create ToolModalTabs Component

**Files:**
- Create: `packages/happy-app/sources/components/tools/modal/ToolModalTabs.tsx`

**Step 1: Write tabs component**

```typescript
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall } from '@/sync/typesMessage';
import { VerticalParameterStack } from './VerticalParameterStack';

interface ToolModalTabsProps {
    tool: ToolCall;
    hideOutput?: boolean; // Show INPUT only (permission pending)
}

type TabType = 'input' | 'output';

export const ToolModalTabs = React.memo<ToolModalTabsProps>(
    ({ tool, hideOutput }) => {
        const { theme } = useUnistyles();
        const [activeTab, setActiveTab] = React.useState<TabType>('input');

        const inputCount = tool.input ? Object.keys(tool.input).length : 0;
        const outputCount = tool.result ? Object.keys(tool.result).length : 0;

        return (
            <View style={styles.container}>
                {/* Tab Headers */}
                <View style={styles.tabHeader}>
                    <Pressable
                        style={[
                            styles.tabButton,
                            activeTab === 'input' && styles.tabButtonActive,
                        ]}
                        onPress={() => setActiveTab('input')}
                    >
                        <Text style={styles.tabLabel}>
                            INPUT{inputCount > 0 ? ` (${inputCount})` : ''}
                        </Text>
                    </Pressable>

                    {!hideOutput && (
                        <Pressable
                            style={[
                                styles.tabButton,
                                activeTab === 'output' && styles.tabButtonActive,
                            ]}
                            onPress={() => setActiveTab('output')}
                        >
                            <Text style={styles.tabLabel}>
                                OUTPUT{outputCount > 0 ? ` (${outputCount})` : ''}
                            </Text>
                        </Pressable>
                    )}
                </View>

                {/* Tab Content */}
                <View style={styles.tabContent}>
                    {activeTab === 'input' && (
                        <VerticalParameterStack parameters={tool.input} />
                    )}
                    {activeTab === 'output' && !hideOutput && (
                        <VerticalParameterStack parameters={tool.result} />
                    )}
                </View>
            </View>
        );
    }
);

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surfaceHigh,
    },
    tabHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceHighest,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    tabButtonActive: {
        borderBottomWidth: 2,
        borderBottomColor: theme.colors.textLink,
    },
    tabLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
    },
    tabContent: {
        flex: 1,
        paddingVertical: 8,
    },
}));
```

**Step 2: Write test**

```typescript
import { render } from '@testing-library/react-native';
import { ToolModalTabs } from '../ToolModalTabs';
import { ToolCall } from '@/sync/typesMessage';

describe('ToolModalTabs', () => {
    const mockTool: ToolCall = {
        name: 'Read',
        input: { file_path: 'index.ts' },
        result: { content: 'file content here' },
        state: 'completed',
        createdAt: Date.now(),
    };

    it('renders both INPUT and OUTPUT tabs', () => {
        const { getByText } = render(<ToolModalTabs tool={mockTool} />);
        expect(getByText(/INPUT/)).toBeTruthy();
        expect(getByText(/OUTPUT/)).toBeTruthy();
    });

    it('hides OUTPUT tab when hideOutput=true', () => {
        const { queryByText } = render(
            <ToolModalTabs tool={mockTool} hideOutput={true} />
        );
        expect(queryByText(/OUTPUT/)).toBeFalsy();
    });
});
```

**Step 3: Run test**

```bash
cd packages/happy-app && yarn test ToolModalTabs.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/ToolModalTabs.tsx
git commit -m "feat(tools): add ToolModalTabs component with INPUT/OUTPUT switching"
```

---

## Task 4: Create ToolModal Bottom Sheet Component

**Files:**
- Create: `packages/happy-app/sources/components/tools/modal/ToolModal.tsx`

**Step 1: Check for existing bottom sheet library**

```bash
# Check what's already imported in the app
grep -r "BottomSheet\|bottom.sheet" packages/happy-app/sources --include="*.tsx" --include="*.ts" | head -10
```

**Step 2: Write ToolModal wrapper**

Assuming the app uses Expo's modal or a custom bottom sheet:

```typescript
import React from 'react';
import { View, Modal, Pressable, SafeAreaView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall } from '@/sync/typesMessage';
import { ToolModalTabs } from './ToolModalTabs';
import { Ionicons } from '@expo/vector-icons';
import { Metadata } from '@/sync/storageTypes';

interface ToolModalProps {
    visible: boolean;
    tool: ToolCall;
    metadata: Metadata | null;
    onClose: () => void;
    hideOutput?: boolean;
}

export const ToolModal = React.memo<ToolModalProps>(
    ({ visible, tool, metadata, onClose, hideOutput }) => {
        const { theme } = useUnistyles();

        return (
            <Modal
                visible={visible}
                animationType="slide"
                transparent={true}
                onRequestClose={onClose}
            >
                <Pressable
                    style={styles.backdrop}
                    onPress={onClose}
                    activeOpacity={0.3}
                />
                <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.surfaceHigh }]}>
                    {/* Modal Header */}
                    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.toolName}>{tool.name}</Text>
                        </View>
                        <Pressable onPress={onClose} hitSlop={8}>
                            <Ionicons name="close" size={24} color={theme.colors.text} />
                        </Pressable>
                    </View>

                    {/* Tabs */}
                    <ToolModalTabs tool={tool} hideOutput={hideOutput} />
                </SafeAreaView>
            </Modal>
        );
    }
);

const styles = StyleSheet.create((theme) => ({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    container: {
        flex: 1,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    toolName: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
    },
}));
```

**Step 2: Write test**

```typescript
import { render } from '@testing-library/react-native';
import { ToolModal } from '../ToolModal';

describe('ToolModal', () => {
    const mockTool = {
        name: 'Read',
        input: { file_path: 'test.ts' },
        result: { content: '...' },
        state: 'completed',
        createdAt: Date.now(),
    };

    it('renders when visible=true', () => {
        const { getByText } = render(
            <ToolModal
                visible={true}
                tool={mockTool}
                metadata={null}
                onClose={() => {}}
            />
        );
        expect(getByText('Read')).toBeTruthy();
    });

    it('does not render when visible=false', () => {
        const { queryByText } = render(
            <ToolModal
                visible={false}
                tool={mockTool}
                metadata={null}
                onClose={() => {}}
            />
        );
        expect(queryByText('Read')).toBeFalsy();
    });
});
```

**Step 3: Run test**

```bash
cd packages/happy-app && yarn test ToolModal.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/ToolModal.tsx
git commit -m "feat(tools): add ToolModal bottom sheet wrapper"
```

---

## Task 5: Create ContentPreview Component (2-Line Preview)

**Files:**
- Create: `packages/happy-app/sources/components/tools/modal/ContentPreview.tsx`

**Step 1: Write preview component**

```typescript
import React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall } from '@/sync/typesMessage';
import { contentAnalyzer } from '../adaptive/contentAnalyzer';

interface ContentPreviewProps {
    tool: ToolCall;
}

export const ContentPreview = React.memo<ContentPreviewProps>(({ tool }) => {
    const { theme } = useUnistyles();

    // Get first line of output or first parameter
    const previewLine = React.useMemo(() => {
        // First try output/result
        if (tool.result && typeof tool.result === 'string') {
            const firstLine = tool.result.split('\n')[0];
            return firstLine.substring(0, 50) + (firstLine.length > 50 ? '…' : '');
        }

        // Then try first input parameter
        if (tool.input && typeof tool.input === 'object') {
            const values = Object.values(tool.input);
            if (values.length > 0 && typeof values[0] === 'string') {
                const firstVal = String(values[0]);
                return firstVal.substring(0, 50) + (firstVal.length > 50 ? '…' : '');
            }
        }

        // Fallback
        return '–';
    }, [tool.result, tool.input]);

    // Analyze content to get type badge
    const analysis = React.useMemo(() => {
        if (tool.result) {
            return contentAnalyzer(tool.result);
        }
        return null;
    }, [tool.result]);

    const badge = React.useMemo(() => {
        if (!analysis) return null;
        const sizeKB = (analysis.size / 1024).toFixed(1);
        return `${analysis.type.toUpperCase()} • ${sizeKB}KB`;
    }, [analysis]);

    return (
        <View>
            <Text style={styles.previewLine} numberOfLines={1}>
                {previewLine}
            </Text>
            {badge && (
                <Text style={styles.badge} numberOfLines={1}>
                    {badge}
                </Text>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    previewLine: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    badge: {
        fontSize: 12,
        color: theme.colors.textTertiary,
        marginTop: 1,
    },
}));
```

**Step 2: Test**

```typescript
import { render } from '@testing-library/react-native';
import { ContentPreview } from '../ContentPreview';

describe('ContentPreview', () => {
    it('shows first line of result', () => {
        const tool = {
            name: 'Read',
            result: 'Line 1\nLine 2\nLine 3',
            state: 'completed',
            createdAt: Date.now(),
        };
        const { getByText } = render(<ContentPreview tool={tool as any} />);
        expect(getByText('Line 1')).toBeTruthy();
    });

    it('truncates long lines', () => {
        const longString = 'a'.repeat(100);
        const tool = {
            name: 'Read',
            result: longString,
            state: 'completed',
            createdAt: Date.now(),
        };
        const { getByText } = render(<ContentPreview tool={tool as any} />);
        const text = getByText((_, node) => node?.children.join('').includes('…'));
        expect(text).toBeTruthy();
    });
});
```

**Step 3: Run test**

```bash
cd packages/happy-app && yarn test ContentPreview.test.tsx
```

Expected: PASS

**Step 4: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/ContentPreview.tsx
git commit -m "feat(tools): add ContentPreview component for 2-line chat preview"
```

---

## Task 6: Modify ToolView to Use Modal

**Files:**
- Modify: `packages/happy-app/sources/components/tools/ToolView.tsx`

**Step 1: Read the file to understand current structure**

```bash
head -50 packages/happy-app/sources/components/tools/ToolView.tsx
```

**Step 2: Import new components**

Add imports at the top:

```typescript
import { ToolModal } from './modal/ToolModal';
import { ContentPreview } from './modal/ContentPreview';
import { useState } from 'react';
```

**Step 3: Remove old expansion logic**

Find and remove:
```typescript
// REMOVE: const [isContentExpanded, setIsContentExpanded] = React.useState(...);
// REMOVE: React.useEffect(() => { ... }, [isInPermissionModal]);
// REMOVE: hasCollapsibleContent logic
```

**Step 4: Add modal state**

```typescript
const [isModalVisible, setIsModalVisible] = React.useState(false);
```

**Step 5: Replace content section**

In the JSX where `isContentExpanded` renders content, replace with:

```typescript
{/* 2-Line Preview (static, always visible) */}
{!minimal && (
    <View style={styles.previewContainer}>
        <ContentPreview tool={tool} />
    </View>
)}

{/* Modal (opens on preview tap) */}
<ToolModal
    visible={isModalVisible}
    tool={tool}
    metadata={props.metadata}
    onClose={() => setIsModalVisible(false)}
    hideOutput={tool.permission?.status === 'pending'}
/>
```

**Step 6: Remove chevron button**

Find and remove the collapse button from header:
```typescript
// REMOVE: {hasCollapsibleContent && (
//     <Pressable onPress={() => ...}>
```

**Step 7: Update header onPress to open modal**

```typescript
const handlePress = React.useCallback(() => {
    setIsModalVisible(true); // NEW: open modal on tap
}, []);
```

**Step 8: Add styles for preview**

```typescript
const styles = StyleSheet.create((theme) => ({
    // ... existing styles
    previewContainer: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
}));
```

**Step 9: Test the change**

Run the app:
```bash
yarn workspace happy-app start
```

Verify:
- Tools show 2-line preview in chat
- Tapping tool header opens modal
- Modal shows INPUT/OUTPUT tabs
- Modal closes on backdrop tap

**Step 10: Commit**

```bash
git add packages/happy-app/sources/components/tools/ToolView.tsx
git commit -m "feat(tools): replace inline expansion with modal trigger"
```

---

## Task 7: Remove Old Adaptive Components (Cleanup)

**Files:**
- Delete: `packages/happy-app/sources/components/tools/adaptive/ToolIOTabs.tsx`
- Delete: `packages/happy-app/sources/components/tools/adaptive/AdaptiveToolDisplay.tsx`
- Delete: `packages/happy-app/sources/components/tools/adaptive/ContentPreview.tsx` (old version)
- Delete: `packages/happy-app/sources/components/tools/adaptive/` tests

**Step 1: Verify no other files import these components**

```bash
grep -r "ToolIOTabs\|AdaptiveToolDisplay" packages/happy-app/sources --include="*.tsx" --include="*.ts" | grep -v "adaptive/"
```

Expected: No results (only imports within adaptive/)

**Step 2: Remove files**

```bash
rm packages/happy-app/sources/components/tools/adaptive/ToolIOTabs.tsx
rm packages/happy-app/sources/components/tools/adaptive/AdaptiveToolDisplay.tsx
rm -rf packages/happy-app/sources/components/tools/adaptive/__tests__
```

**Step 3: Update adaptive/index.ts exports (if any)**

```bash
# Check what's exported
cat packages/happy-app/sources/components/tools/adaptive/index.ts
```

If ToolIOTabs or AdaptiveToolDisplay are exported, remove those lines.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(tools): remove old adaptive components, migrated to modal"
```

---

## Task 8: Integration Test — Full Modal Flow

**Files:**
- Create: `packages/happy-app/sources/components/tools/modal/__tests__/integration.test.tsx`

**Step 1: Write integration test**

```typescript
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ToolView } from '../ToolView';
import { ToolCall } from '@/sync/typesMessage';

describe('Tool Modal Integration', () => {
    const mockTool: ToolCall = {
        name: 'Read',
        input: { file_path: 'src/index.ts', offset: [0, 10] },
        result: { content: 'export const foo = () => {}' },
        state: 'completed',
        createdAt: Date.now(),
    };

    it('opens modal when tapping tool preview', async () => {
        const { getByText, getByTestId } = render(
            <ToolView tool={mockTool} metadata={null} />
        );

        // Should show preview
        expect(getByText(/src\/index.ts/)).toBeTruthy();

        // Tap tool header to open modal
        const toolHeader = getByTestId('tool-header');
        fireEvent.press(toolHeader);

        // Modal should appear with tabs
        await waitFor(() => {
            expect(getByText(/INPUT/)).toBeTruthy();
            expect(getByText(/OUTPUT/)).toBeTruthy();
        });
    });

    it('shows INPUT tab with parameters', async () => {
        const { getByText, getByTestId } = render(
            <ToolView tool={mockTool} metadata={null} />
        );

        fireEvent.press(getByTestId('tool-header'));

        await waitFor(() => {
            expect(getByText('file_path')).toBeTruthy();
            expect(getByText('src/index.ts')).toBeTruthy();
        });
    });

    it('shows OUTPUT tab when switching', async () => {
        const { getByText, getByTestId } = render(
            <ToolView tool={mockTool} metadata={null} />
        );

        fireEvent.press(getByTestId('tool-header'));

        await waitFor(() => {
            const outputTab = getByText(/OUTPUT/);
            fireEvent.press(outputTab);
            expect(getByText('content')).toBeTruthy();
        });
    });

    it('hides OUTPUT when permission pending', async () => {
        const toolWithPermission = {
            ...mockTool,
            permission: { status: 'pending' },
        };

        const { queryByText, getByTestId } = render(
            <ToolView tool={toolWithPermission} metadata={null} />
        );

        fireEvent.press(getByTestId('tool-header'));

        await waitFor(() => {
            expect(queryByText(/OUTPUT/)).toBeFalsy();
        });
    });
});
```

**Step 2: Run test**

```bash
cd packages/happy-app && yarn test integration.test.tsx
```

Expected: All tests PASS

**Step 3: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/__tests__/integration.test.tsx
git commit -m "test(tools): add integration tests for tool modal flow"
```

---

## Task 9: Manual Testing & Polish

**Files:**
- Test: Various tool types (Read, Write, Edit, Bash, MCP tools)
- Test: Different screen sizes (mobile, tablet)
- Test: Permission states (pending, approved, denied)

**Step 1: Test on device/simulator**

```bash
yarn workspace happy-app ios
# or
yarn workspace happy-app android
```

**Step 2: Test cases**

- [ ] Tool with simple string output → shows in preview
- [ ] Tool with large JSON → shows code block in OUTPUT tab
- [ ] Tool with no output → shows "–" in preview
- [ ] Tool with permission pending → modal shows INPUT only
- [ ] Tool with permission approved → modal shows both tabs
- [ ] Swipe down on modal → closes modal
- [ ] Tap backdrop → closes modal
- [ ] Scroll within tab → independent scroll
- [ ] Long parameter names → truncated nicely
- [ ] Small screen (mobile) → responsive layout
- [ ] Large screen (tablet) → proper spacing

**Step 3: Fix any issues found**

Document and create targeted commits for each fix.

**Step 4: Final commit**

```bash
git add -A
git commit -m "test(tools): manual QA and polish for tool modal"
```

---

## Task 10: Update App Type Checking

**Files:**
- Verify: `packages/happy-app/sources/components/tools/modal/index.ts`

**Step 1: Create barrel export**

```typescript
export { ToolModal } from './ToolModal';
export { ToolModalTabs } from './ToolModalTabs';
export { VerticalParameterStack } from './VerticalParameterStack';
export { ContentPreview } from './ContentPreview';
```

**Step 2: Run typecheck**

```bash
cd packages/happy-app && yarn typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/index.ts
git commit -m "chore(tools): add barrel exports for modal components"
```

---

## Task 11: Create Summary & Document Changes

**Files:**
- Create: `docs/MIGRATION_TOOL_DISPLAY.md`

**Step 1: Write migration guide**

```markdown
# Tool Display Migration Guide

## Changes Summary

### Before
- Tools expanded inline in chat with full INPUT/OUTPUT tabs visible
- Collapse/expand button toggled visibility
- Took up significant vertical space
- Hard to scan multiple tools at once

### After
- Tools show 2-line static preview in chat (title + first line of output)
- Full details in bottom-sheet modal (opens on tap)
- Compact chat view with cleaner visual hierarchy
- Consistent vertical stack layout for all parameters

## Component Changes

**New components:**
- `ToolModal.tsx` - Bottom sheet container
- `ToolModalTabs.tsx` - Tab navigation (INPUT/OUTPUT)
- `VerticalParameterStack.tsx` - Vertical parameter display
- `ContentPreview.tsx` - 2-line preview in chat

**Removed components:**
- `ToolIOTabs.tsx` - Old multi-column grid tabs
- `AdaptiveToolDisplay.tsx` - Old inline display logic
- `adaptive/ContentPreview.tsx` - Old preview logic (moved to modal/)

**Modified components:**
- `ToolView.tsx` - Removed expand logic, added modal trigger
- `VariableFormatter.tsx` - Added vertical mode support

## Migration for Tool-Specific Views

If you've created custom tool views:
1. They still work — modal only affects fallback display
2. Custom views still show inline for now (future: migrate to modal)
3. No changes needed unless you want to use modal layout

## Testing

All tool types tested:
- System tools (Read, Write, Edit, Bash)
- MCP tools (all types)
- Custom tools (Codex, Gemini variants)
- Permission flows (pending, approved, denied)
```

**Step 2: Commit**

```bash
git add docs/MIGRATION_TOOL_DISPLAY.md
git commit -m "docs: add tool display migration guide"
```

---

## Summary

**Total Tasks**: 11  
**Estimated Time**: 4-6 hours (with testing)  
**Key Commits**: 11 (one per task)

**Implementation Order**:
1. ✅ VerticalParameterStack (foundation)
2. ✅ VariableFormatter adaptation (vertical support)
3. ✅ ToolModalTabs (tab logic)
4. ✅ ToolModal (bottom sheet wrapper)
5. ✅ ContentPreview (2-line preview)
6. ✅ ToolView modifications (integration)
7. ✅ Cleanup old components
8. ✅ Integration tests
9. ✅ Manual testing & polish
10. ✅ Type checking
11. ✅ Documentation

**Testing Strategy**:
- Unit tests for each component (TDD: test first, then implement)
- Integration tests for full flow
- Manual QA on multiple devices/screen sizes
- Edge cases: no output, large content, permissions, nested JSON

**Success Criteria**:
✅ Tools show 2-line preview in chat  
✅ Modal opens on preview tap  
✅ INPUT/OUTPUT tabs in vertical stack layout  
✅ Nested JSON renders as code blocks  
✅ Permissions work (INPUT-only when pending)  
✅ All tests pass  
✅ No TypeScript errors  
