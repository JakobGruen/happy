# AskUserQuestion Preview Pane Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a preview pane above the options list in `QuestionSheetContent` that displays smart-rendered content (HTML/code/text) for the selected option, with a smooth fade transition when the selection changes.

**Architecture:** Extend `QuestionOption` with an optional `preview` field; add `'html'` to the content-type detection pipeline; build a self-contained `OptionPreviewPane` component (WebView / SimpleSyntaxHighlighter / monospace Text); wire it into `QuestionSheetContent` with a local `previewOptionIndex` state that syncs when an option is selected.

**Tech Stack:** React Native, react-native-webview (already installed at 13.15.0), react-native-reanimated (FadeIn), SimpleSyntaxHighlighter (existing), Unistyles, Vitest

---

## Layout Target

```
┌──────────────────────────────────────┐
│  ◆ APPROACH                          │  ← headerChip (unchanged)
│  Which approach should I use?        │  ← questionText (unchanged)
│                                      │
│  ┌────────────────────────────────┐  │
│  │  Fast Approach preview content │  │  ← OptionPreviewPane (NEW)
│  │  function processItems(data) { │  │    minHeight 200, maxHeight 320
│  │    return data.map(...)        │  │    FadeIn on selection change
│  └────────────────────────────────┘  │
│                                      │
│  ● Fast Approach   description       │  ← options (unchanged layout)
│  ○ Safe Approach   description       │
│  ○ Hybrid          description       │
│                                      │
│  [Cancel]             [Submit →]     │
└──────────────────────────────────────┘
```

**Rules:**
- Preview pane only renders if ≥1 option has a `preview` field
- Initial preview: first option (index 0). Falls back to first option that has a preview if index 0 has none.
- Selecting an option that has `preview`: updates the preview. "Other" never updates preview.
- Tab change (multi-question): resets `previewOptionIndex` to 0.

---

## Background: AskUserQuestion Tool Schema

The `preview` field is `optional` on each option. CC only includes it where visual comparison helps. The app has no `previewFormat` flag in the payload — it must detect content type heuristically:

| Content | Heuristic | Renderer |
|---------|-----------|----------|
| HTML | Starts with `<lowercase-tag` | `WebView` with injected theme CSS |
| Code | `const`/`let`/`var`/`def`/arrow fns | `SimpleSyntaxHighlighter` |
| Plain text | Everything else | Monospace `Text` |

---

## Task 1: Extend `detectContentType` with HTML support

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/detectContentType.ts`
- Test: `packages/happy-app/sources/components/tools/modal/__tests__/ContentFormatter.test.tsx`

### Step 1: Write failing tests

Add inside the `detectContentType function` describe block in `ContentFormatter.test.tsx`:

```typescript
it('detects HTML with a div tag', () => {
    expect(detectContentType('<div>hello</div>')).toBe('html');
});

it('detects HTML with a pre block', () => {
    expect(detectContentType('<pre>code here</pre>')).toBe('html');
});

it('detects HTML with attributes', () => {
    expect(detectContentType('<span class="foo">bar</span>')).toBe('html');
});

it('does not classify TypeScript generics as HTML (uppercase tag)', () => {
    // Generic type parameters are uppercase — should not trigger HTML detection
    expect(detectContentType('<T extends string>(x: T) => x')).not.toBe('html');
});

it('does not classify markdown as HTML', () => {
    expect(detectContentType('# Title\n\nParagraph text')).not.toBe('html');
});
```

### Step 2: Run to verify they fail

```bash
cd /home/jakob/repos/happy && bun run --filter happy-app test --run -- ContentFormatter
```

Expected: FAIL — `detectContentType` returns `'text'` or `'code'` for HTML inputs, not `'html'`

### Step 3: Implement HTML type

In `detectContentType.ts`, change the type:

```typescript
export type ContentType = 'json' | 'html' | 'code' | 'text';
```

Add HTML detection BEFORE `looksLikeCode` (after the JSON string check):

```typescript
// Detect HTML — require an opening tag with lowercase tag name.
// Placed before code detection so <div>...</div> doesn't get misclassified.
if (looksLikeHtml(str)) {
    return 'html';
}
```

Add helper function (after `looksLikeCode`):

```typescript
/**
 * Returns true if the string starts with a lowercase HTML-like opening tag.
 * Lowercase check prevents TypeScript generic expressions (e.g. <T>) from
 * being misclassified as HTML.
 */
