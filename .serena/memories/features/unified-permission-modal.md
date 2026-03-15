# Unified Permission Modal — Feature Architecture

## Overview
Permission requests now reuse the same floating card tool modal as completed tool views, with a `PermissionActionBar` rendered as a sibling card below. This replaces the old separate `PermissionSheetExpanded` flow for Claude sessions.

## Architecture

### Data Flow
1. `ToolView.tsx` detects `tool.permission?.status === 'pending'` → auto-opens modal
2. `ToolModal.tsx` routes content: pending AskUserQuestion → `QuestionSheetContent`, pending ExitPlanMode → `PlanSheetContent`, pending FILE_VIEW_TOOLS → falls through to `ToolModalTabs` (not `FileViewModalContent`)
3. `PermissionActionBar` renders as sibling View below the card (not child), with safe-area margin distribution
4. On resolution (approved/denied/canceled) → useEffect auto-closes modal

### Key Components
- **`ToolView.tsx`**: Auto-open/close modal on permission status change. Amber border on pending bubbles (`box.warning.border`). Passes permission props to ToolModal. `isPending` guards suppress `PermissionFooter` for resolved permissions.
- **`ToolModal.tsx`**: Content routing IIFE checks `isPending` before existing tool routing. `FILE_VIEW_TOOLS` check includes `&& !isPending` to prevent "Waiting for result…" fallback. `PermissionActionBar` is a sibling of the card Animated.View, both inside a flex-end wrapper.
- **`PermissionActionBar.tsx`**: Outline/bordered buttons (transparent bg + colored border + colored text). Allow (green), Suggestion/AllowAll (blue), Deny (red). Uses theme `permissionButton.*` colors. LLM summary above buttons. Queue badge below buttons (shows `queueCount - 1`, hidden when ≤ 1). Deny two-tap: first tap shows feedback input, second tap with empty text cancels.
- **`PermissionSheetBar.tsx`**: Minimized bar with Allow/Deny for ALL tool types (removed `isRichTool` distinction).
- **`useCurrentSessionPermissions.ts`**: Selector hook — reads `session.agentState.requests`, returns sorted array + `queueCount`.
- **`knownTools.tsx`**: AskUserQuestion `minimal` changed to dynamic function — returns `true` (collapsed) except when permission is pending.

### Bug Fixes Applied
1. **Empty modal body** (#2): `FileViewModalContent` early-returned "Waiting for result…" for running Read tools. Fixed by `!isPending` guard on FILE_VIEW_TOOLS routing.
2. **No auto-dismiss** (#3): Added else-if branch to useEffect to close modal when status changes from pending.
3. **AskUserQuestion regression** (#5): `minimal: false` hardcoded → changed to dynamic function that returns false only when pending.
4. **Queue badge off-by-one** (#1): Badge text now shows `queueCount - 1` to exclude current permission.
5. **Button colors** (#4): Changed from solid filled to outline/bordered style.
6. **Inline footer for past permissions**: `PermissionFooter` now hidden for approved/denied permissions, shown only for pending.

### Gotchas
- `PermissionActionBar` must be a SIBLING of the card, not a child — safe-area margin moves from card to action bar when present
- AskUserQuestion suppresses `PermissionActionBar` (has own submit/cancel buttons)
- `FileViewModalContent` has an early return for running tools — must check `isPending` BEFORE routing to it
- Queue count from `useCurrentSessionPermissions` includes the current permission — subtract 1 for badge display
- `knownTools.tsx` `minimal` can be a function `(opts: { tool }) => boolean` — not just a static boolean

## Branch
`feature/unified-permission-modal` (worktree at `.worktrees/unified-permission-modal`)
