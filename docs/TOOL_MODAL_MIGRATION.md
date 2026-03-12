# Tool Modal Migration Guide

## Overview

The Happy Coder app has transitioned from **inline tool expansion** in chat messages to a **modal-based display** for tool parameters and results. This guide explains what changed, why, and how to update code that uses the tool display system.

## What Changed (User-Facing)

### Before: Inline Expansion
- Tool bubbles in chat expanded directly inline to show full INPUT/OUTPUT parameters
- Chat context (other messages, conversation) was pushed off-screen
- Limited space for large tool inputs/results (especially on smaller devices)
- Permission dialogs expanded the same inline bubble

### After: Modal-Based Display
- Tool bubbles in chat show a **2-line preview** (first output line + type/size badge)
- Tapping the preview opens a **bottom-sheet modal** with full parameters
- Modal displays INPUT and OUTPUT tabs (if permission approved)
- Chat remains visible during tool interaction
- Better use of available screen space
- Cleaner, more focused permission workflow

### User Experience Impact

| Scenario | Before | After |
|----------|--------|-------|
| **Browsing long tool outputs** | Scroll through chat | Scroll within modal (chat visible) |
| **Reviewing permission** | Inline expansion | Modal sheet + minimized header |
| **Checking multiple tools** | Collapse/expand each | Tap, review, close, tap next |
| **Permission pending** | Can't see OUTPUT | OUTPUT tab hidden, INPUT visible |

## Why This Change

1. **Better Context Preservation** — Chat messages stay visible while reviewing tool details
2. **Improved Mobile UX** — Bottom sheets are familiar; no vertical scrolling through messages
3. **Consistency** — Matches patterns from Claude desktop/web for tool interaction
4. **Cleaner Permission Flow** — Modal permission state is explicit (hideOutput vs. full view)
5. **Scalability** — Easier to add tool-specific UI in a dedicated modal container

## For Developers: Migration Path

### 1. **Read-Only Integration (No Changes Needed)**

If your code just **reads** tool data:

```typescript
// Old: Tool data accessed via props
const renderTool = (tool: ToolCall) => {
  const inputKeys = Object.keys(tool.input || {});
  // ...
};

// New: Same prop interface, no changes to your code
const renderTool = (tool: ToolCall) => {
  const inputKeys = Object.keys(tool.input || {});
  // ...
};
```

✅ No action required. Tool data structure is unchanged.

### 2. **Tool Rendering Components**

If your code renders a tool in a **message/chat context**, ensure you use `ToolView`:

```typescript
// ✅ Correct: Use ToolView, which handles modal internally
<ToolView
  tool={tool}
  metadata={metadata}
  sessionId={sessionId}
  messageId={messageId}
/>

// ❌ Don't: Manually render tool parameters inline
<View>
  <Text>{tool.name}</Text>
  <View>{/* Render tool.input here */}</View>
</View>
```

`ToolView` now manages:
- 2-line preview display (via `ContentPreview`)
- Modal visibility state
- Permission-aware rendering (`hideOutput`)

### 3. **Custom Tool Displays**

If you have a custom tool view (via `knownTools` registry):

```typescript
// Old: You might render parameters inline
const MyToolView = ({ tool }) => (
  <View>
    <Text>Input:</Text>
    {Object.entries(tool.input || {}).map(([k, v]) => (
      <Text key={k}>{k}: {v}</Text>
    ))}
  </View>
);

// New: ToolView handles layout; your custom view is optional
// The modal system works independently, so no changes needed
// But if you need custom parameter rendering, use VariableFormatter
import { VariableFormatter } from '@/components/tools/adaptive/VariableFormatter';

const MyToolView = ({ tool }) => (
  <View>
    <Text>Input:</Text>
    {Object.entries(tool.input || {}).map(([k, v]) => (
      <VariableFormatter key={k} name={k} value={v} isVertical={true} />
    ))}
  </View>
);
```

The `isVertical={true}` flag ensures parameters render in modal-style (name above value).

### 4. **Manual Modal Usage**

Only use `ToolModal` directly if you're building a custom tool interaction (rare):