function looksLikeHtml(str: string): boolean {
    return /^<[a-z][a-z0-9]*[\s/>]/.test(str.trimStart());
}
```

### Step 4: Verify tests pass

```bash
cd /home/jakob/repos/happy && bun run --filter happy-app test --run -- ContentFormatter
```

Expected: all new HTML tests PASS, all existing tests still PASS

### Step 5: Commit

```bash
cd /home/jakob/repos/happy
git add packages/happy-app/sources/components/tools/modal/detectContentType.ts \
        packages/happy-app/sources/components/tools/modal/__tests__/ContentFormatter.test.tsx
git commit -m "feat(app): add 'html' content type to detectContentType"
```

---

## Task 2: Add `preview` field to `QuestionOption`

**Files:**
- Modify: `packages/happy-app/sources/hooks/useQuestionFormState.ts`

No test needed — additive type extension with no runtime behaviour.

### Step 1: Add the field

Change `QuestionOption` from:
```typescript
export interface QuestionOption {
    label: string;
    description: string;
}
```
To:
```typescript
export interface QuestionOption {
    label: string;
    description: string;
    /** Optional preview content shown in the preview pane when this option is focused. */
    preview?: string;
}
```

### Step 2: Typecheck

```bash
cd /home/jakob/repos/happy && bun typecheck
```

Expected: no errors

### Step 3: Commit

```bash
cd /home/jakob/repos/happy
git add packages/happy-app/sources/hooks/useQuestionFormState.ts
git commit -m "feat(app): add optional preview field to QuestionOption"
```

---

## Task 3: Create `OptionPreviewPane` component

**Files:**
- Create: `packages/happy-app/sources/components/tools/OptionPreviewPane.tsx`
- Create: `packages/happy-app/sources/components/tools/__tests__/OptionPreviewPane.test.tsx`

### Step 1: Write failing tests

Create `packages/happy-app/sources/components/tools/__tests__/OptionPreviewPane.test.tsx`:

```typescript
/**
 * Unit tests for OptionPreviewPane.
 * Verifies content-type-based rendering dispatch without asserting internal
 * implementation details of each renderer.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { describe, it, expect, vi } from 'vitest';

// WebView is a native module — mock it so tests run in Vitest/JSDOM
vi.mock('react-native-webview', () => ({
    default: ({ testID }: { testID?: string }) => {
        const { View } = require('react-native');
        return <View testID={testID ?? 'webview-mock'} />;
    },
}));

import { OptionPreviewPane } from '../OptionPreviewPane';

describe('OptionPreviewPane', () => {
    it('renders a WebView for HTML content', () => {
        const { getByTestId } = render(
            <OptionPreviewPane content="<div>hello</div>" testID="preview" />
        );
        // The WebView mock renders with testID 'webview-mock'
        expect(getByTestId('webview-mock')).toBeTruthy();
    });

    it('does NOT render a WebView for code content', () => {
        const { queryByTestId } = render(
            <OptionPreviewPane content="const x = 5;" testID="preview" />
        );
        expect(queryByTestId('webview-mock')).toBeNull();
    });

    it('renders plain text for text content', () => {
        const { getByText } = render(
            <OptionPreviewPane content="plain text content" testID="preview" />
        );
        expect(getByText('plain text content')).toBeTruthy();
    });

    it('renders without crashing for an empty string', () => {
        expect(() =>
            render(<OptionPreviewPane content="" testID="preview" />)
        ).not.toThrow();
    });
});
```

### Step 2: Verify they fail

```bash
cd /home/jakob/repos/happy && bun run --filter happy-app test --run -- OptionPreviewPane
```

Expected: FAIL — `OptionPreviewPane.tsx` does not exist yet

### Step 3: Implement `OptionPreviewPane.tsx`

Create `packages/happy-app/sources/components/tools/OptionPreviewPane.tsx`:

```tsx
import React from 'react';
import { ScrollView, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import WebView from 'react-native-webview';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { detectContentType } from '@/components/tools/modal/detectContentType';
import { Typography } from '@/constants/Typography';

interface OptionPreviewPaneProps {
    content: string;
    testID?: string;
}

/**
 * Renders option preview content with smart type detection.
 *
 * - HTML → WebView with injected theme CSS (light/dark aware)
 * - Code → SimpleSyntaxHighlighter in a ScrollView
 * - Text → monospace Text in a ScrollView
 *
 * Used inside QuestionSheetContent above the options list.
 */
