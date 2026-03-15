# Global Permission Banner Redesign

**Date**: 2026-03-15
**Status**: Approved
**Branch**: `feature/unified-permission-modal`

## Goal

Replace the 638-line `PermissionBanner.tsx` (with nested `ExpandedBannerOverlay`) with a thin component that reuses the same `ToolModal` + `PermissionActionBar` used for in-session permissions. The banner becomes a simple amber-bordered chip; tapping it opens the full tool detail modal in-place (no navigation to the other session).

## Requirements

1. **Banner appearance**: Styled like a chat tool bubble with amber border — matches `ToolView` pending style
2. **On tap**: Opens `ToolModal` + `PermissionActionBar` as overlay (same components used in-session)
3. **No navigation**: Modal opens in-place; RPC response goes back to the originating session
4. **No quick actions on banner**: No Allow/Deny buttons on the banner itself
5. **Queue**: One banner at a time (oldest first), "N more pending" count
6. **Full modal experience**: Same INPUT tab, content formatting, PermissionActionBar as in-session
7. **Auto-dismiss**: Banner + modal close when permission resolves

## Approach: Rewrite PermissionBanner as thin wrapper over ToolModal

### Data Bridge

`ToolModal` expects `tool: ToolCall`, banner has `PendingPermissionItem`. Build a synthetic `ToolCall`:

```typescript
const syntheticTool: ToolCall = {
    name: item.tool,
    state: 'running',
    input: item.toolInput ?? {},
    createdAt: item.createdAt ?? Date.now(),
    startedAt: null,
    completedAt: null,
    description: item.description ?? null,
    result: undefined,
    permission: {
        id: item.permissionId,
        status: 'pending',
        permissionSuggestions: item.permissionSuggestions ?? undefined,
    },
};
```

### Component Structure

```
PermissionBanner (rewritten, ~150 lines)
├── Banner chip (amber border, tool icon + name + session label)
│   └── onPress → setModalVisible(true)
├── Queue count text ("N more pending")
└── <ToolModal>  ← same component used in-session
    └── <PermissionActionBar>  ← same action bar
```

### What Gets Deleted

- `ExpandedBannerOverlay` (nested 300+ line component)
- Two-mode distinction (regular vs notification-only tools)
- All expanded overlay logic (rich content rendering, button handling)

### What Stays

- `buildPermissionQueue()` in `permissionQueue.ts` — unchanged
- `usePendingPermissionQueue()` selector — unchanged
- `useViewingSession()` — unchanged
- Mounting point in `_layout.tsx` — unchanged

### Edge Cases

- **Permission resolved while modal open**: Modal closes (queue item removed), next item appears
- **Session offline while modal open**: Modal stays open, RPC will relay when possible
- **AskUserQuestion from other session**: Opens `QuestionSheetContent` (same routing as in-session)

## Implementation Steps

1. **Create `buildSyntheticToolCall()` utility** — pure function mapping `PendingPermissionItem` → `ToolCall`
2. **Rewrite `PermissionBanner.tsx`** — thin component with banner chip + ToolModal overlay
3. **Wire `usePermissionActions`** with cross-session `sessionId` and `permissionId`
4. **Wire `PermissionActionBar`** as ToolModal sibling (same pattern as in-session)
5. **Handle auto-dismiss** — close modal when permission item disappears from queue
6. **Add session label** to banner chip (so user knows which session is requesting)
7. **Test** with cross-session permissions (multiple sessions with pending permissions)
8. **Clean up** — remove dead code from old PermissionBanner