```typescript
import { ToolModal } from '@/components/tools/modal';

const MyCustomToolUI = ({ tool, sessionId }) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  return (
    <>
      <Pressable onPress={() => setIsModalVisible(true)}>
        <Text>View tool details</Text>
      </Pressable>

      <ToolModal
        visible={isModalVisible}
        tool={tool}
        metadata={null}
        onClose={() => setIsModalVisible(false)}
        hideOutput={false}
      />
    </>
  );
};
```

### 5. **Permission Handling**

**Key change**: Permission modals now use `hideOutput={true}` to suppress the OUTPUT tab:

```typescript
// ToolView.tsx does this automatically:
<ToolModal
  visible={isModalVisible}
  tool={tool}
  metadata={props.metadata}
  onClose={() => setIsModalVisible(false)}
  hideOutput={tool.permission?.status === 'pending'}  // Hide OUTPUT while pending
/>
```

If you're building custom permission UI:

```typescript
// When permission pending, don't show tool results
if (tool.permission?.status === 'pending') {
  // Only show INPUT tab to user
  return <VerticalParameterStack parameters={tool.input} hideOutput={true} />;
}

// When approved/denied, show full details
return (
  <>
    <VerticalParameterStack parameters={tool.input} hideOutput={false} />
    {tool.result && <VerticalParameterStack parameters={tool.result} />}
  </>
);
```

## Key Behavioral Differences

### Preview Generation

`ContentPreview` selects a single line for display:

```
First output line (or first input value) → Truncate to 50 chars → Add type/size badge
```

Result: Tool inputs like `{ path: "/very/long/path/to/file.txt" }` show as:
```
/very/long/path/to/file.txt • STRING • 42 bytes
```

### Parameter Rendering Modes

| Mode | Component | Use Case |
|------|-----------|----------|
| **Vertical** | `VerticalParameterStack` | Modal display (name above value) |
| **Grid** | `AdaptiveParameterGrid` | Chat inline (name left of value) |

`VariableFormatter` is mode-agnostic; it just formats individual values.

### Modal vs. Inline

- **Modal**: `ToolModal` → `ToolModalTabs` → `VerticalParameterStack` → `VariableFormatter`
- **Inline** (still supported): `AdaptiveParameterGrid` → `VariableFormatter`

## Checklist for Updating Your Code

- [ ] Use `ToolView` for all tool rendering in messages (not raw components)
- [ ] If you render tool parameters, use `VariableFormatter(isVertical=true)` for modals
- [ ] If you have custom permission UI, set `hideOutput={true}` when `tool.permission?.status === 'pending'`
- [ ] Test modal opens/closes correctly
- [ ] Test INPUT/OUTPUT tabs work (if permission approved)
- [ ] Test content preview shows for completed tools

## Files Modified

| File | Change |
|------|--------|
| `ToolView.tsx` | Now manages modal state; shows ContentPreview instead of inline expansion |
| `VariableFormatter.tsx` | Added `isVertical` prop for layout modes |
| `modal/ToolModal.tsx` | New component for bottom-sheet modal |
| `modal/ToolModalTabs.tsx` | New component for INPUT/OUTPUT tabs |
| `modal/ContentPreview.tsx` | New component for 2-line preview in chat |
| `modal/VerticalParameterStack.tsx` | New component for modal-style parameter rendering |
| `modal/index.ts` | Barrel export for modal components |

## Troubleshooting

### Modal doesn't open
- Check `isModalVisible` state in `ToolView`
- Verify `onPress` fires on preview tap
- Ensure `<ToolModal visible={isModalVisible} ... />` is rendered

### OUTPUT tab hidden unexpectedly
- Check if `tool.permission?.status === 'pending'`
- If pending, `hideOutput={true}` suppresses OUTPUT tab
- Once permission approved, OUTPUT tab should appear

### Preview shows "–"
- Tool has no output and no input (unusual edge case)
- Check if `tool.result` or `tool.input` are defined
- Add sample data or implement custom preview logic

### VariableFormatter shows raw JSON
- Content > 100 chars renders as code (via `CodeView`)
- Content ≤ 100 chars renders as plain text
- For objects, always shows JSON-formatted text

## Related Documentation

- **Component API**: See `docs/TOOL_MODAL_API.md` for detailed prop documentation
- **Usage Patterns**: See `docs/TOOL_MODAL_PATTERNS.md` for common scenarios and testing
- **knownTools Registry**: `components/tools/knownTools.ts` — custom tool handlers
