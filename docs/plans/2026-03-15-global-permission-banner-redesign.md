# Global Permission Banner Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 638-line `PermissionBanner.tsx` with a thin component (~150 lines) that reuses `ToolModal` + `PermissionActionBar` for cross-session permission requests — no navigation, modal opens in-place.

**Architecture:** Banner chip (amber border, tool name + session label) → tap opens `ToolModal` with synthetic `ToolCall` → `PermissionActionBar` handles RPC to originating session. Queue shows one at a time, oldest first.

**Tech Stack:** React Native, Reanimated, Unistyles, existing ToolModal/PermissionActionBar components

---

## Context

### Key Files

| File | Role |
|---|---|
| `sources/components/PermissionBanner.tsx` | **REWRITE** — current 638-line component with nested `ExpandedBannerOverlay` |
| `sources/components/tools/modal/ToolModal.tsx` | Existing floating card modal — reuse as-is |
| `sources/components/tools/modal/PermissionActionBar.tsx` | Existing action bar — reuse as-is |
| `sources/hooks/usePermissionActions.ts` | Existing RPC dispatch hook — reuse as-is |
| `sources/hooks/useCurrentSessionPermissions.ts` | Has `CurrentSessionPermissionItem` interface — reuse type |
| `sources/sync/permissionQueue.ts` | `buildPermissionQueue()`, `PendingPermissionItem` — unchanged |
| `sources/sync/storage.ts` | `usePendingPermissionQueue()` selector — unchanged |
| `sources/sync/typesMessage.ts` | `ToolCall` type definition |
| `sources/app/_layout.tsx` | Mounting point — unchanged |
| `sources/utils/sessionUtils.ts` | `getSessionName()` — reuse |

### Data Types

**`PendingPermissionItem`** (from `permissionQueue.ts`):
```typescript
interface PendingPermissionItem {
    sessionId: string;
    session: Session;
    permissionId: string;
    tool: string;
    toolInput?: any;
    description?: string | null;
    llmSummary?: string | null;
    createdAt?: number | null;
    permissionSuggestions?: any[] | null;
}
```

**`ToolCall`** (from `typesMessage.ts`):
```typescript
type ToolCall = {
    name: string;
    state: 'running' | 'completed' | 'error';
    input: any;
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    description: string | null;
    result?: any;
    permission?: {
        id: string;
        status: 'pending' | 'approved' | 'denied' | 'canceled';
        permissionSuggestions?: any[];
        decisionReason?: string;
        description?: string;
        // ... more optional fields
    };
}
```

**`CurrentSessionPermissionItem`** (from `useCurrentSessionPermissions.ts`):
```typescript
interface CurrentSessionPermissionItem {
    permissionId: string;
    tool: string;
    toolInput: any;
    description: string | null;
    llmSummary: string | null;
    permissionSuggestions: any[] | null;
    decisionReason: string | null;
    createdAt: number | null;
}
```

---

## Task 1: Create `buildSyntheticToolCall` utility

Pure function that bridges `PendingPermissionItem` → `ToolCall` + `CurrentSessionPermissionItem`.

**Files:**
- Create: `sources/components/tools/permissionBannerUtils.ts`

**Step 1: Write the utility**

```typescript
import { ToolCall } from '@/sync/typesMessage';
import { PendingPermissionItem } from '@/sync/permissionQueue';
import { CurrentSessionPermissionItem } from '@/hooks/useCurrentSessionPermissions';

/**
 * Builds a synthetic ToolCall from a cross-session PendingPermissionItem.
 * Used by PermissionBanner to feed the same ToolModal used for in-session permissions.
 */
export function buildSyntheticToolCall(item: PendingPermissionItem): ToolCall {
    return {
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
            description: item.description ?? undefined,
        },
    };
}

/**
 * Builds a CurrentSessionPermissionItem from a PendingPermissionItem.
 * Used to pass permission data to ToolModal and PermissionActionBar.
 */
export function buildPermissionItem(item: PendingPermissionItem): CurrentSessionPermissionItem {
    return {
        permissionId: item.permissionId,
        tool: item.tool,
        toolInput: item.toolInput,
        description: item.description ?? null,
        llmSummary: item.llmSummary ?? null,
        permissionSuggestions: item.permissionSuggestions ?? null,
        decisionReason: null,
        createdAt: item.createdAt ?? null,
    };
}
```

**Step 2: Commit**

```bash
git add sources/components/tools/permissionBannerUtils.ts
git commit -m "feat: add buildSyntheticToolCall utility for cross-session permissions"
```

---

## Task 2: Rewrite PermissionBanner

Replace the entire 638-line `PermissionBanner.tsx` with a thin component that renders a banner chip + `ToolModal` overlay.

**Files:**
- Modify: `sources/components/PermissionBanner.tsx` (full rewrite)

**Step 1: Write the new component**

The new `PermissionBanner` should:

1. Use `usePendingPermissionQueue()` to get the cross-session queue (same as before)
2. Show a single banner chip for `queue[0]`:
   - Amber border (`box.warning.border`)
   - Shield icon + tool name + session name subtitle
   - Queue count ("N more pending") when `queue.length > 1`
   - `onPress` → `setModalVisible(true)`
3. Render `<ToolModal>` when `modalVisible`:
   - Pass `syntheticTool` from `buildSyntheticToolCall(current)`
   - Pass `permission` from `buildPermissionItem(current)`
   - Pass `permissionActions` from `usePermissionActions(current.sessionId, ...)`
   - Pass `queueCount={queue.length}`
   - `hideOutput={true}` (no result yet for pending permissions)
   - `onClose` → `setModalVisible(false)`
4. Auto-close modal when `current.permissionId` changes (permission resolved, next one in queue)
5. Use `FadeIn`/`FadeOut` animation on the banner (same as current)
6. Positioned absolutely at top, `zIndex: 100` (same mounting as current)

**Key behaviors to preserve:**
- `usePendingPermissionQueue()` already excludes the currently viewed session
- Banner only shows when `queue.length > 0`
- Queue badge shows `queue.length - 1` ("N more pending") when > 1

**Key behaviors that change:**
- NO two-mode distinction (regular vs notification-only) — all tools get same amber banner
- NO inline Allow/Deny buttons on the banner
- NO `ExpandedBannerOverlay` — replaced by `ToolModal`
- Tap always opens `ToolModal` (never navigates)

**AskUserQuestion special case:** `ToolModal` already routes `AskUserQuestion` to `QuestionSheetContent` when `isPending` — this works automatically. The `QuestionSheetContent` needs `sessionId` which `ToolModal` accepts as a prop.

**ExitPlanMode special case:** `ToolModal` already routes to `PlanSheetContent` — also works automatically. `PermissionActionBar` is suppressed for AskUserQuestion (has own submit buttons) but shown for ExitPlanMode.

**Imports needed:**
```typescript
import { usePendingPermissionQueue } from '@/sync/storage';
import { getSessionName } from '@/utils/sessionUtils';
import { usePermissionActions } from '@/hooks/usePermissionActions';
import { buildSyntheticToolCall, buildPermissionItem } from '@/components/tools/permissionBannerUtils';
import { ToolModal } from '@/components/tools/modal/ToolModal';
import { t } from '@/text';
```

**Styles:**
- `container`: `position: 'absolute'`, top/left/right 0, zIndex 100, paddingHorizontal 12, paddingTop 8
- `banner`: flexDirection 'row', alignItems 'center', backgroundColor `surfaceHigh`, borderRadius 12, borderWidth 1, borderColor `box.warning.border + '80'`, shadow, padding
- `iconContainer`: 32x32 circle, `box.warning.border + '20'` background
- `icon`: color `box.warning.border`
- `textArea`: flex 1
- `sessionName`: fontSize 13, fontWeight '600', color `text`
- `toolDescription`: fontSize 12, color `textSecondary`
- `moreCount`: fontSize 11, color `textSecondary`, marginTop 2

**Step 2: Verify typecheck**

Run: `cd /home/jakob/repos/happy/.worktrees/unified-permission-modal && bun typecheck`
Expected: No errors related to PermissionBanner

**Step 3: Commit**

```bash
git add sources/components/PermissionBanner.tsx
git commit -m "feat: rewrite PermissionBanner to use unified ToolModal for cross-session permissions"
```

---

## Task 3: Manual testing & edge case fixes

Test with real cross-session permissions by running multiple CLI sessions.

**Test scenarios:**

1. **Basic flow**: Have a pending permission in Session A while viewing Session B → amber banner appears → tap → ToolModal opens in-place with INPUT tab → approve → modal closes, banner disappears
2. **Queue**: Have 2+ pending permissions across sessions → banner shows oldest, "N more pending" badge → approve first → next one appears
3. **AskUserQuestion**: Trigger AskUserQuestion from another session → banner shows → tap → QuestionSheetContent opens in modal → submit answer → modal closes
4. **ExitPlanMode**: Trigger plan mode exit → banner → tap → PlanSheetContent in modal → approve
5. **Permission resolved externally**: Open modal → approve from CLI or another device → modal + banner should auto-dismiss
6. **Dismiss modal without acting**: Open modal → close via X or swipe → banner stays, user can tap again

**Step 1: Test and fix any issues**

**Step 2: Commit fixes**

```bash
git commit -m "fix: address edge cases in global permission banner"
```

---

## Task 4: Clean up dead imports & unused i18n keys

After rewrite, check for:
- Unused imports from old `PermissionBanner.tsx` (e.g., `isNotificationOnlyTool`, `sessionAllow`, `sessionDeny`)
- Any i18n keys that were only used by the old banner/overlay (keep `notifications.morePermissions` which is still used)
- Remove `isNotificationOnlyTool` from browser notification utils if only used by the old banner (check usages first)

**Step 1: Check and clean**

**Step 2: Commit**

```bash
git commit -m "chore: remove dead code from old PermissionBanner"
```