export function OptionPreviewPane({ content, testID }: OptionPreviewPaneProps) {
    const { theme } = useUnistyles();
    const type = detectContentType(content);

    if (type === 'html') {
        const html = buildHtmlPage(content, theme.colors.surface, theme.colors.text);
        return (
            <WebView
                testID={testID}
                source={{ html }}
                style={styles.webview}
                scrollEnabled
                originWhitelist={['*']}
                javaScriptEnabled={false}
            />
        );
    }

    return (
        <ScrollView
            testID={testID}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
        >
            {type === 'code' ? (
                <SimpleSyntaxHighlighter
                    code={content}
                    language={detectLanguage(content)}
                    selectable
                />
            ) : (
                <Text
                    selectable
                    style={[styles.plainText, { color: theme.colors.text }]}
                >
                    {content}
                </Text>
            )}
        </ScrollView>
    );
}

/**
 * Wraps an HTML fragment in a complete themed document.
 * Injects background/text colours so WebView respects dark mode.
 */
function buildHtmlPage(fragment: string, bgColor: string, textColor: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      background: ${bgColor};
      color: ${textColor};
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      padding: 12px;
      margin: 0;
      word-wrap: break-word;
    }
    pre, code { font-family: monospace; font-size: 12px; }
    pre { overflow-x: auto; }
  </style>
</head>
<body>${fragment}</body>
</html>`;
}

/** Minimal language heuristic — mirrors logic in ContentFormatter. */
function detectLanguage(content: string): string {
    if (/\bdef\s+\w+\s*\(/.test(content) || /^from\s+\w+\s+import/m.test(content)) {
        return 'python';
    }
    if (/^package\s+\w+/m.test(content) || /\bfunc\s+\w+/.test(content)) {
        return 'go';
    }
    return 'javascript';
}

const styles = StyleSheet.create(() => ({
    webview: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 12,
    },
    plainText: {
        fontSize: 13,
        fontFamily: Typography.mono().fontFamily,
        lineHeight: 20,
    },
}));
```

### Step 4: Verify tests pass

```bash
cd /home/jakob/repos/happy && bun run --filter happy-app test --run -- OptionPreviewPane
```

Expected: all 4 tests PASS

### Step 5: Typecheck

```bash
cd /home/jakob/repos/happy && bun typecheck
```

### Step 6: Commit

```bash
cd /home/jakob/repos/happy
git add packages/happy-app/sources/components/tools/OptionPreviewPane.tsx \
        packages/happy-app/sources/components/tools/__tests__/OptionPreviewPane.test.tsx
git commit -m "feat(app): add OptionPreviewPane — HTML/code/text smart renderer"
```

---

## Task 4: Wire preview pane into `QuestionSheetContent`

**Files:**
- Modify: `packages/happy-app/sources/components/tools/QuestionSheetContent.tsx`
- Create: `packages/happy-app/sources/components/tools/__tests__/QuestionSheetContentPreview.test.tsx`

### Step 1: Write failing tests

Create `packages/happy-app/sources/components/tools/__tests__/QuestionSheetContentPreview.test.tsx`:

