# Tool Modal Usage Patterns & Testing

This document covers common patterns for using tool modal components, permission handling, and testing strategies.

## Common Usage Patterns

### Pattern 1: Basic Tool Display in Chat

Show a tool in a chat message with automatic modal support:

```typescript
import { ToolView } from '@/components/tools/ToolView';

export function ChatMessage({ tool, metadata, sessionId }) {
  return (
    <View style={styles.messageBubble}>
      <Text style={styles.senderName}>Claude</Text>
      <ToolView
        tool={tool}
        metadata={metadata}
        sessionId={sessionId}
        messageId={tool.id}
      />
    </View>
  );
}
```

**What `ToolView` does automatically**:
- ✅ Renders header with icon and title
- ✅ Shows 2-line preview (via `ContentPreview`)
- ✅ Manages modal visibility state
- ✅ Opens modal on preview tap
- ✅ Hides OUTPUT tab when permission pending
- ✅ Applies minimal layout for completed non-Claude tools

---

### Pattern 2: Permission-Aware Modal Display

Show different content based on permission status:

```typescript
import { ToolModal } from '@/components/tools/modal';
import { useState } from 'react';

function ToolDetailsScreen({ tool, metadata }) {
  const [isVisible, setIsVisible] = useState(false);

  const isPermissionPending = tool.permission?.status === 'pending';
  const isApproved = tool.permission?.status === 'approved';

  return (
    <>
      <Button onPress={() => setIsVisible(true)} title="Details" />

      <ToolModal
        visible={isVisible}
        tool={tool}
        metadata={metadata}
        onClose={() => setIsVisible(false)}
        hideOutput={isPermissionPending}  // Hide output while waiting for permission
      />

      {/* Show permission buttons separately */}
      {isPermissionPending && (
        <PermissionFooter
          permission={tool.permission}
          sessionId={sessionId}
          toolName={tool.name}
        />
      )}
    </>
  );
}
```

**Permission states**:
- `pending`: Show INPUT only, permission buttons visible below
- `approved`: Show INPUT + OUTPUT tabs
- `denied`: Show INPUT only, red deny reason displayed
- `canceled`: Same as denied

---

### Pattern 3: Custom Tool Preview

Generate custom previews for specific tools:

```typescript
import { knownTools } from '@/components/tools/knownTools';

// Register custom preview logic
export const MyCustomTool = {
  name: 'MyCustomTool',
  
  // Runs BEFORE ContentPreview, can return custom preview text
  extractSubtitle: ({ tool }) => {
    if (tool.result && typeof tool.result === 'object') {
      const { status, count } = tool.result as any;
      return `${status} – ${count} items`;
    }
    return null;
  },

  // In chat, title can be dynamic
  title: ({ tool, metadata }) => {
    return 'My Tool Execution';
  },

  // Apply minimal layout after completion
  minimal: ({ tool, metadata }) => {
    return tool.state === 'completed' && tool.permission?.status === 'approved';
  },
};

// Add to registry
knownTools['MyCustomTool'] = MyCustomTool;
```

Result in chat:
```
| My Tool Execution
| success – 42 items
```

Tap to open modal with full INPUT/OUTPUT tabs.

---

### Pattern 4: Filtered Parameter Display

Show only specific parameters in modal:

```typescript
import { VerticalParameterStack } from '@/components/tools/modal';

function FilteredToolView({ tool }) {
  // Only show 'path' and 'size' parameters
  const filteredParams = {
    path: tool.input?.path,
    size: tool.input?.size,
  };

  return (
    <VerticalParameterStack
      parameters={filteredParams}
      testID="filtered-params"
    />
  );
}
```

---

### Pattern 5: Long Content Scrolling

Long tool outputs automatically scroll within modal:

```typescript
// ContentPreview shows first line + badge
// User taps to open modal
// Modal content (VerticalParameterStack) scrolls if needed

<ToolModal
  visible={isVisible}
  tool={{
    name: 'FileRead',
    input: { path: '/large/file.txt' },
    result: 'Very long file content...\n...\n...' // Auto-scrolls in modal
  }}
  metadata={metadata}
  onClose={() => setIsVisible(false)}
/>
```

---

### Pattern 6: Handle Undefined/Null Values

Handle edge cases in parameter display:

```typescript
import { VerticalParameterStack } from '@/components/tools/modal';

// Tool with some undefined/null inputs
const tool = {
  name: 'MyTool',
  input: {
    required: 'value',
    optional: undefined,
    errored: null,
  },
  result: null,
};

<VerticalParameterStack parameters={tool.input} />

// Output:
// required
// value
//
// optional
// undefined
//
// errored
// null
```

---

## Permission Handling Patterns

### When Permission is Pending

Tool awaits user approval:

```typescript
if (tool.permission?.status === 'pending') {
  return (
    <View>
      {/* Show INPUT tab only */}
      <ToolModal
        visible={isVisible}
        tool={tool}
        metadata={metadata}
        onClose={() => setIsVisible(false)}
        hideOutput={true}  // Hide OUTPUT
      />

      {/* Show permission UI */}
      <PermissionFooter
        permission={tool.permission}
        sessionId={sessionId}
        toolName={tool.name}
      />
    </View>
  );
}
```

### When Permission is Denied

User rejected tool execution:

```typescript
if (tool.permission?.status === 'denied') {
  return (
    <View style={styles.toolBubble}>
      <Text style={styles.title}>{tool.name}</Text>
      {tool.permission.reason && (
        <Text style={styles.denyReason}>
          Reason: {tool.permission.reason}
        </Text>
      )}
      {/* Modal still available for reference */}
      <ToolModal
        visible={isVisible}
        tool={tool}
        metadata={metadata}
        onClose={() => setIsVisible(false)}
        hideOutput={false}
      />
    </View>
  );
}
```

### Dynamic Tab Visibility

Control tabs based on permission + state:

```typescript
const hideOutput =
  tool.permission?.status === 'pending' ||
  tool.state === 'running' ||
  !tool.result;

<ToolModal
  visible={isVisible}
  tool={tool}
  metadata={metadata}
  onClose={() => setIsVisible(false)}
  hideOutput={hideOutput}
/>
```

---

## Content Analysis Pattern

Understand how `ContentPreview` analyzes tool output:

```typescript
import { analyzeContent, formatSize } from '@/components/tools/adaptive/contentAnalyzer';

const tool = {
  result: '{"data": [1, 2, 3]}',
};

// ContentPreview does this internally:
const analysis = analyzeContent(tool.result);
// → { type: 'json', size: 16 }

const sizeLabel = formatSize(16);
// → '16 bytes'

const badge = `${analysis.type.toUpperCase()} • ${sizeLabel}`;
// → 'JSON • 16 bytes'
```

Supported types:
- `text` — Plain ASCII text
- `json` — JSON structure
- `code` — Source code (Python, JS, etc.)
- `html` — HTML markup
- `markdown` — Markdown content
- `binary` — Binary data

---

## Testing Patterns

### Test 1: Modal Visibility Toggle

```typescript
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ToolView } from '@/components/tools/ToolView';

test('opens modal when preview tapped', async () => {
  const tool = {
    id: '1',
    name: 'TestTool',
    input: { param: 'value' },
    result: 'output',
    state: 'completed',
  };

  const { getByTestId, queryByTestId } = render(
    <ToolView tool={tool} metadata={null} sessionId="session-1" />
  );

  // Modal not visible initially
  expect(queryByTestId('tool-modal')).not.toBeVisible();

  // Tap preview to open
  fireEvent.press(getByTestId('tool-header'));

  // Modal appears
  await waitFor(() => {
    expect(getByTestId('tool-modal')).toBeVisible();
  });
});
```

### Test 2: Tab Switching

```typescript
test('switches between INPUT and OUTPUT tabs', async () => {
  const tool = {
    name: 'TestTool',
    input: { param: 'value' },
    result: { output: 'data' },
    state: 'completed',
  };

  const { getByTestId, getByText } = render(
    <ToolModal
      visible={true}
      tool={tool}
      metadata={null}
      onClose={jest.fn()}
      hideOutput={false}
    />
  );

  // INPUT tab active by default
  expect(getByTestId('tab-input')).toHaveStyle({ borderBottomColor: 'blue' });
  expect(getByTestId('input-parameters')).toBeVisible();

  // Tap OUTPUT tab
  fireEvent.press(getByTestId('tab-output'));

  // OUTPUT tab now active
  await waitFor(() => {
    expect(getByTestId('tab-output')).toHaveStyle({ borderBottomColor: 'blue' });
    expect(getByTestId('output-parameters')).toBeVisible();
  });
});
```

