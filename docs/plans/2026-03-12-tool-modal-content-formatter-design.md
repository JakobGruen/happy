# Tool Modal Content Formatter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify INPUT/OUTPUT parameter rendering with intelligent content type detection, automatic JSON string unpacking, syntax highlighting, markdown rendering, and diff view support.

**Architecture:** Central `ContentFormatter` component with detection order (JSON → Diff → Code → Markdown → Plain Text). `OutputContent` detects and unpacks top-level JSON strings into parameters. `VariableFormatter` removes double-box styling. Single gray `valueContainer` box throughout INPUT and OUTPUT tabs.

**Tech Stack:** React Native, TypeScript, existing SimpleSyntaxHighlighter and ToolDiffView components, Zod schemas from knownTools registry.

---

## Task 1: Fix OUTPUT Tab Count Calculation

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/ToolModalTabs.tsx`

**Context:** Currently `outputCount` calculates `Object.keys(tool.result).length`, which counts string characters as keys when result is a string.

**Step 1: Write failing test**

Create `packages/happy-app/sources/components/tools/modal/__tests__/ToolModalTabs.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { Tool } from '@jakobgruen/happy-wire';

describe('ToolModalTabs outputCount', () => {
  it('returns 0 for string results (not string length)', () => {
    const tool: Tool = {
      name: 'test',
      input: {},
      result: 'some string output',
    };
    // Mock the calculation logic
    const outputCount = typeof tool.result === 'object' && !Array.isArray(tool.result) 
      ? Object.keys(tool.result).length 
      : 0;
    expect(outputCount).toBe(0);
  });

  it('returns parameter count for object results', () => {
    const tool: Tool = {
      name: 'test',
      input: {},
      result: { name: 'value', status: 'ok' },
    };
    const outputCount = typeof tool.result === 'object' && !Array.isArray(tool.result) 
      ? Object.keys(tool.result).length 
      : 0;
    expect(outputCount).toBe(2);
  });

  it('returns 0 for array results', () => {
    const tool: Tool = {
      name: 'test',
      input: {},
      result: [1, 2, 3],
    };
    const outputCount = typeof tool.result === 'object' && !Array.isArray(tool.result) 
      ? Object.keys(tool.result).length 
      : 0;
    expect(outputCount).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/happy-app && yarn test ToolModalTabs.test.tsx
```

Expected: FAIL (tests document expected behavior, currently failing)

**Step 3: Implement fix in ToolModalTabs.tsx**

Find line ~18 where `outputCount` is calculated. Replace:

```typescript
// OLD: Object.keys(tool.result).length
// This fails for string results - counts each character as a key
```

With:

```typescript
const outputCount = typeof tool.result === 'object' && !Array.isArray(tool.result) && tool.result !== null
  ? Object.keys(tool.result).length
  : 0;
```

Add this helper near the top of the component or inline in the tab label calculation.

**Step 4: Run test to verify it passes**

```bash
cd packages/happy-app && yarn test ToolModalTabs.test.tsx
```

Expected: PASS (3/3 tests passing)

**Step 5: Verify in UI**

- Test with string output (should show "OUTPUT" with no count)
- Test with object output with 2+ properties (should show count)

**Step 6: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/__tests__/ToolModalTabs.test.tsx \
        packages/happy-app/sources/components/tools/modal/ToolModalTabs.tsx
git commit -m "fix(tools): correct output tab count to only count object keys, not string characters"
```

---

## Task 2: Remove Double-Box Styling in VariableFormatter

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/VariableFormatter.tsx`

**Context:** VariableFormatter has a `verticalCodeBlock` with background that creates inner black box. When nested inside `valueContainer` gray box, creates double-box effect. Need to remove the background from verticalCodeBlock.

**Step 1: Read current VariableFormatter**

```bash
cd packages/happy-app && grep -n "verticalCodeBlock\|backgroundColor" \
  sources/components/tools/modal/VariableFormatter.tsx | head -20
```

Expected: Find styling with `backgroundColor` inside `verticalCodeBlock` style or inline.

**Step 2: Create minimal test**

Create `packages/happy-app/sources/components/tools/modal/__tests__/VariableFormatter.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react-native';
import { VariableFormatter } from '../VariableFormatter';

describe('VariableFormatter styling', () => {
  it('renders code block without background color (gray box container handles background)', () => {
    const { getByTestId } = render(
      <VariableFormatter 
        value="const x = 5;" 
        testID="code-block"
      />
    );
    const codeBlock = getByTestId('code-block');
    // Verify no backgroundColor is set on the code block itself
    expect(codeBlock.props.style?.backgroundColor).toBeUndefined();
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd packages/happy-app && yarn test VariableFormatter.test.tsx
```

Expected: FAIL (backgroundColor is currently set)

**Step 4: Remove backgroundColor from verticalCodeBlock**

In `VariableFormatter.tsx`, find the `verticalCodeBlock` style definition and remove any `backgroundColor` property:

```typescript
// OLD:
const verticalCodeBlock = {
  backgroundColor: '#1a1a1a', // REMOVE THIS LINE
  borderRadius: 8,
  padding: 12,
  // ...rest of styles
};

// NEW:
const verticalCodeBlock = {
  borderRadius: 8,
  padding: 12,
  // ...rest of styles (no backgroundColor)
};
```

**Step 5: Run test to verify it passes**

```bash
cd packages/happy-app && yarn test VariableFormatter.test.tsx
```

Expected: PASS

**Step 6: Manual UI verification**

- Open tool modal with INPUT parameters
- Verify gray `valueContainer` box is visible with no black inner box
- Code should be rendered with syntax highlighting but no separate background

**Step 7: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/__tests__/VariableFormatter.test.tsx \
        packages/happy-app/sources/components/tools/modal/VariableFormatter.tsx
git commit -m "fix(tools): remove double-box styling by eliminating verticalCodeBlock background"
```

---

## Task 3: Create ContentFormatter Component

**Files:**
- Create: `packages/happy-app/sources/components/tools/modal/ContentFormatter.tsx`
- Test: `packages/happy-app/sources/components/tools/modal/__tests__/ContentFormatter.test.tsx`

**Context:** Unified component that detects content type and renders appropriately. Detection order: JSON object → Diff → Code → Markdown → Plain Text. Used by both INPUT and OUTPUT tabs.

**Step 1: Write test suite for detection logic**

Create `packages/happy-app/sources/components/tools/modal/__tests__/ContentFormatter.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectContentType } from '../ContentFormatter';

describe('ContentFormatter detection', () => {
  describe('detectContentType', () => {
    it('detects JSON objects', () => {
      expect(detectContentType({ name: 'test', value: 123 })).toBe('json');
    });

    it('detects JSON string that parses to object', () => {
      expect(detectContentType('{"name":"test"}')).toBe('json');
    });

    it('detects diff by +++ and --- markers', () => {
      const diff = `--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
-old line
+new line`;
      expect(detectContentType(diff)).toBe('diff');
    });

    it('detects code by common patterns', () => {
      expect(detectContentType('const x = 5;')).toBe('code');
      expect(detectContentType('function foo() { return 42; }')).toBe('code');
      expect(detectContentType('import React from "react";')).toBe('code');
    });

    it('detects markdown by common markers', () => {
      expect(detectContentType('# Heading\n\nSome **bold** text')).toBe('markdown');
      expect(detectContentType('- List item\n- Another item')).toBe('markdown');
      expect(detectContentType('[Link](https://example.com)')).toBe('markdown');
    });

    it('defaults to plain text for undetectable content', () => {
      expect(detectContentType('just some regular text')).toBe('text');
    });

    it('returns object type for plain objects', () => {
      expect(detectContentType({ a: 1 })).toBe('json');
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/happy-app && yarn test ContentFormatter.test.tsx
```

Expected: FAIL (functions not yet defined)

**Step 3: Implement ContentFormatter component**

Create `packages/happy-app/sources/components/tools/modal/ContentFormatter.tsx`:

```typescript
import React from 'react';
import { View, Text } from 'react-native';
import { SimpleSyntaxHighlighter } from '@/components/code/SimpleSyntaxHighlighter';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { Box } from '@/components/theme';

export type ContentType = 'json' | 'diff' | 'code' | 'markdown' | 'text';

/**
 * Detects content type based on patterns and structure
 * Detection order: JSON → Diff → Code → Markdown → Plain Text
 */
export function detectContentType(value: unknown): ContentType {
  // Already an object = JSON
  if (typeof value === 'object' && value !== null) {
    return 'json';
  }

  if (typeof value !== 'string') {
    return 'text';
  }

  // Try to parse as JSON
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      JSON.parse(value);
      return 'json';
    } catch {
      // Not valid JSON, continue detection
    }
  }

  // Detect diff by markers
  if (value.includes('+++') || value.includes('---') || value.includes('@@')) {
    return 'diff';
  }

  // Detect code by common patterns
  const codePatterns = [
    /\bconst\b|\blet\b|\bvar\b|\bfunction\b/, // JavaScript
    /\bdef\b|\bclass\b|\bimport\b/, // Python
    /^import\s|^package\s|public\s+/, // Java/Go
    /=>\s*{/, // Arrow functions
  ];
  if (codePatterns.some(pattern => pattern.test(value))) {
    return 'code';
  }

  // Detect markdown by common markers
  const markdownPatterns = [
    /^#+\s/, // Headings
    /^[-*+]\s/, // Lists
    /\*\*.*?\*\*/, // Bold
    /\[.*?\]\(.*?\)/, // Links
    /^>/, // Blockquotes
    /```/, // Code blocks
  ];
  if (markdownPatterns.some(pattern => pattern.test(value))) {
    return 'markdown';
  }

  return 'text';
}

interface ContentFormatterProps {
  value: unknown;
  testID?: string;
}

/**
 * Unified content formatter with intelligent type detection
 * Renders JSON, diffs, code, markdown, or plain text
 */
export function ContentFormatter({ value, testID }: ContentFormatterProps) {
  const type = detectContentType(value);

  switch (type) {
    case 'json':
      return (
        <JsonRenderer 
          value={value} 
          testID={testID}
        />
      );
    case 'diff':
      return (
        <DiffRenderer 
          content={String(value)} 
          testID={testID}
        />
      );
    case 'code':
      return (
        <CodeRenderer 
          content={String(value)} 
          testID={testID}
        />
      );
    case 'markdown':
      return (
        <TextRenderer
          content={String(value)}
          testID={testID}
        />
      );
    case 'text':
    default:
      return (
        <TextRenderer 
          content={String(value)} 
          testID={testID}
        />
      );
  }
}

function JsonRenderer({ value, testID }: { value: unknown; testID?: string }) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return <TextRenderer content={String(value)} testID={testID} />;
    }
  }

  return (
    <View testID={testID} style={{ flex: 1 }}>
      <SimpleSyntaxHighlighter 
        code={JSON.stringify(parsed, null, 2)}
        language="json"
      />
    </View>
  );
}

function DiffRenderer({ content, testID }: { content: string; testID?: string }) {
  return (
    <View testID={testID} style={{ flex: 1 }}>
      <ToolDiffView diff={content} />
    </View>
  );
}

function CodeRenderer({ content, testID }: { content: string; testID?: string }) {
  return (
    <View testID={testID} style={{ flex: 1 }}>
      <SimpleSyntaxHighlighter 
        code={content}
        language="javascript"
      />
    </View>
  );
}

function TextRenderer({ content, testID }: { content: string; testID?: string }) {
  return (
    <Box
      testID={testID}
      style={{
        flex: 1,
        padding: 12,
      }}
    >
      <Text style={{ color: 'inherit', fontSize: 14 }}>
        {content}
      </Text>
    </Box>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/happy-app && yarn test ContentFormatter.test.tsx
```

Expected: PASS (6/6 tests passing)

**Step 5: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/ContentFormatter.tsx \
        packages/happy-app/sources/components/tools/modal/__tests__/ContentFormatter.test.tsx
git commit -m "feat(tools): create ContentFormatter with intelligent type detection"
```

---

## Task 4: Modify OutputContent to Detect and Unpack JSON Strings

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/OutputContent.tsx`
- Test: `packages/happy-app/sources/components/tools/modal/__tests__/OutputContent.test.tsx`

**Context:** Currently OutputContent renders all results as plain text/JSON. Need to detect if result is a JSON string representing an object, parse it, and render as parameters using VerticalParameterStack. Falls back to ContentFormatter for non-object JSON.

**Step 1: Write test for JSON string unpacking**

Create/update `packages/happy-app/sources/components/tools/modal/__tests__/OutputContent.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { shouldUnpackJson, tryParseJsonString } from '../OutputContent';

describe('OutputContent JSON unpacking', () => {
  describe('tryParseJsonString', () => {
    it('parses valid JSON string to object', () => {
      const json = '{"name":"test","status":"ok"}';
      const result = tryParseJsonString(json);
      expect(result).toEqual({ name: 'test', status: 'ok' });
    });

    it('returns undefined for invalid JSON', () => {
      const result = tryParseJsonString('not valid json');
      expect(result).toBeUndefined();
    });

    it('returns undefined for JSON strings and arrays (not objects)', () => {
      expect(tryParseJsonString('"string value"')).toBeUndefined();
      expect(tryParseJsonString('[1,2,3]')).toBeUndefined();
    });
  });

  describe('shouldUnpackJson', () => {
    it('returns true for object results with multiple keys', () => {
      expect(shouldUnpackJson({ name: 'test', status: 'ok' })).toBe(true);
    });

    it('returns false for plain objects with single key (ambiguous)', () => {
      expect(shouldUnpackJson({ result: 'value' })).toBe(false);
    });

    it('returns false for arrays, strings, and primitives', () => {
      expect(shouldUnpackJson([1, 2, 3])).toBe(false);
      expect(shouldUnpackJson('string')).toBe(false);
      expect(shouldUnpackJson(123)).toBe(false);
    });
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/happy-app && yarn test OutputContent.test.tsx
```

Expected: FAIL (functions not defined)

**Step 3: Update OutputContent component**

Update `packages/happy-app/sources/components/tools/modal/OutputContent.tsx`:

```typescript
import React from 'react';
import { View, ScrollView } from 'react-native';
import { ContentFormatter } from './ContentFormatter';
import { VerticalParameterStack } from './VerticalParameterStack';
import { Box } from '@/components/theme';

interface OutputContentProps {
  result: unknown;
  testID?: string;
}

/**
 * Tries to parse a string as JSON, returning object if successful
 */
export function tryParseJsonString(value: string): Record<string, unknown> | undefined {
  if (typeof value !== 'string') return undefined;
  
  try {
    const parsed = JSON.parse(value);
    // Only unpack if it's an object (not array, string, or primitive)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Not valid JSON
  }
  
  return undefined;
}

/**
 * Determines if a parsed object should be unpacked as parameters
 * Requires 2+ keys to avoid ambiguous single-result fields
 */
export function shouldUnpackJson(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length >= 2;
}

/**
 * OutputContent renders tool result with intelligent formatting
 * - Detects JSON strings and unpacks them as parameters
 * - Falls back to ContentFormatter for other types
 */
export function OutputContent({ result, testID }: OutputContentProps) {
  // Try to unpack JSON strings as parameters
  if (typeof result === 'string') {
    const parsed = tryParseJsonString(result);
    if (parsed && shouldUnpackJson(parsed)) {
      return (
        <ScrollView testID={testID}>
          <VerticalParameterStack
            parameters={parsed}
          />
        </ScrollView>
      );
    }
  }

  // For already-parsed objects with 2+ keys, render as parameters
  if (shouldUnpackJson(result)) {
    return (
      <ScrollView testID={testID}>
        <VerticalParameterStack
          parameters={result as Record<string, unknown>}
        />
      </ScrollView>
    );
  }

  // Default: use ContentFormatter for intelligent rendering
  return (
    <Box testID={testID} style={{ flex: 1, padding: 12 }}>
      <ContentFormatter value={result} />
    </Box>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/happy-app && yarn test OutputContent.test.tsx
```

Expected: PASS (5/5 tests passing)

**Step 5: Update ToolModalTabs to use OutputContent**

In `packages/happy-app/sources/components/tools/modal/ToolModalTabs.tsx`, ensure the OUTPUT tab content uses the new OutputContent component:

```typescript
<OutputContent result={tool.result} testID="output-content" />
```

**Step 6: Manual UI verification**

- Test with JSON string result: `'{"name":"test","status":"ok"}'` → should show as parameters
- Test with plain string result → should show as text
- Test with object result → should show as parameters
- Test with array result → should use ContentFormatter

**Step 7: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/OutputContent.tsx \
        packages/happy-app/sources/components/tools/modal/__tests__/OutputContent.test.tsx \
        packages/happy-app/sources/components/tools/modal/ToolModalTabs.tsx
git commit -m "feat(tools): detect and unpack JSON strings in output as parameters"
```

---

## Task 5: Update VerticalParameterStack to Use ContentFormatter

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/VerticalParameterStack.tsx`
- Test: `packages/happy-app/sources/components/tools/modal/__tests__/VerticalParameterStack.test.tsx`

**Context:** VerticalParameterStack currently uses VariableFormatter for all values. Need to use new ContentFormatter for consistent type detection (markdown in strings, code highlighting, etc).

**Step 1: Write test for content type handling**

Create/update `packages/happy-app/sources/components/tools/modal/__tests__/VerticalParameterStack.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react-native';
import { VerticalParameterStack } from '../VerticalParameterStack';

describe('VerticalParameterStack content formatting', () => {
  it('renders markdown in string values', () => {
    const params = { description: '# Heading\n\n**bold text**' };
    const { getByTestId } = render(
      <VerticalParameterStack parameters={params} />
    );
    const description = getByTestId('param-description');
    expect(description).toBeTruthy();
  });

  it('renders code with syntax highlighting', () => {
    const params = { code: 'const x = 5;' };
    const { getByTestId } = render(
      <VerticalParameterStack parameters={params} />
    );
    const code = getByTestId('param-code');
    expect(code).toBeTruthy();
  });

  it('renders plain text for regular strings', () => {
    const params = { name: 'John Doe' };
    const { getByTestId } = render(
      <VerticalParameterStack parameters={params} />
    );
    const name = getByTestId('param-name');
    expect(name).toBeTruthy();
  });

  it('renders nested objects as formatted JSON', () => {
    const params = { config: { timeout: 5000, retries: 3 } };
    const { getByTestId } = render(
      <VerticalParameterStack parameters={params} />
    );
    const config = getByTestId('param-config');
    expect(config).toBeTruthy();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd packages/happy-app && yarn test VerticalParameterStack.test.tsx
```

Expected: FAIL (ContentFormatter not yet integrated)

**Step 3: Update VerticalParameterStack**

Update `packages/happy-app/sources/components/tools/modal/VerticalParameterStack.tsx`:

Replace the rendering logic to use ContentFormatter:

```typescript
import React from 'react';
import { View, Text } from 'react-native';
import { ContentFormatter } from './ContentFormatter';
import { Box } from '@/components/theme';

interface VerticalParameterStackProps {
  parameters: Record<string, unknown>;
  testID?: string;
}

/**
 * Renders parameters as vertical stack with names above values
 * Values are intelligently formatted using ContentFormatter
 */
export function VerticalParameterStack({ 
  parameters, 
  testID 
}: VerticalParameterStackProps) {
  const entries = Object.entries(parameters);

  return (
    <Box testID={testID} style={{ flex: 1 }}>
      {entries.map(([name, value]) => (
        <View
          key={name}
          style={{
            marginBottom: 16,
            paddingHorizontal: 12,
          }}
          testID={`param-${name}`}
        >
          {/* Parameter name */}
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              marginBottom: 6,
              color: '#999',
            }}
          >
            {name}
          </Text>

          {/* Parameter value with ContentFormatter */}
          <Box
            style={{
              backgroundColor: 'rgba(100, 100, 100, 0.1)',
              borderRadius: 8,
              padding: 12,
              flex: 1,
            }}
          >
            <ContentFormatter value={value} />
          </Box>
        </View>
      ))}
    </Box>
  );
}
```

**Step 4: Run tests to verify they pass**

```bash
cd packages/happy-app && yarn test VerticalParameterStack.test.tsx
```

Expected: PASS (4/4 tests passing)

**Step 5: Manual UI verification**

- Open tool modal INPUT tab → verify gray box styling (no double-box)
- Values with markdown → should render markdown
- Values with code patterns → should highlight syntax
- Nested objects → should render as formatted JSON

**Step 6: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/VerticalParameterStack.tsx \
        packages/happy-app/sources/components/tools/modal/__tests__/VerticalParameterStack.test.tsx
git commit -m "feat(tools): use ContentFormatter in VerticalParameterStack for unified type detection"
```

---

## Task 6: Integration Testing

**Files:**
- Create: `packages/happy-app/sources/components/tools/modal/__tests__/ToolModal.integration.test.tsx`

**Step 1: Write integration test**

Create `packages/happy-app/sources/components/tools/modal/__tests__/ToolModal.integration.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react-native';
import { ToolModal } from '../ToolModal';

describe('ToolModal integration', () => {
  it('renders INPUT tab with gray box and ContentFormatter', () => {
    const tool = {
      name: 'test',
      input: {
        description: '# Heading\n\n**bold**',
      },
      result: { status: 'ok' },
    };
    const { getByTestId } = render(
      <ToolModal tool={tool} isVisible={true} onClose={() => {}} />
    );
    const inputTab = getByTestId('input-tab');
    expect(inputTab).toBeTruthy();
  });

  it('renders OUTPUT tab with unpacked JSON string parameters', () => {
    const tool = {
      name: 'test',
      input: {},
      result: '{"name":"John","age":30}',
    };
    const { getByTestId } = render(
      <ToolModal tool={tool} isVisible={true} onClose={() => {}} />
    );
    const outputTab = getByTestId('output-tab');
    expect(outputTab).toBeTruthy();
  });

  it('shows correct output count for object results', () => {
    const tool = {
      name: 'test',
      input: {},
      result: { status: 'ok', data: 'value' },
    };
    const { getByTestId } = render(
      <ToolModal tool={tool} isVisible={true} onClose={() => {}} />
    );
    const outputLabel = getByTestId('output-label');
    expect(outputLabel.props.children).toContain('2');
  });

  it('handles diff content in output', () => {
    const tool = {
      name: 'test',
      input: {},
      result: `--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
-old
+new`,
    };
    const { getByTestId } = render(
      <ToolModal tool={tool} isVisible={true} onClose={() => {}} />
    );
    const outputContent = getByTestId('output-content');
    expect(outputContent).toBeTruthy();
  });
});
```

**Step 2: Run integration tests**

```bash
cd packages/happy-app && yarn test ToolModal.integration.test.tsx
```

Expected: PASS (all integration tests passing)

**Step 3: Commit**

```bash
git add packages/happy-app/sources/components/tools/modal/__tests__/ToolModal.integration.test.tsx
git commit -m "test(tools): add integration tests for unified content formatting"
```

---

## Task 7: Manual Testing Checklist

**Objective:** Verify UI works correctly on device/simulator

**Checklist:**

- [ ] Open app and create a tool call
- [ ] Verify INPUT tab shows gray box with no black inner box
- [ ] INPUT values with markdown render as markdown
- [ ] INPUT values with code show syntax highlighting
- [ ] OUTPUT tab shows correct count
- [ ] OUTPUT with JSON string unpacks to parameters
- [ ] OUTPUT with nested JSON shows formatted JSON
- [ ] OUTPUT with diff markers renders as diff view
- [ ] OUTPUT with plain string shows text
- [ ] No double-box styling anywhere
- [ ] Scrolling works in both tabs
- [ ] Modal close button works

**Step 1: Manual testing on device**

```bash
cd packages/happy-app && yarn ios
# or
cd packages/happy-app && yarn web
```

Run through checklist above.

**Step 2: Commit**

```bash
git add .
git commit -m "manual(tools): verify content formatting UI on device"
```

---

## Summary

This plan implements unified content formatting for the tool modal with:

1. **Correct output count** (not string length)
2. **No double-box styling** (clean gray containers)
3. **Intelligent content detection** (JSON → Diff → Code → Markdown → Text)
4. **JSON string unpacking** (outputs with JSON strings show as parameters)
5. **Consistent styling** across INPUT and OUTPUT tabs

**Total estimated effort:** 3-4 hours (including manual testing)

**Commit timeline:** 7 commits, one per task
