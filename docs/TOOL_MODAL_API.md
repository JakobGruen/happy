# Tool Modal Component API

This document provides detailed API reference for all tool modal components.

## ToolModal

**Location**: `packages/happy-app/sources/components/tools/modal/ToolModal.tsx`

Bottom-sheet modal for displaying full tool parameters and results.

### Props

```typescript
interface ToolModalProps {
    visible: boolean;
    tool: ToolCall;
    metadata: Metadata | null;
    onClose: () => void;
    hideOutput?: boolean;
    testID?: string;
}
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `visible` | `boolean` | ✅ | Whether modal is displayed. Controls animation and backdrop. |
| `tool` | `ToolCall` | ✅ | The tool invocation to display (contains `name`, `input`, `result`, `permission`, etc.) |
| `metadata` | `Metadata \| null` | ✅ | Session metadata (flavor, model, etc.). Used by tab content for context-aware rendering. |
| `onClose` | `() => void` | ✅ | Callback fired when user closes modal (backdrop tap or close button). |
| `hideOutput` | `boolean` | ❌ | When `true`, OUTPUT tab is hidden. Use when permission is pending. |
| `testID` | `string` | ❌ | Test identifier for Detox/testing. |

### Behavior

- **Animation**: Slides up from bottom with transparency backdrop
- **SafeAreaView**: Respects notches, home indicators on iOS
- **Header**: Displays tool name + close button (Ionicons "close")
- **Backdrop**: Semi-transparent (40% black); tap to close
- **Content**: Delegates to `ToolModalTabs` for tab switching and parameter rendering
- **Keyboard**: Modal respects keyboard appearance (no auto-scroll)

### Example Usage

```typescript
import { ToolModal } from '@/components/tools/modal';
import { useState } from 'react';

function MyComponent({ tool, metadata, sessionId }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <>
      <Button onPress={() => setIsVisible(true)} title="View Tool" />

      <ToolModal
        visible={isVisible}
        tool={tool}
        metadata={metadata}
        onClose={() => setIsVisible(false)}
        hideOutput={false}
        testID="my-tool-modal"
      />
    </>
  );
}
```

### Styling

- **Background**: Uses `theme.colors.surfaceHigh`
- **Border**: Top corners rounded (16dp)
- **Header border**: `theme.colors.surfaceRipple`
- **Text color**: `theme.colors.text`

---

## ToolModalTabs

**Location**: `packages/happy-app/sources/components/tools/modal/ToolModalTabs.tsx`

Tab switcher for INPUT and OUTPUT parameters. Always shows INPUT tab; OUTPUT tab hidden if `hideOutput={true}`.

### Props

```typescript
interface ToolModalTabsProps {
    tool: ToolCall;
    hideOutput?: boolean;
}
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `tool` | `ToolCall` | ✅ | The tool with `input` and `result` data to display across tabs. |
| `hideOutput` | `boolean` | ❌ | When `true`, OUTPUT tab is not rendered. Use for pending permissions. |

### Behavior

- **Default Tab**: Starts on INPUT tab
- **Tab Counts**: Shows parameter count in parentheses: `INPUT (3)`, `OUTPUT (2)`
- **Dynamic Tabs**: OUTPUT tab only rendered if `!hideOutput`
- **Content**: Uses `VerticalParameterStack` to render parameters for active tab
- **Empty Handling**: Shows "No parameters" if tab has no data

### Tab Switching Logic

```typescript
const [activeTab, setActiveTab] = useState<'input' | 'output'>('input');

// INPUT tab always renders
// OUTPUT tab only renders if !hideOutput
if (activeTab === 'input') {
  <VerticalParameterStack parameters={tool.input} />
}
if (activeTab === 'output' && !hideOutput) {
  <VerticalParameterStack parameters={tool.result} />
}
```

### Example Usage

```typescript
import { ToolModalTabs } from '@/components/tools/modal';

function ToolDetailsView({ tool }) {
  return (
    <ToolModalTabs
      tool={tool}
      hideOutput={tool.permission?.status === 'pending'}
    />
  );
}
```

### Styling

- **Tab header**: `theme.colors.surfaceHighest` background
- **Active tab**: Blue bottom border (`theme.colors.textLink`)
- **Tab label**: 14px, 500 weight
- **Content area**: Padded (8dp vertical)
- **Border**: `theme.colors.surfaceRipple` between header and content

---

## ContentPreview

**Location**: `packages/happy-app/sources/components/tools/modal/ContentPreview.tsx`

