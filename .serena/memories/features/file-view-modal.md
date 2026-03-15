# File View Modal (Read/Write Tool Display)

## Overview
`FileViewModalContent.tsx` displays Read and Write tool results with syntax highlighting, line numbers, and a wrap toggle. Routes from `ToolModal.tsx` via `FILE_VIEW_TOOLS = new Set(['Read', 'Write'])`.

## Architecture: Dual ScrollView Double-Buffer

Flicker-free wrap toggle using two always-mounted `Animated.ScrollView` instances:

- **Wrapped view**: `Animated.ScrollView` > `CodeLines` (text wraps naturally)
- **Unwrapped view**: `Animated.ScrollView` > `ScrollView horizontal` > `CodeLines`
- Both use `RNStyleSheet.absoluteFill` in a shared container
- `activeIsWrapped` shared value (0 or 1) drives `useAnimatedStyle` for opacity + zIndex
- On toggle: `runOnUI` worklet atomically scrolls hidden view to correct line + flips shared value — same UI frame, zero flicker
- Each view has independent scroll tracking (`useAnimatedScrollHandler` → shared value) and row Y measurements (`onLayout` → ref array)
- `findTopVisibleLine()` binary search returns `{ index, offset }` for sub-line precision

## Data Extraction

- `extractReadData()`: Handles string, array (content blocks), and nested object wire formats. Strips `cat -n` line numbers (regex: `/^\s*(\d+)[\t\u2192](.*)$/` — separator is U+2192 arrow)
- `extractWriteData()`: Uses `knownTools.Write.input` Zod schema
- Both return `FileViewData` with content, filePath, language, startLine, numLines, totalLines, isPartialRead

## Key Files
- `FileViewModalContent.tsx` — main component + extraction logic + `WrapToggleButton` (shared with DiffModalContent)
- `DiffModalContent.tsx` — also uses `WrapToggleButton` and `useSettingMutable('wrapLinesInDiffs')`
- `languageFromPath.ts` — extension → language mapping for syntax highlighting
- `__tests__/FileViewModalContent.test.tsx` — 36 tests (extraction, rendering, wire format handling)

## Gotchas
- Both views always render all code lines (2x rendering cost) — acceptable trade-off for flicker-free toggle
- Row Y positions are JS-side refs, scroll positions are UI-thread shared values — toggle reads shared values from JS (slightly stale but fine for user-initiated action)
- Test mock must include `Platform`, `StyleSheet.absoluteFill`, and `react-native-reanimated` mock with `useSharedValue`, `useAnimatedStyle`, `useAnimatedScrollHandler`, `useAnimatedRef`, `scrollTo`, `runOnUI`
