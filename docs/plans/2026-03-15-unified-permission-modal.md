# Unified Floating Permission Modal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify permission sheets and tool detail modals into a single floating card system with a separate permission action bar.

**Architecture:** Convert `ToolModal` from a bottom-attached sheet to a floating card (all corners rounded, margins from edges). When a permission is pending, a separate `PermissionActionBar` component floats below the content card. `SessionPermissionSheet` orchestration moves into a new wrapper that reuses `ToolModal`. Rich content tools (AskUserQuestion, ExitPlanMode) keep their specialized components inside the modal. Minimized bar simplified to universal Allow/Deny for all tool types.

**Tech Stack:** React Native, Reanimated, Gesture Handler, Unistyles, Vitest

**Design doc:** `docs/plans/2026-03-15-unified-permission-modal-design.md`

---

### Task 1: Convert ToolModal to Floating Card Style

Convert the bottom-attached sheet into a floating card with all corners rounded and margins from screen edges. This is a pure visual change — no behavior changes.

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/ToolModal.tsx:110-171`

**Step 1: Write the failing test**

Create a snapshot/render test that verifies the floating card styling.

```typescript
// In the existing ToolModal test file, add:
it('renders as floating card with all corners rounded and margins', () => {
    const { getByTestId } = render(
        <ToolModal visible={true} tool={mockTool} metadata={null} onClose={jest.fn()} />
    );
    const card = getByTestId('tool-modal-card');
    // Verify rounded corners and margins are applied
    expect(card.props.style).toEqual(
        expect.objectContaining({
            borderRadius: 16,
        })
    );
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/happy-app && bun test -- --run ToolModal`
Expected: FAIL — `testID` not found or style mismatch

**Step 3: Implement floating card styling**

In `ToolModal.tsx`, modify the card container (lines ~127-169):

- Change the outer positioning `View` (line 119) from `justifyContent: 'flex-end'` to `justifyContent: 'center'` with padding
- Add `testID="tool-modal-card"` to the `Animated.View` card (line 127)
- Update card styles:
  - `borderRadius: 16` (all corners, replacing top-only radius)
  - `marginHorizontal: 12`
  - `marginBottom: safeArea.bottom + 8` (respect safe area)
  - `marginTop: 60` (leave space for status bar)
  - Remove `borderTopLeftRadius` / `borderTopRightRadius` if they exist as separate properties
  - Add shadow on all sides (not just top): `shadowOffset: { width: 0, height: 0 }`, `shadowRadius: 16`, `shadowOpacity: 0.2`, `elevation: 24`
- Keep `overflow: 'hidden'` on the card for content clipping
- Keep the `SafeAreaView` inside but adjust — the card itself now handles safe area via margins

**Step 4: Run test to verify it passes**

Run: `cd packages/happy-app && bun test -- --run ToolModal`
Expected: PASS

**Step 5: Run full tool modal test suite**

Run: `cd packages/happy-app && bun test -- --run modal`
Expected: All existing tests still pass (no behavior changes)

**Step 6: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/ToolModal.tsx
git commit -m "feat: convert ToolModal to floating card style"
```

---

### Task 2: Create PermissionActionBar Component

New component that renders Allow/Suggestions/Deny buttons with LLM summary and queue badge. Purely presentational — receives actions and data via props.

**Files:**
- Create: `packages/happy-app/sources/components/tools/modal/PermissionActionBar.tsx`
- Create: `packages/happy-app/sources/components/tools/modal/__tests__/PermissionActionBar.test.tsx`

**Step 1: Write the failing tests**

```typescript
import { render, fireEvent } from '@testing-library/react-native';
import { PermissionActionBar } from '../PermissionActionBar';

const mockActions = {
    loadingKey: null,
    handleAllowOnce: vi.fn(),
    handleSuggestion: vi.fn(),
    handleDeny: vi.fn(),
    handleApproveAllEdits: vi.fn(),
    handleApproveForSession: vi.fn(),
};

describe('PermissionActionBar', () => {
    it('renders LLM summary text', () => {
        const { getByText } = render(
            <PermissionActionBar
                actions={mockActions}
                llmSummary="Editing utility file"
                queueCount={0}
                suggestions={null}
            />
        );
        expect(getByText('Editing utility file')).toBeTruthy();
    });

    it('renders Allow and Deny buttons', () => {
        const { getByText } = render(
            <PermissionActionBar
                actions={mockActions}
                llmSummary={null}
                queueCount={0}
                suggestions={null}
            />
        );
        expect(getByText(/allow/i)).toBeTruthy();
        expect(getByText(/deny/i)).toBeTruthy();
    });

    it('calls handleAllowOnce on Allow press', () => {
        const { getByText } = render(
            <PermissionActionBar
                actions={mockActions}
                llmSummary={null}
                queueCount={0}
                suggestions={null}
            />
        );
        fireEvent.press(getByText(/allow/i));
        expect(mockActions.handleAllowOnce).toHaveBeenCalled();
    });

    it('shows queue count badge when queueCount > 0', () => {
        const { getByText } = render(
            <PermissionActionBar
                actions={mockActions}
                llmSummary={null}
                queueCount={3}
                suggestions={null}
            />
        );
        expect(getByText(/3 more/)).toBeTruthy();
    });

    it('renders suggestion buttons', () => {
        const suggestions = [
            { label: 'Allow all edits', mode: 'acceptEdits' },
        ];
        const { getByText } = render(
            <PermissionActionBar
                actions={mockActions}
                llmSummary={null}
                queueCount={0}
                suggestions={suggestions}
            />
        );
        expect(getByText('Allow all edits')).toBeTruthy();
    });

    it('shows deny feedback input on deny tap', () => {
        const { getByText, getByPlaceholderText } = render(
            <PermissionActionBar
                actions={mockActions}
                llmSummary={null}
                queueCount={0}
                suggestions={null}
            />
        );
        fireEvent.press(getByText(/deny/i));
        expect(getByPlaceholderText(/feedback/i)).toBeTruthy();
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/happy-app && bun test -- --run PermissionActionBar`
Expected: FAIL — module not found

**Step 3: Implement PermissionActionBar**

Create `PermissionActionBar.tsx` — a floating card component:

```typescript
import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { UsePermissionActionsResult } from '@/hooks/usePermissionActions';

interface PermissionActionBarProps {
    actions: UsePermissionActionsResult;
    llmSummary: string | null;
    queueCount: number;
    suggestions: any[] | null;
    toolName?: string;
}

export const PermissionActionBar = React.memo(function PermissionActionBar({
    actions,
    llmSummary,
    queueCount,
    suggestions,
    toolName,
}: PermissionActionBarProps) {
    const { styles, theme } = useStyles(stylesheet);
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackText, setFeedbackText] = useState('');

    const handleDenyTap = useCallback(() => {
        if (showFeedback) {
            actions.handleDeny(feedbackText.trim() || undefined);
            setShowFeedback(false);
            setFeedbackText('');
        } else {
            setShowFeedback(true);
        }
    }, [showFeedback, feedbackText, actions]);

    const isAnyLoading = actions.loadingKey !== null;

    return (
        <View style={styles.container}>
            {/* Deny feedback input (expands upward) */}
            {showFeedback && (
                <View style={styles.feedbackRow}>
                    <TextInput
                        style={styles.feedbackInput}
                        value={feedbackText}
                        onChangeText={setFeedbackText}
                        placeholder="Optional feedback..."
                        placeholderTextColor={theme.colors.textSecondary}
                        autoFocus
                    />
                </View>
            )}

            {/* LLM summary */}
            {llmSummary && (
                <Text style={styles.summary} numberOfLines={2}>
                    {llmSummary}
                </Text>
            )}

            {/* Action buttons row */}
            <View style={styles.buttonRow}>
                {/* Allow button */}
                <TouchableOpacity
                    style={[styles.button, styles.allowButton]}
                    onPress={actions.handleAllowOnce}
                    disabled={isAnyLoading}
                >
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Allow</Text>
                </TouchableOpacity>

                {/* Suggestion buttons */}
                {suggestions?.map((suggestion, index) => (
                    <TouchableOpacity
                        key={index}
                        style={[styles.button, styles.suggestionButton]}
                        onPress={() => actions.handleSuggestion(index, suggestion)}
                        disabled={isAnyLoading}
                    >
                        <Text style={styles.suggestionText}>
                            {suggestion.label || suggestion.title || `Option ${index + 1}`}
                        </Text>
                    </TouchableOpacity>
                ))}

                {/* Deny button */}
                <TouchableOpacity
                    style={[styles.button, styles.denyButton]}
                    onPress={handleDenyTap}
                    disabled={isAnyLoading && actions.loadingKey !== 'deny'}
                >
                    <Ionicons name="close" size={16} color="#FFFFFF" />
                    <Text style={styles.buttonText}>
                        {showFeedback ? 'Send' : 'Deny'}
                    </Text>
                </TouchableOpacity>

                {/* Queue badge */}
                {queueCount > 0 && (
                    <Text style={styles.queueBadge}>{queueCount} more</Text>
                )}
            </View>
        </View>
    );
});

const stylesheet = createStyleSheet((theme) => ({
    container: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 16,
        marginHorizontal: 12,
        marginTop: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        // Shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 8,
        shadowOpacity: 0.15,
        elevation: 16,
    },
    summary: {
        color: theme.colors.textSecondary,
        fontSize: 13,
        fontStyle: 'italic',
        marginBottom: 8,
    },
    buttonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    allowButton: {
        backgroundColor: theme.colors.permissionButton.allow.background,
    },
    denyButton: {
        backgroundColor: theme.colors.permissionButton.deny.background,
    },
    suggestionButton: {
        backgroundColor: theme.colors.textLink,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    suggestionText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '500',
    },
    queueBadge: {
        color: theme.colors.textSecondary,
        fontSize: 12,
        marginLeft: 'auto',
    },
    feedbackRow: {
        marginBottom: 8,
    },
    feedbackInput: {
        backgroundColor: theme.colors.surface,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: theme.colors.text,
        fontSize: 14,
    },
}));
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/happy-app && bun test -- --run PermissionActionBar`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/PermissionActionBar.tsx
git add packages/happy-app/sources/components/tools/modal/__tests__/PermissionActionBar.test.tsx
git commit -m "feat: create PermissionActionBar component"
```

---

### Task 3: Add Permission Props to ToolModal

Extend `ToolModal` to accept optional permission data and render `PermissionActionBar` below the content card when a permission is pending.

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/ToolModal.tsx:35-42, 110-171`

**Step 1: Write the failing test**

```typescript
// In existing ToolModal test file:
it('renders PermissionActionBar when permission is pending', () => {
    const mockPermission = {
        permissionId: 'perm-1',
        tool: 'Edit',
        toolInput: { file_path: 'test.ts', old_string: 'a', new_string: 'b' },
        description: 'Edit test file',
        llmSummary: 'Editing test file',
        permissionSuggestions: null,
        decisionReason: null,
        createdAt: Date.now(),
    };
    const mockActions = {
        loadingKey: null,
        handleAllowOnce: vi.fn(),
        handleSuggestion: vi.fn(),
        handleDeny: vi.fn(),
        handleApproveAllEdits: vi.fn(),
        handleApproveForSession: vi.fn(),
    };
    const { getByText } = render(
        <ToolModal
            visible={true}
            tool={mockTool}
            metadata={null}
            onClose={vi.fn()}
            permission={mockPermission}
            permissionActions={mockActions}
            queueCount={2}
        />
    );
    expect(getByText(/allow/i)).toBeTruthy();
    expect(getByText('2 more')).toBeTruthy();
});

it('does not render PermissionActionBar when no permission', () => {
    const { queryByText } = render(
        <ToolModal visible={true} tool={mockTool} metadata={null} onClose={jest.fn()} />
    );
    expect(queryByText(/allow/i)).toBeNull();
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/happy-app && bun test -- --run ToolModal`
Expected: FAIL — PermissionActionBar not rendered

**Step 3: Extend ToolModal props and render action bar**

In `ToolModal.tsx`:

1. Add to `ToolModalProps` interface (line 35):
```typescript
interface ToolModalProps {
    visible: boolean;
    tool: ToolCall;
    metadata: Metadata | null;
    messages?: Message[];
    onClose: () => void;
    hideOutput?: boolean;
    // Permission props (optional)
    permission?: CurrentSessionPermissionItem | null;
    permissionActions?: UsePermissionActionsResult | null;
    queueCount?: number;
}
```

2. Import `PermissionActionBar` and types

3. After the content card's closing `</Animated.View>` (around line 169), conditionally render the action bar:
```typescript
{/* Content Card */}
<Animated.View style={[cardStyle, styles.card]} testID="tool-modal-card">
    {/* ...existing content... */}
</Animated.View>

{/* Permission Action Bar — separate floating card */}
{permission && permissionActions && (
    <PermissionActionBar
        actions={permissionActions}
        llmSummary={permission.llmSummary}
        queueCount={queueCount ?? 0}
        suggestions={permission.permissionSuggestions}
        toolName={permission.tool}
    />
)}
```

4. Adjust outer container: ensure the card + action bar are bottom-aligned together. The outer `View` should use `justifyContent: 'flex-end'` with the card and action bar as siblings.

**Step 4: Run tests to verify they pass**

Run: `cd packages/happy-app && bun test -- --run ToolModal`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/ToolModal.tsx
git commit -m "feat: add permission action bar support to ToolModal"
```

---

### Task 4: Extend Content Router for Permission-Aware Routing

Add routing for `AskUserQuestion` (pending) → `QuestionSheetContent` and `ExitPlanMode` (pending) → `PlanSheetContent` inside the ToolModal content router.

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/ToolModal.tsx:159-166`

**Step 1: Write the failing test**

```typescript
it('renders QuestionSheetContent for pending AskUserQuestion', () => {
    const questionTool = {
        ...mockTool,
        name: 'AskUserQuestion',
        input: {
            question: 'Which option?',
            options: [{ label: 'A' }, { label: 'B' }],
        },
        permission: { id: 'p1', status: 'pending' as const },
    };
    const { getByText } = render(
        <ToolModal
            visible={true}
            tool={questionTool}
            metadata={null}
            onClose={vi.fn()}
            permission={mockPermission}
            permissionActions={mockActions}
            queueCount={0}
            sessionId="session-1"
        />
    );
    // QuestionSheetContent renders the question text
    expect(getByText('Which option?')).toBeTruthy();
});

it('renders PlanSheetContent for pending ExitPlanMode', () => {
    const planTool = {
        ...mockTool,
        name: 'ExitPlanMode',
        input: { plan: '# My Plan\n\nStep 1: Do thing' },
        permission: { id: 'p1', status: 'pending' as const },
    };
    const { getByText } = render(
        <ToolModal
            visible={true}
            tool={planTool}
            metadata={null}
            onClose={vi.fn()}
            permission={mockPermission}
            permissionActions={mockActions}
            queueCount={0}
        />
    );
    expect(getByText(/My Plan/)).toBeTruthy();
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/happy-app && bun test -- --run ToolModal`
Expected: FAIL — renders ToolModalTabs instead of specialized content

**Step 3: Extend content router**

In `ToolModal.tsx`, modify the content router (lines 159-166). Add permission-aware checks BEFORE the existing tool-type routing:

```typescript
// Content router — permission-aware routing first
const isPending = tool.permission?.status === 'pending';

if (isPending && tool.name === 'AskUserQuestion' && permission) {
    return <QuestionSheetContent permission={permission} sessionId={sessionId ?? ''} />;
}
if (isPending && (tool.name === 'ExitPlanMode' || tool.name === 'exit_plan_mode') && permission) {
    return <PlanSheetContent permission={permission} />;
}

// Existing routing
if (AGENT_TOOLS.has(tool.name)) {
    return <AgentModalContent ... />;
}
// ... rest unchanged
```

Also add `sessionId?: string` to `ToolModalProps` for QuestionSheetContent.

**Step 4: Run tests to verify they pass**

Run: `cd packages/happy-app && bun test -- --run ToolModal`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/ToolModal.tsx
git commit -m "feat: add permission-aware content routing to ToolModal"
```

---

### Task 5: Wire Permission Auto-Open in ToolView

When a tool has a pending permission, auto-open the `ToolModal` with permission data. This replaces the `SessionPermissionSheet` trigger.

**Files:**
- Modify: `packages/happy-app/sources/components/tools/ToolView.tsx:38-43, 258-265`

**Step 1: Write the failing test**

```typescript
it('auto-opens modal when tool has pending permission', () => {
    const pendingTool = {
        ...mockTool,
        permission: { id: 'p1', status: 'pending' as const },
    };
    const { getByTestId } = render(
        <ToolView tool={pendingTool} metadata={null} />
    );
    // Modal should be visible automatically
    expect(getByTestId('tool-modal-card')).toBeTruthy();
});

it('does not auto-open modal for completed permission', () => {
    const approvedTool = {
        ...mockTool,
        permission: { id: 'p1', status: 'approved' as const },
    };
    const { queryByTestId } = render(
        <ToolView tool={approvedTool} metadata={null} />
    );
    expect(queryByTestId('tool-modal-card')).toBeNull();
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/happy-app && bun test -- --run ToolView`
Expected: FAIL — modal not auto-opened for pending permission

**Step 3: Implement auto-open logic**

In `ToolView.tsx`:

1. Add a `useEffect` that auto-opens the modal when a pending permission is detected:
```typescript
// Auto-open modal for pending permissions
React.useEffect(() => {
    if (tool.permission?.status === 'pending') {
        setIsModalVisible(true);
    }
}, [tool.permission?.status]);
```

2. Pass permission data to `ToolModal` (around line 258-265):
```typescript
<ToolModal
    visible={isModalVisible}
    tool={tool}
    metadata={metadata}
    messages={messages}
    onClose={handleModalClose}
    hideOutput={tool.permission?.status === 'pending'}
    permission={permissionItem}        // From useCurrentSessionPermissions or mapped from tool.permission
    permissionActions={permissionActions}
    queueCount={queueCount}
    sessionId={sessionId}
/>
```

3. The permission data needs to be bridged. Two options:
   - **Option A**: `ToolView` receives permission props from parent (SessionView passes them down)
   - **Option B**: `ToolView` uses hooks directly (`usePermissionActions`) when `tool.permission` is pending

   Use **Option B** — keeps ToolView self-contained:
```typescript
const permissionActions = usePermissionActions(
    sessionId ?? '',
    tool.permission?.id ?? null,
    tool.name,
    tool.input,
    tool.permission?.status === 'pending',
);
```

4. Map `tool.permission` to `CurrentSessionPermissionItem` shape for the action bar:
```typescript
const permissionItem = tool.permission?.status === 'pending' ? {
    permissionId: tool.permission.id,
    tool: tool.name,
    toolInput: tool.input,
    description: tool.permission.description ?? tool.description,
    llmSummary: tool.permission.decisionReason ?? null,
    permissionSuggestions: tool.permission.permissionSuggestions ?? null,
    decisionReason: tool.permission.decisionReason ?? null,
    createdAt: tool.createdAt,
} : null;
```

5. Handle `onClose` for permission modals — minimize instead of close:
```typescript
const handleModalClose = useCallback(() => {
    if (tool.permission?.status === 'pending') {
        // Minimize to bar instead of closing
        onMinimize?.();
    } else {
        setIsModalVisible(false);
    }
}, [tool.permission?.status, onMinimize]);
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/happy-app && bun test -- --run ToolView`
Expected: PASS

**Step 5: Run full test suite**

Run: `cd packages/happy-app && bun test -- --run`
Expected: All passing

**Step 6: Commit**

```bash
git add packages/happy-app/sources/components/tools/ToolView.tsx
git commit -m "feat: auto-open ToolModal for pending permissions with action bar"
```

---

### Task 6: Simplify PermissionSheetBar

Simplify the minimized bar to always show Allow/Deny buttons (no "Tap to expand" variant). Add tool description as subtitle.

**Files:**
- Modify: `packages/happy-app/sources/components/tools/PermissionSheetBar.tsx:32, 67-121`

**Step 1: Write the failing test**

```typescript
it('shows Allow and Deny buttons for rich content tools', () => {
    const { getByText, queryByText } = render(
        <PermissionSheetBar
            permission={{ ...mockPermission, tool: 'AskUserQuestion' }}
            actions={mockActions}
            queueCount={0}
            isExpanded={false}
            onToggleExpand={vi.fn()}
        />
    );
    // Should show Allow/Deny, NOT "Tap to expand"
    expect(getByText(/allow/i)).toBeTruthy();
    expect(getByText(/deny/i)).toBeTruthy();
    expect(queryByText(/tap to expand/i)).toBeNull();
});

it('shows tool description as subtitle', () => {
    const { getByText } = render(
        <PermissionSheetBar
            permission={{ ...mockPermission, description: 'Editing src/utils.ts' }}
            actions={mockActions}
            queueCount={0}
            isExpanded={false}
            onToggleExpand={vi.fn()}
        />
    );
    expect(getByText('Editing src/utils.ts')).toBeTruthy();
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/happy-app && bun test -- --run PermissionSheetBar`
Expected: FAIL — rich content tools show "Tap to expand", no subtitle

**Step 3: Simplify the bar**

In `PermissionSheetBar.tsx`:

1. Remove the `isRichTool` check (line 32) and the "Tap to expand" branch (lines 67-76)
2. Always render Allow/Deny buttons + expand chevron (the regular tools path)
3. Add description subtitle below tool name:
```typescript
<View style={styles.nameContainer}>
    <Text style={styles.toolName}>{permission.tool}</Text>
    {permission.description && (
        <Text style={styles.toolDescription} numberOfLines={1}>
            {permission.description}
        </Text>
    )}
</View>
```

4. Add `toolDescription` style:
```typescript
toolDescription: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    marginTop: 1,
},
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/happy-app && bun test -- --run PermissionSheetBar`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/happy-app/sources/components/tools/PermissionSheetBar.tsx
git commit -m "feat: simplify PermissionSheetBar with universal Allow/Deny and subtitle"
```

---

### Task 7: Create Permission Modal Orchestrator

Create a new orchestrator component that replaces `SessionPermissionSheet`. It finds the first pending permission tool in the message list and passes permission data to `ToolView`'s auto-open logic. Manages the expanded/minimized state transition.

**Files:**
- Create: `packages/happy-app/sources/components/tools/PermissionModalOrchestrator.tsx`
- Create: `packages/happy-app/sources/components/tools/__tests__/PermissionModalOrchestrator.test.tsx`
- Modify: `packages/happy-app/sources/-session/SessionView.tsx` (swap SessionPermissionSheet → PermissionModalOrchestrator)

**Step 1: Write the failing test**

```typescript
import { render } from '@testing-library/react-native';
import { PermissionModalOrchestrator } from '../PermissionModalOrchestrator';

describe('PermissionModalOrchestrator', () => {
    it('renders minimized bar when minimized', () => {
        const { getByText } = render(
            <PermissionModalOrchestrator sessionId="session-1" />
        );
        // When a permission exists but user minimized, bar should show
        // This test depends on mock session data setup
    });

    it('provides permission context to suppress inline footers', () => {
        // Verify PermissionSheetContext.Provider is rendered with true
    });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/happy-app && bun test -- --run PermissionModalOrchestrator`
Expected: FAIL — module not found

**Step 3: Implement orchestrator**

The orchestrator's job is simpler than `SessionPermissionSheet` — it only manages:
1. The minimized bar (expanded state is handled by ToolView's auto-open)
2. The `PermissionSheetContext` provider
3. The expanded ↔ minimized state

```typescript
import React, { useState, useCallback } from 'react';
import { useCurrentSessionPermissions } from '@/hooks/useCurrentSessionPermissions';
import { usePermissionActions } from '@/hooks/usePermissionActions';
import { PermissionSheetContext } from './permissionSheetContext';
import { PermissionSheetBar } from './PermissionSheetBar';

interface PermissionModalOrchestratorProps {
    sessionId: string;
}

export function PermissionModalOrchestrator({ sessionId }: PermissionModalOrchestratorProps) {
    const { firstPermission, queueCount } = useCurrentSessionPermissions(sessionId);
    const [isMinimized, setIsMinimized] = useState(false);

    const actions = usePermissionActions(
        sessionId,
        firstPermission?.permissionId ?? null,
        firstPermission?.tool ?? '',
        firstPermission?.toolInput,
        firstPermission !== null,
    );

    const handleToggleExpand = useCallback(() => {
        setIsMinimized(prev => !prev);
    }, []);

    // Reset to expanded when new permission arrives
    React.useEffect(() => {
        if (firstPermission) {
            setIsMinimized(false);
        }
    }, [firstPermission?.permissionId]);

    const hasPermission = firstPermission !== null;

    return (
        <PermissionSheetContext.Provider value={hasPermission}>
            {hasPermission && isMinimized && (
                <PermissionSheetBar
                    permission={firstPermission}
                    actions={actions}
                    queueCount={queueCount}
                    isExpanded={false}
                    onToggleExpand={handleToggleExpand}
                />
            )}
        </PermissionSheetContext.Provider>
    );
}
```

**Note:** The expanded state (full tool modal) is handled by the individual `ToolView` auto-open. The orchestrator only controls the minimized bar and the context provider. The `ToolView` with the pending permission will detect `isPermissionSheetActive` context and auto-open its modal.

**Step 4: Wire into SessionView**

In `SessionView.tsx`, replace `<SessionPermissionSheet sessionId={sessionId} />` with `<PermissionModalOrchestrator sessionId={sessionId} />`.

**Step 5: Run tests to verify they pass**

Run: `cd packages/happy-app && bun test -- --run PermissionModalOrchestrator`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/happy-app/sources/components/tools/PermissionModalOrchestrator.tsx
git add packages/happy-app/sources/components/tools/__tests__/PermissionModalOrchestrator.test.tsx
git add packages/happy-app/sources/-session/SessionView.tsx
git commit -m "feat: create PermissionModalOrchestrator, wire into SessionView"
```

---

### Task 8: Adapt QuestionSheetContent and PlanSheetContent for ToolModal

Adjust these rich content components to fit inside the ToolModal's content area. They currently expect the `PermissionSheetExpanded` parent's layout — they need to work inside ToolModal's content router.

**Files:**
- Modify: `packages/happy-app/sources/components/tools/QuestionSheetContent.tsx`
- Modify: `packages/happy-app/sources/components/tools/PlanSheetContent.tsx`

**Step 1: Check existing tests**

Run: `cd packages/happy-app && bun test -- --run QuestionSheetContent PlanSheetContent`
Verify existing tests pass before making changes.

**Step 2: Adapt components**

Both components currently receive `permission: CurrentSessionPermissionItem` as their main prop. This shape is the same one we map from `tool.permission` in Task 5. The main adaptations needed:

For **QuestionSheetContent**:
- Ensure it renders correctly without `PermissionSheetExpanded`'s outer `ScrollView` (ToolModal has its own scroll handling)
- The component already manages its own scroll — should work as-is
- Verify submit/cancel buttons dispatch correctly through the actions flow
- May need to accept `permissionActions` prop for the cancel button (currently uses `sessionDeny` directly)

For **PlanSheetContent**:
- Ensure `MarkdownView` renders within ToolModal's content area
- Remove any dependency on parent padding/margins from `PermissionSheetExpanded`
- Should be mostly a `flex: 1` wrapper — likely works as-is

**Step 3: Run tests**

Run: `cd packages/happy-app && bun test -- --run QuestionSheetContent PlanSheetContent`
Expected: PASS (if adaptations needed, write tests first)

**Step 4: Commit**

```bash
git add packages/happy-app/sources/components/tools/QuestionSheetContent.tsx
git add packages/happy-app/sources/components/tools/PlanSheetContent.tsx
git commit -m "refactor: adapt QuestionSheetContent and PlanSheetContent for ToolModal"
```

---

### Task 9: Remove Old Permission Sheet Components

Delete the components replaced by the unified system.

**Files:**
- Delete: `packages/happy-app/sources/components/tools/SessionPermissionSheet.tsx`
- Delete: `packages/happy-app/sources/components/tools/PermissionSheetExpanded.tsx`
- Delete: `packages/happy-app/sources/components/tools/EditSheetContent.tsx`
- Clean up: Remove imports of deleted components from any remaining files

**Step 1: Search for imports of deleted components**

Run: `grep -r "SessionPermissionSheet\|PermissionSheetExpanded\|EditSheetContent" packages/happy-app/sources/ --include="*.ts" --include="*.tsx" -l`

**Step 2: Remove imports and references**

Update any files still importing these components.

**Step 3: Delete the files**

```bash
rm packages/happy-app/sources/components/tools/SessionPermissionSheet.tsx
rm packages/happy-app/sources/components/tools/PermissionSheetExpanded.tsx
rm packages/happy-app/sources/components/tools/EditSheetContent.tsx
```

**Step 4: Delete associated test files**

```bash
find packages/happy-app -name "*SessionPermissionSheet*" -o -name "*PermissionSheetExpanded*" -o -name "*EditSheetContent*" | grep test
# Delete any found test files
```

**Step 5: Run full test suite**

Run: `cd packages/happy-app && bun test -- --run`
Expected: All passing (no references to deleted components)

**Step 6: Commit**

```bash
git add -u  # Stage deletions
git commit -m "refactor: remove old permission sheet components"
```

---

### Task 10: Integration Testing & Manual Verification

End-to-end verification that the unified system works correctly across all tool types and permission states.

**Step 1: Run full test suite**

Run: `cd packages/happy-app && bun test -- --run`
Expected: All tests pass

**Step 2: Run typecheck**

Run: `bun typecheck`
Expected: No type errors

**Step 3: Manual testing checklist**

Test each scenario in the running app:

- [ ] **Regular tool (Bash)**: Tap completed tool → floating modal with tabs → X to close
- [ ] **Edit tool permission**: Permission arrives → auto-open floating modal with DiffModalContent + action bar → Allow → modal closes
- [ ] **AskUserQuestion permission**: Permission arrives → auto-open with QuestionSheetContent + no action bar (has its own submit) → answer question
- [ ] **ExitPlanMode permission**: Permission arrives → auto-open with PlanSheetContent + action bar → Allow
- [ ] **Minimize**: Swipe down on permission modal → simplified bar with Allow/Deny + description → tap chevron → re-expand
- [ ] **Quick allow from bar**: Minimize → tap Allow on bar → permission processed, next permission auto-opens
- [ ] **Deny with feedback**: Tap Deny → feedback input appears → type message → send
- [ ] **Queue**: Multiple permissions → queue badge shows count → processing advances to next
- [ ] **Non-Claude sessions**: Codex/Gemini sessions → no permission sheet/bar (inline footer preserved)
- [ ] **PermissionBanner**: Cross-session banners still work independently

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for unified permission modal"
```

---

## Dependency Graph

```
Task 1 (floating card style) ──────────────────────────┐
Task 2 (PermissionActionBar) ──────────────────────────┤
                                                        ├─→ Task 3 (permission props on ToolModal)
                                                        │         │
Task 8 (adapt QuestionSheet/PlanSheet) ────────────────┤         │
                                                        │         ▼
                                                        ├─→ Task 4 (content routing)
                                                        │         │
                                                        │         ▼
                                                        ├─→ Task 5 (auto-open in ToolView)
                                                        │         │
Task 6 (simplify bar) ────────────────────────────────┤         │
                                                        │         ▼
                                                        ├─→ Task 7 (orchestrator + SessionView swap)
                                                        │         │
                                                        │         ▼
                                                        └─→ Task 9 (remove old components)
                                                                  │
                                                                  ▼
                                                            Task 10 (integration test)
```

**Parallelizable:** Tasks 1, 2, 6, and 8 can run in parallel (no dependencies between them).