Generates a 2-line preview for tool display in chat bubbles.

### Props

```typescript
interface ContentPreviewProps {
    tool: ToolCall;
    testID?: string;
}
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `tool` | `ToolCall` | ✅ | Tool with `result` and `input` to generate preview from. |
| `testID` | `string` | ❌ | Test identifier. Line and badge testIDs auto-generated: `{testID}-line`, `{testID}-badge`. |

### Behavior

**Line 1 (previewLine)**:
1. Try first line of `tool.result` (if string)
2. Fallback to first value of `tool.input` (if object with string values)
3. Fallback to "–" (empty state)
4. Truncate to 50 characters + "…" if longer

**Line 2 (badge)**:
- Only rendered if `tool.result` exists
- Analyzes result content type (TEXT, JSON, CODE, etc.)
- Shows: `TYPE • SIZE` (e.g., `TEXT • 42 bytes`, `JSON • 156 bytes`)
- Uses `contentAnalyzer` utility functions

### Example Preview Outputs

```
// File read result
Line 1: "#!/bin/bash\n# Setup script"
Badge: "TEXT • 256 bytes"

// Data processing result
Line 1: "{\n  status: 'success',\n  count: 42"
Badge: "JSON • 128 bytes"

// No result (pending)
Line 1: "–"
Badge: (none)
```

### Example Usage

```typescript
import { ContentPreview } from '@/components/tools/modal';

function ToolBubble({ tool }) {
  return (
    <View style={styles.bubble}>
      <Text>{tool.name}</Text>
      <ContentPreview tool={tool} testID="tool-preview" />
    </View>
  );
}
```

### Styling

- **Line text**: 13px, secondary text color
- **Badge text**: 12px, secondary text color
- **Spacing**: 2px between line and badge

---

## VerticalParameterStack

**Location**: `packages/happy-app/sources/components/tools/modal/VerticalParameterStack.tsx`

Renders parameters in vertical stack format (name above value). Used exclusively in modals.

### Props

```typescript
interface VerticalParameterStackProps {
    parameters: Record<string, unknown>;
    hideOutput?: boolean;
    testID?: string;
}
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `parameters` | `Record<string, unknown>` | ✅ | Object with parameter names as keys and values to display. Can be `undefined` (treated as empty). |
| `hideOutput` | `boolean` | ❌ | If `true`, filters out entries with `undefined` values. Unused in current code but available for future filtering. |
| `testID` | `string` | ❌ | Test identifier. Auto-generates `{testID}-empty` for empty state. |

### Behavior

**Rendering**:
1. Filter entries: Skip items with `undefined` values if `hideOutput=true`
2. If no entries: Show "No parameters" placeholder
3. For each entry: Render name + value (via `VariableFormatter`)

**Layout**:
```
Name (gray, 13px, 500 weight)
[Value formatted via VariableFormatter]

Name (gray, 13px, 500 weight)
[Value formatted via VariableFormatter]
```

**Value Formatting** (delegates to `VariableFormatter`):
- Strings: Direct display (or code view if > 100 chars)
- Objects: JSON with 2-space indent
- Numbers/booleans: String conversion
- `null`/`undefined`: Display as "null" or "undefined"

### Example Usage

```typescript
import { VerticalParameterStack } from '@/components/tools/modal';

function ModalContent({ tool }) {
  return (
    <ScrollView>
      <Text>Input Parameters</Text>
      <VerticalParameterStack
        parameters={tool.input}
        testID="input-params"
      />

      {tool.result && (
        <>
          <Text>Output</Text>
          <VerticalParameterStack
            parameters={tool.result}
            testID="output-params"
          />
        </>
      )}
    </ScrollView>
  );
}
```

### Example Parameter Display

Input:
```typescript
{
  path: "/home/user/file.txt",
  size: 1024,
  metadata: { created: "2025-03-12", owner: "alice" }
}
```

Output (rendered):
```
path
/home/user/file.txt

size
1024

metadata
{
  "created": "2025-03-12",
  "owner": "alice"
}
```

### Styling

- **Container**: 12px horizontal padding, 8px vertical padding
- **Name**: 13px, 500 weight, secondary text color, 4px bottom margin
- **Value**: Inherits from `VariableFormatter`
- **Group spacing**: 12px between parameter groups
- **Empty state**: Centered text, 16px padding

---

## VariableFormatter (Enhanced)

**Location**: `packages/happy-app/sources/components/tools/adaptive/VariableFormatter.tsx`