### Test 3: hideOutput Behavior

```typescript
test('hides OUTPUT tab when hideOutput=true', () => {
  const tool = {
    name: 'TestTool',
    input: { param: 'value' },
    result: { output: 'data' },
  };

  const { queryByTestId } = render(
    <ToolModal
      visible={true}
      tool={tool}
      metadata={null}
      onClose={jest.fn()}
      hideOutput={true}
    />
  );

  // INPUT tab visible
  expect(queryByTestId('tab-input')).toBeVisible();

  // OUTPUT tab hidden
  expect(queryByTestId('tab-output')).not.toBeVisible();
});
```

### Test 4: ContentPreview Generation

```typescript
import { ContentPreview } from '@/components/tools/modal';

test('generates correct preview text', () => {
  const tool = {
    result: 'First line of output\nSecond line',
    input: null,
  };

  const { getByTestId } = render(
    <ContentPreview tool={tool} testID="preview" />
  );

  const previewLine = getByTestId('preview-line');
  expect(previewLine.props.children).toBe('First line of output');
});

test('shows badge for result', () => {
  const tool = {
    result: 'Some text content',
  };

  const { getByTestId } = render(
    <ContentPreview tool={tool} testID="preview" />
  );

  const badge = getByTestId('preview-badge');
  expect(badge.props.children).toMatch(/TEXT • \d+ bytes/);
});

test('fallback to dash when no content', () => {
  const tool = {
    result: null,
    input: null,
  };

  const { getByTestId } = render(
    <ContentPreview tool={tool} testID="preview" />
  );

  const previewLine = getByTestId('preview-line');
  expect(previewLine.props.children).toBe('–');
});
```

### Test 5: VariableFormatter with Different Types

```typescript
import { VariableFormatter } from '@/components/tools/adaptive/VariableFormatter';

test('formats string values', () => {
  const { getByText } = render(
    <VariableFormatter name="path" value="/home/user/file.txt" isVertical={true} />
  );
  expect(getByText('/home/user/file.txt')).toBeVisible();
});

test('formats objects as JSON', () => {
  const { getByText } = render(
    <VariableFormatter
      name="data"
      value={{ status: 'ok', count: 42 }}
      isVertical={true}
    />
  );
  expect(getByText(/status.*ok/)).toBeVisible();
  expect(getByText(/count.*42/)).toBeVisible();
});

test('formats null values', () => {
  const { getByText } = render(
    <VariableFormatter name="error" value={null} isVertical={true} />
  );
  expect(getByText('null')).toBeVisible();
});

test('renders long content in CodeView', () => {
  const longString = 'a'.repeat(150);
  const { getByTestId } = render(
    <VariableFormatter name="content" value={longString} isVertical={true} />
  );
  expect(getByTestId('code-view')).toBeVisible();
});
```

### Test 6: VerticalParameterStack with Empty Parameters

```typescript
test('shows empty state', () => {
  const { getByText } = render(
    <VerticalParameterStack parameters={{}} testID="params" />
  );
  expect(getByText('No parameters')).toBeVisible();
});

test('renders parameter groups', () => {
  const params = {
    name: 'Alice',
    age: 30,
  };

  const { getByText } = render(
    <VerticalParameterStack parameters={params} testID="params" />
  );

  expect(getByText('name')).toBeVisible();
  expect(getByText('Alice')).toBeVisible();
  expect(getByText('age')).toBeVisible();
  expect(getByText('30')).toBeVisible();
});
```

### Test 7: Permission Pending State (Integration)

```typescript
test('hides OUTPUT and shows permission UI when pending', async () => {
  const tool = {
    name: 'Bash',
    input: { command: 'ls -la' },
    result: null,
    state: 'running',
    permission: { status: 'pending' },
  };

  const { getByTestId, queryByTestId } = render(
    <ToolView tool={tool} metadata={null} sessionId="session-1" />
  );

  // Open modal
  fireEvent.press(getByTestId('tool-header'));

  await waitFor(() => {
    expect(getByTestId('tool-modal')).toBeVisible();
  });

  // INPUT tab visible, OUTPUT hidden
  expect(getByTestId('tab-input')).toBeVisible();
  expect(queryByTestId('tab-output')).not.toBeVisible();

  // Permission footer visible
  expect(getByTestId('permission-footer')).toBeVisible();
});
```

