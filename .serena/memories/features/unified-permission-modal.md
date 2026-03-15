# Unified Permission Modal — Feature Architecture

## Overview
Permission requests now reuse the same floating card tool modal as completed tool views, with a `PermissionActionBar` rendered as a sibling card below. This replaces the old separate `PermissionSheetExpanded` flow for Claude sessions.

## Architecture

### Data Flow (v2 — inline permission + expand animation)
1. `ToolView.tsx` detects `tool.permission?.status === 'pending'` → renders inline `PermissionActionBar` (with `inline` prop) below bubble. NO auto-open modal.
2. User taps bubble header → `measureInWindow` captures bubble screen rect → `sourceRect` passed to `ToolModal`
3. `ToolModal.tsx` opens with `progress` shared value (0→1) driving expand animation via `interpolate` — card flies from bubble position to bottom-justified final position
4. `PermissionActionBar` renders as sibling at absolute bottom position (not child of card)
5. On resolution (approved/denied/canceled) → useEffect auto-closes, `handleClose` animates `progress` 1→0 (collapse back to bubble)
6. `internalVisible` state keeps `<Modal>` mounted during close animation

### Key Components
- **`ToolView.tsx`**: `containerRef` + `measureInWindow` on tap. Renders inline `PermissionActionBar` for Claude, `PermissionFooter` for Codex. Hides bubble (`opacity: 0`) while modal open. Amber border on pending bubbles (`box.warning.border`).
- **`ToolModal.tsx`**: `progress` shared value + `useAnimatedStyle`/`interpolate` drives: card position/size (sourceRect → final), backdrop opacity (0→0.4), content fade-in (30-70% progress). `internalVisible` keeps Modal alive during close. Drag-to-resize blocked when `progress < 0.95`. Falls back to slide-up when no `sourceRect`. Close via `handleClose` → spring progress to 0 → `actualClose` unmounts.
- **`PermissionActionBar.tsx`**: Outline/bordered buttons. Supports `inline` variant (no shadow, no margin, borderTop separator). Allow (green), Suggestion/AllowAll (blue), Deny (red). LLM summary above buttons. Queue badge below. Deny two-tap: first shows feedback, second submits.
- **`PermissionFooter.tsx`**: Kept for Codex sessions only (different permission model: Yes/For Session/Abort).
- **`useCurrentSessionPermissions.ts`**: Selector hook — reads `session.agentState.requests`, returns sorted array + `queueCount`.
- **`knownTools.tsx`**: AskUserQuestion `minimal` is dynamic function — returns `true` (collapsed) except when permission is pending.

### Expand-from-Bubble Animation Details
- Uses `useAnimatedStyle` + `interpolate` on shared values — works on iOS, Android, AND web
- Custom `entering` animation functions (Reanimated) DON'T work on web — this is why we use shared values
- `measureInWindow` returns absolute screen coordinates — matches transparent Modal coordinate system
- `ACTION_BAR_ESTIMATED_HEIGHT` (140px) offsets final card position when PermissionActionBar present
- Spring config: `{ damping: 20, stiffness: 200, mass: 0.8 }`
- Content fade uses `Extrapolation.CLAMP` to prevent overshooting

### Bug Fixes Applied
1. **Empty modal body** (#2): `FileViewModalContent` early-returned "Waiting for result…". Fixed by `!isPending` guard.
2. **AskUserQuestion regression** (#5): `minimal` changed to dynamic function.
3. **Queue badge off-by-one** (#1): Badge shows `queueCount - 1`.
4. **Button colors** (#4): Outline/bordered style.
5. **Hooks ordering crash**: All `useMemo` moved before early returns.

### Gotchas
- `PermissionActionBar` positioned with `position: 'absolute', bottom: insets.bottom + 8` — not flex layout
- AskUserQuestion suppresses `PermissionActionBar` (has own submit/cancel buttons)
- `FileViewModalContent` has early return for running tools — check `isPending` BEFORE routing
- Queue count includes current permission — subtract 1 for badge
- `knownTools.tsx` `minimal` can be a function `(opts: { tool }) => boolean`
- Custom entering animation functions are iOS/Android ONLY — do not use on web
- `measureInWindow` is async callback — store in ref, not state (avoids extra re-render)
- `internalVisible` + `isClosingRef` guard prevents double-close and premature unmount


## Global Permission Banner Redesign

The `PermissionBanner.tsx` was rewritten from 638 lines to ~190 lines. The old `ExpandedBannerOverlay` (300+ line nested component) was deleted entirely.

### Architecture
- **Banner chip**: Amber-bordered chip at top of screen (session name + tool description + input preview). Single mode for all tools — no more regular vs notification-only distinction.
- **On tap**: Opens `ToolModal` + `PermissionActionBar` in-place (no navigation to other session). Uses `buildSyntheticToolCall()` from `permissionBannerUtils.ts` to bridge `PendingPermissionItem` → `ToolCall`.
- **`BannerModal`**: Extracted memo component isolates `usePermissionActions` hook call. Only rendered when modal is visible.
- **Queue**: One banner at a time (oldest first), "N more pending" count via `usePendingPermissionQueue()`.
- **Input preview**: `getInputPreview()` extracts first non-empty string value from `toolInput`, truncated to 80 chars, first line only. Rendered in monospace.

### Anti-Stacking (`permissionModalRegistry.ts`)
Module-level counter + `useSyncExternalStore` hook tracks open permission modals:
- `registerPermissionModalOpen()` / `registerPermissionModalClose()` — called by ToolView (when modal open + pending) and BannerModal
- `isAnyPermissionModalOpen()` — used by PermissionBanner to suppress auto-open when another modal visible
- Manual taps still bypass — intentional stacking allowed

### Key Files
- `PermissionBanner.tsx` — global cross-session banner + expand from banner position
- `permissionBannerUtils.ts` — `buildSyntheticToolCall()`, `buildPermissionItem()`, `getInputPreview()`
- `permissionModalRegistry.ts` — anti-stacking registry


### Gotchas
- All React hooks must be called before any early return — `useMemo` for synthetic objects moved above `if (!current) return null` guard
- `BannerModal` extracted as separate component to avoid conditional `usePermissionActions` hook call
- AskUserQuestion from other session: passes `null` for `permissionActions` (ToolModal already routes to `QuestionSheetContent` which has own submit/cancel)

## Branch
`feature/unified-permission-modal` (worktree at `.worktrees/unified-permission-modal`)