Universal value formatter with layout mode support.

### Props

```typescript
interface VariableFormatterProps {
    name: string;
    value: unknown;
    isVertical?: boolean;
}
```

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `name` | `string` | ✅ | Parameter name (used for analysis, not displayed by formatter). |
| `value` | `unknown` | ✅ | Any value type (string, number, object, null, etc.). |
| `isVertical` | `boolean` | ❌ | Layout hint (unused in current implementation). Set to `true` for modal context. |

### Behavior

**Type Handling**:
- `null`/`undefined`: Display as string
- Strings: Direct text (max 3 lines)
- Objects/Arrays: JSON with 2-space indent
- Numbers/Booleans: String conversion

**Long Content** (> 100 chars):
- Render via `CodeView` with syntax highlighting
- Scrollable within modal

**Short Content** (≤ 100 chars):
- Render as plain `Text` component
- Max 3 lines with ellipsis

### Example Usage

```typescript
import { VariableFormatter } from '@/components/tools/adaptive/VariableFormatter';

function ParameterRow({ name, value }) {
  return (
    <View>
      <Text>{name}</Text>
      <VariableFormatter
        name={name}
        value={value}
        isVertical={true}
      />
    </View>
  );
}
```

### Examples

```typescript
// String (short)
<VariableFormatter name="path" value="/home/user/file.txt" isVertical={true} />
// Output: Plain text "/home/user/file.txt"

// String (long)
<VariableFormatter
  name="content"
  value="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt..."
  isVertical={true}
/>
// Output: CodeView with syntax highlighting

// Object
<VariableFormatter
  name="result"
  value={{ status: 'ok', data: [1, 2, 3] }}
  isVertical={true}
/>
// Output:
// {
//   "status": "ok",
//   "data": [1, 2, 3]
// }

// Null
<VariableFormatter name="error" value={null} isVertical={true} />
// Output: "null"
```

---

## Integration Example: Complete Modal Flow

```typescript
import { ToolModal, ContentPreview, ToolModalTabs } from '@/components/tools/modal';
import { useState } from 'react';

export function ToolBubble({ tool, metadata, sessionId }) {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const isPermissionPending = tool.permission?.status === 'pending';

  return (
    <View>
      {/* 2-line preview in chat */}
      <Pressable onPress={() => setIsModalVisible(true)}>
        <View style={styles.preview}>
          <Text>{tool.name}</Text>
          <ContentPreview tool={tool} testID={`tool-${tool.id}-preview`} />
        </View>
      </Pressable>

      {/* Full modal on tap */}
      <ToolModal
        visible={isModalVisible}
        tool={tool}
        metadata={metadata}
        onClose={() => setIsModalVisible(false)}
        hideOutput={isPermissionPending}
        testID={`tool-${tool.id}-modal`}
      />
    </View>
  );
}
```

---

## Type Definitions

```typescript
// From @/sync/typesMessage
interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  result?: unknown;
  state: 'running' | 'completed' | 'error';
  permission?: {
    status: 'pending' | 'approved' | 'denied' | 'canceled';
    reason?: string;
  };
  createdAt: number;
}

// From @/sync/storageTypes
interface Metadata {
  flavor: 'claude' | 'codex' | 'gemini';
  model: string;
  permissionMode: 'auto' | 'manual' | 'sandbox';
}
```

---

## Common Patterns

### Conditional Tab Display

```typescript
// Hide OUTPUT when permission pending
<ToolModal
  visible={isVisible}
  tool={tool}
  metadata={metadata}
  onClose={() => setIsVisible(false)}
  hideOutput={tool.permission?.status === 'pending'}
/>
```

### Empty State Handling

```typescript
// VerticalParameterStack auto-handles:
// - No parameters → "No parameters" message
// - Undefined values → Filtered if hideOutput=true
// - Null values → Display as "null"
<VerticalParameterStack parameters={tool.input || {}} />
```

### Content Preview Fallbacks

```typescript
// ContentPreview logic:
// 1. First line of tool.result (if string)
// 2. First value of tool.input (if available)
// 3. "–" (if nothing available)
<ContentPreview tool={tool} />
```

---

## Testing

See `docs/TOOL_MODAL_PATTERNS.md` for comprehensive testing examples.

Key test scenarios:
- Modal renders when visible={true}
- Close button dismisses modal
- INPUT tab always visible
- OUTPUT tab hidden when hideOutput={true}
- ContentPreview shows correct preview
- VariableFormatter formats values correctly