### Test 8: Close Button

```typescript
test('closes modal when close button tapped', async () => {
  const handleClose = jest.fn();

  const { getByTestId, queryByTestId } = render(
    <ToolModal
      visible={true}
      tool={{ name: 'Test' }}
      metadata={null}
      onClose={handleClose}
    />
  );

  expect(getByTestId('tool-modal')).toBeVisible();

  // Tap close button
  fireEvent.press(getByTestId('modal-close-button'));

  // onClose callback fired
  expect(handleClose).toHaveBeenCalled();
});

test('closes modal when backdrop tapped', async () => {
  const handleClose = jest.fn();

  const { getByTestId } = render(
    <ToolModal
      visible={true}
      tool={{ name: 'Test' }}
      metadata={null}
      onClose={handleClose}
    />
  );

  // Tap backdrop
  fireEvent.press(getByTestId('modal-backdrop'));

  expect(handleClose).toHaveBeenCalled();
});
```

---

## Type Narrowing & Record<string, unknown>

When working with tool parameters, always narrow types:

```typescript
// ❌ Don't: Assume object structure
const value = tool.input?.param as any;

// ✅ Do: Type guard first
if (tool.input && typeof tool.input === 'object') {
  const params = tool.input as Record<string, unknown>;
  const param = params.param; // unknown
  
  if (typeof param === 'string') {
    console.log(param.toUpperCase()); // Safe
  }
}

// ✅ Also good: Use conditional rendering
{tool.input && typeof tool.input === 'object' && (
  <VerticalParameterStack
    parameters={tool.input as Record<string, unknown>}
  />
)}
```

---

## Edge Cases & Workarounds

### Edge Case 1: Tool with No Input or Result

```typescript
const tool = {
  name: 'Query',
  input: undefined,
  result: undefined,
  state: 'completed',
};

// VerticalParameterStack shows "No parameters"
<VerticalParameterStack parameters={tool.input || {}} />

// ContentPreview shows "–"
<ContentPreview tool={tool} />
```

### Edge Case 2: Very Large Tool Results

```typescript
const tool = {
  name: 'Download',
  result: 'x'.repeat(1000000), // 1MB string
};

// ContentPreview shows first 50 chars + badge
<ContentPreview tool={tool} />
// → "xxxx...xxxxx • TEXT • 1.0 MB"

// Modal renders with scrollable CodeView
<ToolModal visible={true} tool={tool} metadata={null} onClose={() => {}} />
```

### Edge Case 3: Nested Objects in Parameters

```typescript
const tool = {
  input: {
    config: {
      database: {
        host: 'localhost',
        port: 5432,
      },
    },
  },
};

// VariableFormatter formats as JSON
<VariableFormatter
  name="config"
  value={tool.input.config}
  isVertical={true}
/>
// →
// {
//   "database": {
//     "host": "localhost",
//     "port": 5432
//   }
// }
```

---

## Debugging Checklist

- [ ] Modal not opening?
  - Check if `isModalVisible` state is toggled by press handler
  - Verify `<ToolModal visible={isModalVisible} ... />`

- [ ] OUTPUT tab always hidden?
  - Check if `hideOutput={true}` is set incorrectly
  - Should be `hideOutput={tool.permission?.status === 'pending'}`

- [ ] Preview shows "–"?
  - Check if `tool.result` and `tool.input` are defined
  - Inspect `contentAnalyzer.analyzeContent()` output

- [ ] Values show as raw JSON instead of formatted?
  - Check if `VariableFormatter` length check (>100 chars)
  - Long content should render via `CodeView`

- [ ] Parameter names cut off?
  - Check `numberOfLines={1}` on parameter name Text
  - Increase max width or truncate long names

---

## Related Files

- **Component source**: `packages/happy-app/sources/components/tools/modal/`
- **Integration**: `packages/happy-app/sources/components/tools/ToolView.tsx`
- **Tests**: `packages/happy-app/sources/components/tools/modal/__tests__/`
- **Content analyzer**: `packages/happy-app/sources/components/tools/adaptive/contentAnalyzer.ts`
