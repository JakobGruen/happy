---
name: AskUserQuestion Preview Pane
description: Option preview pane in QuestionSheetContent — HTML/code/text rendering with FadeIn transitions and voice bridge tab reset
type: feature
---

# AskUserQuestion Preview Pane

## Overview

When Claude sends `AskUserQuestion` with options that include a `preview` field, the app renders a smart preview pane above the options list in the permission sheet modal. Selecting a different option fades in its preview.

## Layout

```
┌─────────────────────────────────────┐
│  ◆ APPROACH                         │  ← headerChip
│  Which approach?                    │  ← questionText
│  ┌───────────────────────────────┐  │
│  │  Preview content here         │  │  ← OptionPreviewPane (only if options have preview)
│  └───────────────────────────────┘  │
│  ● Option A   description           │  ← options (unchanged layout)
│  ○ Option B   description           │
│  [Cancel]           [Submit →]      │
└─────────────────────────────────────┘
```

## Key Files

- `packages/happy-app/sources/components/tools/OptionPreviewPane.tsx` — smart renderer
- `packages/happy-app/sources/components/tools/QuestionSheetContent.tsx` — wired in
- `packages/happy-app/sources/components/tools/modal/detectContentType.ts` — HTML type added
- `packages/happy-app/sources/hooks/useQuestionFormState.ts` — `QuestionOption.preview?: string`

## Architecture

### Content Detection (`detectContentType.ts`)

Extended `ContentType` to include `'html'`. Detection order: `JSON → HTML → Code → Text`.

HTML heuristic: `/^<[a-z][a-z0-9]*[\s/>]/` on `str.trimStart()`. Lowercase-only tag name requirement prevents TypeScript generic expressions (`<T extends string>`) from being misclassified.

**Important**: `ContentFormatter.tsx` (tool modal) treats `'html'` as plain text — full HTML rendering is only in `OptionPreviewPane`.

### OptionPreviewPane Component

```tsx
// Dispatch by content type:
// html  → WebView with injected theme CSS (bg + text colors from Unistyles theme)
// code  → SimpleSyntaxHighlighter in ScrollView
// text  → monospace Text in ScrollView
```

WebView uses `javaScriptEnabled={false}` for security — previews are static HTML only.

`buildHtmlPage(fragment, bgColor, textColor)` wraps content in a full themed HTML document.

### State in QuestionSheetContent

```typescript
const [previewOptionIndex, setPreviewOptionIndex] = React.useState(0);

// Reset on ANY tab change (manual OR voice bridge)
React.useEffect(() => {
    setPreviewOptionIndex(0);
}, [form.activeTab]);

// Wrap option selection to update preview index
const handleOptionWithPreview = (oIndex: number, multiSelect: boolean) => {
    form.handleOptionToggle(qIndex, oIndex, multiSelect);
    if (oIndex !== OTHER_INDEX && question.options[oIndex]?.preview) {
        setPreviewOptionIndex(oIndex);
    }
};
```

Preview shown only when `question.options.some(o => o.preview != null && o.preview !== '')`.

### Preview Pane JSX (Critical Detail)

```tsx
{previewContent != null && [
    <Animated.View
        key={`preview-${previewOptionIndex}`}
        entering={FadeIn.duration(200)}
        style={styles.previewContainer}
    >
        <OptionPreviewPane content={previewContent} testID="option-preview-pane" />
    </Animated.View>
]}
```

**⚠️ GOTCHA: Must use single-element array.** `key` on a non-array child is silently ignored by React — the `Animated.View` won't remount on index change and `FadeIn` never re-triggers. Wrapping in `[...]` makes the `key` meaningful to the reconciler.

### Tab Reset — Voice Bridge Gotcha

The voice bridge in `useQuestionFormState` fires `active-tab-change` events that call `form.setActiveTab` directly, bypassing `handleTabChange`. Using `useEffect` watching `form.activeTab` ensures the reset happens for ALL tab changes regardless of source.

## Data Model

```typescript
// useQuestionFormState.ts
export interface QuestionOption {
    label: string;
    description: string;
    preview?: string;  // Optional — HTML fragment, code, or plain text
}
```

No wire, CLI, or server changes needed — `preview` already flows through as untyped JSON from Claude's tool call.

## Preview Pane Behavior

| Condition | Result |
|---|---|
| No options have `preview` | Pane not rendered |
| Option 0 has `preview` | Shown on load |
| Option 0 has no `preview`, option 1 does | Falls back to first with preview |
| User selects option with `preview` | Preview updates with FadeIn |
| User selects "Other" (`OTHER_INDEX`) | Preview unchanged |
| Tab change (manual or voice) | Preview resets to index 0 |

## Preview Container Style

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
