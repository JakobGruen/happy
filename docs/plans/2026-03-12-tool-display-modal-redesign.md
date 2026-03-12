# Tool Display Modal Redesign

**Date**: 2026-03-12  
**Status**: Design Approved  
**Branch**: `tool-display-redesign` (worktree)

## Overview

Redesign the Happy Coder tool display system to improve UX by:
1. Minimizing tools in chat view (2-line static preview only)
2. Providing detailed inspection via bottom-sheet modal (INPUT/OUTPUT tabs)
3. Simplifying layout with vertical stacks instead of complex grids
4. Making tool details scannable and context-aware

**Key Principle**: Tools in chat are compact previews; detailed inspection happens in a dedicated modal.

---

## Architecture

```
ToolView (chat context)
  ├─ 2-Line Static Preview (always visible)
  │   └─ OnTap → Opens ToolModal
  └─ (No inline expansion/collapse)

ToolModal (bottom sheet)
  ├─ INPUT Tab
  │   └─ VerticalStackLayout (parameter stacks)
  └─ OUTPUT Tab
      └─ VerticalStackLayout (result stacks)
      
VariableFormatter (for both tabs)
  ├─ Simple values: inline display
  ├─ Nested JSON: syntax-highlighted code block
  └─ Long values: collapsible with syntax highlighting
```

---

## Design Details

### 1. Chat View: 2-Line Static Preview

**Location**: `ToolView.tsx`  
**Behavior**: Always visible, no collapse/expand button

```
┌─────────────────────────────────────┐
│ [icon] Read File           [status] │ ← Line 1
│ packages/happy-app/sources/c...     │ ← Line 2
└─────────────────────────────────────┘
         ↓ Tap to open modal
```

**Content**:
- **Line 1**: Icon + tool name + status badge (e.g., "✓", "⊙", "⚠")
- **Line 2**: First line of output/content, truncated to ~50 chars
  - For empty/null output: show first parameter value instead
  - For large content: show content type badge (e.g., "TypeScript • 4.2KB")

**Styling**:
- Background: `theme.colors.surfaceHigh`
- Border: subtle divider
- No chevron/expand button

---

### 2. Modal: Bottom Sheet with Tabs

**Presentation**:
- Slide up from bottom with semi-transparent backdrop
- Can swipe down to dismiss
- Supports landscape/portrait orientation

**Tabs**:
- **INPUT**: Parameters stacked vertically
- **OUTPUT**: Results stacked vertically
- Both tabs scroll independently when needed

```
┌─────────────────────────────────┐
│  INPUT  |  OUTPUT              │ ← Tab headers
├─────────────────────────────────┤
│ Scrollable content (independent│
│ scroll per tab)                 │
│                                 │
│                                 │
└─────────────────────────────────┘
```

---

### 3. Tab Content: Vertical Stack Layout

**Both INPUT and OUTPUT tabs use the same layout**:

```
Parameter Name
Parameter Value (or nested JSON code block)

Next Parameter Name
Next Parameter Value
```

**Value Rendering**:
- **Simple values** (string, number, boolean): inline text
  - Short (<80 chars): always inline
  - Long (>80 chars): collapsible with chevron + syntax highlighting
- **Nested objects/arrays**: Rendered as syntax-highlighted JSON code block
- **Empty/null**: Shown as `<empty>` or `null` placeholder
- **Large nested JSON**: Code block with scroll if content exceeds 500px height

**Syntax Highlighting**:
- Detect language automatically (JSON, TypeScript, Python, YAML, SQL, etc.)
- Use `SimpleSyntaxHighlighter` component
- Make text selectable for copy-paste

---

### 4. Permission Handling in Modal

