# ContentFormatter Architecture & Patterns

## Unified Content Type Detection

**Detection Order (CRITICAL — maintain this priority):**
1. JSON objects or JSON-parseable strings → `JsonRenderer`
2. Diff by markers (`---`, `+++`, `@@`) → `ToolDiffView`
3. Code by language patterns → `SimpleSyntaxHighlighter`
4. Markdown by headers, lists, bold, links → plain text with formatting
5. Plain text → default fallback

## Key Design Decisions

**Single Gray Box Pattern:**
- Parent component (VerticalParameterStack) provides gray background (surfaceRipple)
- ContentFormatter does NOT apply its own background (no double-boxing)
- Each parameter value wrapped once: gray box contains content
- Border radius 6px, padding 10px H / 8px V

**JSON String Unpacking (OutputContent):**
- Only unpack if: (1) string input, (2) parses to object, (3) has 2+ keys
- Single-key objects fall through to ContentFormatter (preserves ambiguity)
- Arrays and primitives always use ContentFormatter
- Prevents ambiguous single-result fields from being unpacked

**Type Detection Reliability:**
- Code detection uses language-specific patterns (const/let/def/import/function)
- Markdown detection requires specific markers (not heuristic)
- Diff detection requires at least one marker (not overly permissive)
- JSON detection validates parse success AND object/array type

## Implementation Files

**Core Components:**
- `ContentFormatter.tsx` — Main component with conditional renderers
- `detectContentType.ts` — Pure utility function (exported separately)
- `OutputContent.tsx` — Uses detectContentType + tryParseJsonString
- `VerticalParameterStack.tsx` — Wraps values in ContentFormatter

**Utilities:**
- `detectContentType(value: unknown): ContentType` — O(n) regex scanning
- `tryParseJsonString(value: unknown): object | undefined` — Safe JSON parsing
- `shouldUnpackJson(value: unknown): boolean` — 2+ key validation

## Test Patterns

**Unit Tests (detect function):**
- Test all 5 content types separately
- Test priority ordering (diff before code, JSON before markdown)
- Test edge cases (empty strings, whitespace, very long strings)
- Test type coercion (arrays → text, primitives → text)

**Integration Tests:**
- Test component rendering for each content type
- Test tab switching and parameter counts
- Test JSON unpacking in OutputContent flow
- Test styling consistency (gray boxes, spacing)

## Common Issues & Solutions

**Double-Box Styling:**
- Problem: Parent + ContentFormatter both apply backgrounds
- Solution: Remove backgroundColor from ContentFormatter container
- Pattern: Parent provides box, child is agnostic to styling

**Output Count Calculation:**
- Old bug: `Object.keys(tool.result).length` counts string characters
- Solution: Check `typeof result === 'object' && !Array.isArray(result)` first
- Implementation: Only count keys if it's a plain object

**JSON String Edge Cases:**
- Arrays in JSON strings: detect as JSON but don't unpack (use ContentFormatter)
- Single-key objects: don't unpack (fall through to ContentFormatter)
- Primitive JSON values: detect as JSON but render as-is (ContentFormatter handles)

## Performance Notes

- detectContentType is O(n) but runs on every value render (acceptable for output)
- JSON.parse() wrapped in try/catch, safe to use
- Object.keys().length is O(n) but typical objects have <20 keys
- Scrollable containers used for all content types (consistent UX)

## Migration Guide

If updating an existing tool component to use ContentFormatter:
1. Import `ContentFormatter` and `detectContentType`
2. Wrap value in `<ContentFormatter value={value} />`
3. Remove inline JSON stringification or special-case rendering
4. Remove double-box styling (parent provides background)
5. Verify scrolling works for long content
