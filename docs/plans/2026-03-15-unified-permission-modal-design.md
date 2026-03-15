# Unified Floating Permission Modal

**Date**: 2026-03-15
**Status**: Design approved

## Problem

The permission sheet (`SessionPermissionSheet` → `PermissionSheetExpanded`) and the tool detail modal (`ToolModal`) are two separate UI systems that show the same tool data in different layouts. This creates:

- Divergent UIs to maintain (floating card vs bottom sheet)
- Duplicated content rendering (EditSheetContent vs DiffModalContent)
- Inconsistent visual language between "viewing a tool" and "approving a tool"

## Solution

Unify both into a **single floating card modal**. The tool modal becomes the universal tool viewer. When a permission is pending, a separate **Permission Action Bar** floats below the content card.

## Visual Design

### Floating Content Card (all tool modals)

```
┌─ Backdrop (semi-transparent) ──────────────┐
│                                             │
│  ╭─ Content Card ────────────────────────╮  │
│  │ [drag handle]                         │  │
│  │ Edit — src/utils.ts                 X │  │
│  │─────────────────────────────────────  │  │
│  │                                       │  │
│  │  (content router)                     │  │
│  │  DiffModal / Tabs / Agent / File      │  │
│  │                                       │  │
│  ╰───────────────────────────────────────╯  │
│                                             │
└─────────────────────────────────────────────┘
```

Style changes from current bottom sheet:
- All corners rounded (16px) — no longer pinned to bottom
- `marginHorizontal: 12` (gap from screen edges)
- `marginBottom` respects safe area
- Shadow on all sides
- Drag handle + resizable behavior preserved

### Permission Action Bar (separate floating card)

Only appears when `tool.permission.status === 'pending'`:

```
│  ╭─ Content Card ────────────────────────╮  │
│  │ ...tool content...                    │  │
│  ╰───────────────────────────────────────╯  │
│                 8px gap                      │
│  ╭─ Permission Action Bar ───────────────╮  │
│  │ "Editing utility file"                │  │
│  │ [Allow] [Suggestion] [Deny]  2 more   │  │
│  ╰───────────────────────────────────────╯  │
```

- Same horizontal margins as content card
- Rounded corners (16px), `surfaceHigh` background
- LLM summary text (italic, small) above buttons
- Buttons: Allow (green), Suggestions (blue), Deny (red)
- Queue badge: "N more" right-aligned
- Deny feedback: TextInput expands upward on tap

### Minimized Bar (simplified)

```
╭─────────────────────────────────────────╮
│ 🛡️ Edit — src/utils.ts   [Deny] [Allow] ▲ │
╰─────────────────────────────────────────╯
```

- **Universal**: All tool types get Allow/Deny buttons (no "Tap to expand" variant)
- **Subtitle**: Tool description shown below name
- **Chevron**: Expand back to full modal
- Pinned to bottom, top corners rounded, safe area padding

## Content Routing

```
ToolModal Content Router:
├─ Agent/Task                    → AgentModalContent (3-tab)
├─ Edit/MultiEdit                → DiffModalContent
├─ Read/Write                    → FileViewModalContent
├─ AskUserQuestion (pending)     → QuestionSheetContent (interactive form)
├─ ExitPlanMode (pending)        → PlanSheetContent (markdown)
└─ Regular                       → ToolModalTabs (INPUT/OUTPUT)
```

Hybrid approach: the tool modal shell houses specialized rich content components for interactive tools. AskUserQuestion keeps its radio buttons, preview pane, tabs, and submit/cancel. PlanSheetContent keeps scrollable markdown. Both are reformatted to fit inside the ToolModal content area.

Once resolved (completed tools), AskUserQuestion and ExitPlanMode fall back to standard ToolModalTabs INPUT/OUTPUT rendering.

## State Transitions

```
New permission arrives → Auto-open modal (spring slide-up)
Swipe down on modal   → Minimize to bar
Tap bar / chevron     → Expand to modal
Allow/Deny from bar   → Process, advance to next permission
Allow/Deny from modal → Process, advance to next permission
Close (X) on modal    → Minimize to bar (permission still pending)
```

## Component Changes

### Removed

| Component | Replaced by |
|---|---|
| `PermissionSheetExpanded.tsx` | ToolModal + PermissionActionBar |
| `EditSheetContent.tsx` | DiffModalContent (already exists) |
| `SessionPermissionSheet.tsx` | Orchestration moves into ToolModal or new wrapper |

### Modified

| Component | Change |
|---|---|
| `ToolModal.tsx` | Floating card style, accept permission prop, render action bar |
| `ToolView.tsx` | Auto-open modal for pending permissions |
| `PermissionSheetBar.tsx` | Simplified: universal Allow/Deny + description subtitle |
| `QuestionSheetContent.tsx` | Adapt to fit inside ToolModal content area |
| `PlanSheetContent.tsx` | Adapt to fit inside ToolModal content area |

### Unchanged

| Component | Reason |
|---|---|
| `PermissionBanner.tsx` | Separate system (cross-session in-app notifications) |
| `permissionSheetContext.ts` | Still suppresses inline PermissionFooter |
| `usePermissionActions.ts` | RPC dispatch unchanged |
| `useCurrentSessionPermissions.ts` | Data selector unchanged |
| All tool modal content components | DiffModalContent, AgentModalContent, FileViewModalContent, ToolModalTabs |

## Key Decisions

1. **Hybrid content routing**: Tool modal shell + keep specialized components (QuestionSheetContent, PlanSheetContent) for interactive tools. Reformatted to fit unified modal.
2. **All tool modals float**: Same floating card design for both permission and non-permission tool views. Only difference is the action bar appearing for pending permissions.
3. **Simplified minimized bar**: Universal Allow/Deny for all tool types (no "Tap to expand" variant). Description as subtitle.
4. **Action bar as separate element**: Floats below the content card, not inside it. Clean separation of read-only content from actions.
5. **Auto-open**: Permission modals auto-open on new permission (same as today).