```typescript
/**
 * Tests for preview pane integration in QuestionSheetContent.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/sync/ops', () => ({
    sessionAllow: vi.fn().mockResolvedValue(undefined),
    sessionDeny: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/track', () => ({ trackPermissionResponse: vi.fn() }));
vi.mock('@/realtime/voiceQuestionBridge', () => ({ subscribe: vi.fn(() => vi.fn()) }));
vi.mock('react-native-webview', () => ({
    default: ({ testID }: { testID?: string }) => {
        const { View } = require('react-native');
        return <View testID={testID ?? 'webview-mock'} />;
    },
}));
vi.mock('react-native-reanimated', async () => {
    const actual = await vi.importActual('react-native-reanimated/mock');
    return actual;
});

import { QuestionSheetContent } from '../QuestionSheetContent';

const makePermission = (options: Array<{ label: string; description: string; preview?: string }>) => ({
    permissionId: 'perm-1',
    toolName: 'AskUserQuestion',
    toolInput: {
        questions: [{
            header: 'APPROACH',
            question: 'Which approach?',
            multiSelect: false,
            options,
        }],
    },
} as any);

describe('QuestionSheetContent — preview pane', () => {
    it('shows preview pane when first option has preview content', () => {
        const { getByTestId } = render(
            <QuestionSheetContent
                permission={makePermission([
                    { label: 'Fast', description: 'Quick', preview: '<b>Fast</b>' },
                    { label: 'Safe', description: 'Slow' },
                ])}
                sessionId="sess-1"
            />
        );
        expect(getByTestId('option-preview-pane')).toBeTruthy();
    });

    it('does not show preview pane when no options have preview', () => {
        const { queryByTestId } = render(
            <QuestionSheetContent
                permission={makePermission([
                    { label: 'A', description: 'desc A' },
                    { label: 'B', description: 'desc B' },
                ])}
                sessionId="sess-1"
            />
        );
        expect(queryByTestId('option-preview-pane')).toBeNull();
    });

    it('updates preview when an option with preview is selected', () => {
        const { getByText, getByTestId } = render(
            <QuestionSheetContent
                permission={makePermission([
                    { label: 'Fast', description: 'Quick', preview: '<b>Fast</b>' },
                    { label: 'Safe', description: 'Slow', preview: 'const safe = true;' },
                ])}
                sessionId="sess-1"
            />
        );
        fireEvent.press(getByText('Safe'));
        // Preview pane still present after switching
        expect(getByTestId('option-preview-pane')).toBeTruthy();
    });
});
```

### Step 2: Verify they fail

```bash
cd /home/jakob/repos/happy && bun run --filter happy-app test --run -- QuestionSheetContentPreview
```

Expected: FAIL — `option-preview-pane` testID not present

### Step 3: Implement changes in `QuestionSheetContent.tsx`

**3a. Add imports at the top of the file:**

```typescript
import Animated, { FadeIn } from 'react-native-reanimated';
import { OptionPreviewPane } from '@/components/tools/OptionPreviewPane';
```

**3b. Add `previewOptionIndex` state and tab-reset handler inside the component function (after the `isCanceling` state):**

```typescript
// Tracks which option's preview content is shown in the preview pane.
// Resets to 0 when the active question (tab) changes.
const [previewOptionIndex, setPreviewOptionIndex] = React.useState(0);

const handleTabChange = React.useCallback((tab: number) => {
    form.setActiveTab(tab);
    setPreviewOptionIndex(0);
}, [form]);
```

**3c. Replace the `onPress={() => form.setActiveTab(qIndex)}` in the tab strip with:**

```tsx
onPress={() => handleTabChange(qIndex)}
```

**3d. In `renderQuestion`, add preview computation at the top of the function (before the return):**

```typescript
const hasPreview = question.options.some(o => o.preview != null && o.preview !== '');

const previewContent = React.useMemo(() => {
    if (!hasPreview) return null;
    const preferred = question.options[previewOptionIndex]?.preview;
    if (preferred) return preferred;
    // Fall back to first option that has any preview
    return question.options.find(o => o.preview)?.preview ?? null;
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [hasPreview, question.options, previewOptionIndex]);
```