**Permission Pending**:
- Show INPUT tab with all parameters
- OUTPUT tab disabled/hidden (user hasn't approved yet, no result yet)
- Show permission action buttons (Allow/Deny)

**Permission Approved/Denied**:
- Both tabs visible with full content
- Status indicator in header (e.g., "✓ Approved" or "✗ Denied")

**Permission Error (denied with reason)**:
- Show INPUT + reason badge
- OUTPUT hidden

---

## Component Changes

### New Components

1. **`ToolModal.tsx`** (NEW)
   - Bottom sheet container
   - Manages tab state
   - Handles swipe-to-dismiss

2. **`ToolModalTabs.tsx`** (NEW)
   - Tab header navigation
   - Switches between INPUT/OUTPUT
   - Shows tab labels with parameter counts

3. **`VerticalParameterStack.tsx`** (NEW)
   - Renders parameter name + value stacks
   - Handles nested JSON rendering
   - Implements collapsible logic for long values

### Modified Components

1. **`ToolView.tsx`**
   - Remove expand/collapse button and logic
   - Replace inline AdaptiveToolDisplay with static 2-line preview
   - Add onPress handler to open ToolModal

2. **`VariableFormatter.tsx`**
   - Adapt to work in vertical stack context (no grid)
   - Simplify to single-column layout
   - Keep syntax highlighting and nesting logic

3. **`AdaptiveToolDisplay.tsx`**
   - If still needed: scale down to preview-only mode
   - OR: Replace entirely with new VerticalParameterStack

### Removed Components

- `ToolIOTabs.tsx` (multi-column grid logic replaced with vertical stacks)
- `ContentPreview.tsx` (logic moved into 2-line preview in ToolView)

---

## Data Flow

```
User taps 2-line preview in chat
  ↓
ToolView.onPress → router.push() to modal route
  ↓
ToolModal mounts with tool data
  ↓
ToolModalTabs renders active tab (INPUT or OUTPUT)
  ↓
VerticalParameterStack maps parameters → VariableFormatter
  ↓
VariableFormatter renders each value (inline or code block)
  ↓
User sees formatted, scrollable parameters
```

---

## Visual Specifications

### Preview Card (Chat View)
- **Height**: ~56px (2 lines + padding)
- **Padding**: 12px
- **Border radius**: 8px
- **Font**:
  - Line 1: 14px, weight 500
  - Line 2: 13px, secondary color, truncated

### Modal (Bottom Sheet)
- **Max height**: 80% of screen (user can still see chat behind)
- **Min height**: 300px
- **Tab header height**: 44px
- **Content padding**: 12px horizontal, 8px vertical
- **Scroll behavior**: Independent per tab

### Parameter Stack
- **Name font**: 13px, weight 500, secondary color
- **Value font**: 13px, monospace (for code), primary color
- **Spacing**: 4px between name and value, 12px between parameters
- **Code block**: 
  - Background: `theme.colors.surfaceHighest`
  - Padding: 8px
  - Border radius: 4px
  - Max height: 500px with scroll

---

## Behaviors & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Tool running | Show spinner in preview, INPUT/OUTPUT tabs empty until complete |
| Tool has no output | Show "–" or "<empty>" on preview line 2 |
| Large output (>1000px) | Code block scrolls within modal tab |
| No parameters (rare) | Show "No parameters" placeholder |
| Permission pending | Modal shows INPUT only, OUTPUT disabled |
| Complex nested JSON | Render as collapsible code block |
| Very long parameter names | Truncate with ellipsis in parameter name row |

---

## Implementation Phases

**Phase 1**: Create new modal components (ToolModal, ToolModalTabs, VerticalParameterStack)  
**Phase 2**: Modify ToolView to show 2-line preview + tap handler  
**Phase 3**: Adapt VariableFormatter for vertical layout  
**Phase 4**: Remove old AdaptiveToolDisplay and ToolIOTabs (if safe)  
**Phase 5**: Test across tool types (Read, Write, Edit, Bash, MCP tools)  
**Phase 6**: Polish animations, scrolling behavior, and edge cases  

---

## Success Criteria

✅ Tools in chat show compact 2-line preview only  
✅ Tapping preview opens bottom sheet modal with INPUT/OUTPUT tabs  
✅ Both tabs use vertical stack layout (not grid)  
✅ Nested JSON renders as syntax-highlighted code blocks  
✅ Permission modals work (INPUT visible, OUTPUT hidden when pending)  
✅ No inline expansion/collapse in chat view  
✅ Modal swipes down to dismiss  
✅ Text in modal is selectable (copy-paste enabled)  
✅ Works across all tool types (Read, Write, Edit, Bash, MCP, etc.)  
✅ Responsive on mobile and tablet  

---

## Notes & Considerations

- **Navigation**: Modal opens via `router.push()` to modal route (not inline overlay)
- **Bottom sheet library**: Use existing RN bottom sheet or custom implementation (check `_layout.tsx`)
- **Permissions**: Permission buttons stay in modal (not floating)
- **Scrolling**: Both modal tabs scroll independently (not the whole modal)
- **Safe area**: Respect top/bottom safe areas on notched devices
- **Performance**: Lazy render OUTPUT tab until user taps it (if needed)