Note: `renderQuestion` is called inside the component render, so `React.useMemo` is fine here but violates rules-of-hooks if `renderQuestion` is a nested function. To keep it clean, compute `previewContent` outside `renderQuestion` and pass it in, or inline the preview section without `useMemo` (acceptable since question.options is stable).

**Simpler approach — no `useMemo` inside a helper function:**

In `renderQuestion`, just compute inline:

```typescript
const hasPreview = question.options.some(o => o.preview != null && o.preview !== '');
const previewContent = hasPreview
    ? (question.options[previewOptionIndex]?.preview
        ?? question.options.find(o => o.preview)?.preview
        ?? null)
    : null;
```

**3e. Add a `handleOptionWithPreview` wrapper inside `renderQuestion` (after the `previewContent` computation):**

```typescript
const handleOptionWithPreview = (oIndex: number, multiSelect: boolean) => {
    form.handleOptionToggle(qIndex, oIndex, multiSelect);
    // Update preview when selecting a numbered option that has a preview
    if (oIndex !== OTHER_INDEX && question.options[oIndex]?.preview) {
        setPreviewOptionIndex(oIndex);
    }
};
```

**3f. Replace all calls to `form.handleOptionToggle(qIndex, oIndex, question.multiSelect)` with `handleOptionWithPreview(oIndex, question.multiSelect)`.**

There are two such calls in the component:
1. The numbered options `.map()` loop
2. The "Other" `TouchableOpacity` `onPress`

Both can safely use `handleOptionWithPreview` — the `OTHER_INDEX` check inside it prevents preview updates for "Other".

**3g. Add the preview pane JSX inside `renderQuestion`, between the `questionText` and `optionsContainer`:**

```tsx
{/* Preview pane — only rendered when ≥1 option has preview content */}
{previewContent != null && (
    <Animated.View
        key={`preview-${previewOptionIndex}`}
        entering={FadeIn.duration(200)}
        style={styles.previewContainer}
    >
        <OptionPreviewPane
            content={previewContent}
            testID="option-preview-pane"
        />
    </Animated.View>
)}
```

**3h. Add `previewContainer` to the `StyleSheet.create` at the bottom:**

```typescript
previewContainer: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    overflow: 'hidden',
    minHeight: 200,
    maxHeight: 320,
    marginBottom: 8,
},
```

### Step 4: Verify tests pass

```bash
cd /home/jakob/repos/happy && bun run --filter happy-app test --run -- QuestionSheetContentPreview
```

Expected: all 3 tests PASS

### Step 5: Run full test suite

```bash
cd /home/jakob/repos/happy && bun run --filter happy-app test --run
```

Expected: no regressions

### Step 6: Typecheck

```bash
cd /home/jakob/repos/happy && bun typecheck
```

Expected: no errors

### Step 7: Commit

```bash
cd /home/jakob/repos/happy
git add packages/happy-app/sources/components/tools/QuestionSheetContent.tsx \
        packages/happy-app/sources/components/tools/__tests__/QuestionSheetContentPreview.test.tsx
git commit -m "feat(app): wire preview pane into QuestionSheetContent with fade transitions"
```

---

## Definition of Done

- [ ] `detectContentType` returns `'html'` for strings starting with a lowercase HTML tag
- [ ] `QuestionOption` has `preview?: string`
- [ ] `OptionPreviewPane` renders WebView for HTML, SimpleSyntaxHighlighter for code, monospace Text for plain
- [ ] Preview pane appears above options only when ≥1 option has `preview`
- [ ] First option's preview shown by default (falls back to first with preview if index 0 has none)
- [ ] Selecting an option with `preview` fades in its preview via `FadeIn.duration(200)`
- [ ] "Other" selection does not change the preview
- [ ] Tab change (multi-question) resets preview to first option
- [ ] All tests pass, typecheck clean
