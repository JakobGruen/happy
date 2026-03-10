# Mobile Push Notification Quick Reply Buttons

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Allow/Deny action buttons to mobile push notifications so users can approve or reject permission requests without opening the app.

**Architecture:** Register a notification category (`PERMISSION_REQUEST`) with Allow/Deny actions at app startup via `Notifications.setNotificationCategoryAsync`. Add `categoryId` to push payloads sent by the CLI. Handle action responses via `Notifications.addNotificationResponseReceivedListener` in `_layout.tsx`, calling `sessionAllow`/`sessionDeny` directly. iOS gets native action buttons; Android shows them in foreground but gracefully degrades (tap-to-open) in background/killed state — no data-only push workaround.

**Tech Stack:** expo-notifications (categories/actions API), expo-server-sdk (categoryId on push messages)

---

## Context

### Current Flow
1. CLI `permissionHandler.ts` sends push via `sendToAllDevices()` with `{ sessionId, requestId, tool, type: 'permission_request' }`
2. App shows OS notification (title: "Permission Request", body: "Claude wants to [tool]")
3. User taps notification → app opens → `PermissionBanner` shows → user taps Allow/Deny
4. No `addNotificationResponseReceivedListener` exists — notification taps just open the app

### Target Flow
1. CLI sends push with `categoryId: 'PERMISSION_REQUEST'` added to payload
2. iOS shows notification with [Allow] [Deny] action buttons; Android shows them when app is foregrounded
3. **Quick action path**: User taps Allow/Deny button → app handles in background → `sessionAllow`/`sessionDeny` fires → done (no UI needed)
4. **Body tap path**: User taps notification body → app opens + navigates to session (new behavior)
5. **Notification-only tools** (AskUserQuestion, ExitPlanMode): No action buttons, body tap navigates to session

### Key Files
- `packages/happy-app/sources/app/_layout.tsx` — notification handler setup, hook mounting
- `packages/happy-cli/src/api/pushNotifications.ts` — `PushNotificationClient.sendToAllDevices()`
- `packages/happy-cli/src/claude/utils/permissionHandler.ts` — sends push on permission request
- `packages/happy-app/sources/sync/ops.ts` — `sessionAllow()` / `sessionDeny()` RPC functions
- `packages/happy-app/sources/sync/permissionQueue.ts` — `PendingPermissionItem` type

### Notification-Only Tools
`AskUserQuestion`, `ExitPlanMode`, `exit_plan_mode` — these need user attention (navigate to session) but cannot be Allow/Deny'd from a notification. Use a separate category `PERMISSION_NAVIGATE` with no action buttons (or just don't set a category, letting them default to body-tap-only).

---

## Implementation Tasks (TDD)

### Task 1: Notification category registration utility

**Files:**
- Create: `packages/happy-app/sources/utils/notificationCategories.ts`
- Test: `packages/happy-app/sources/utils/notificationCategories.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerNotificationCategories, PERMISSION_CATEGORY_ID } from './notificationCategories';

// Mock expo-notifications
vi.mock('expo-notifications', () => ({
    setNotificationCategoryAsync: vi.fn(),
}));

import * as Notifications from 'expo-notifications';

describe('notificationCategories', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('exports PERMISSION_CATEGORY_ID constant', () => {
        expect(PERMISSION_CATEGORY_ID).toBe('PERMISSION_REQUEST');
    });

    it('registers PERMISSION_REQUEST category with Allow and Deny actions', async () => {
        await registerNotificationCategories();

        expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
            'PERMISSION_REQUEST',
            [
                {
                    identifier: 'ALLOW',
                    buttonTitle: 'Allow',
                    options: { opensAppToForeground: false },
                },
                {
                    identifier: 'DENY',
                    buttonTitle: 'Deny',
                    options: { opensAppToForeground: false, isDestructive: true },
                },
            ]
        );
    });

    it('does not throw if setNotificationCategoryAsync fails', async () => {
        vi.mocked(Notifications.setNotificationCategoryAsync).mockRejectedValue(new Error('fail'));
        await expect(registerNotificationCategories()).resolves.not.toThrow();
    });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn workspace happy-app test -- sources/utils/notificationCategories.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
import * as Notifications from 'expo-notifications';

export const PERMISSION_CATEGORY_ID = 'PERMISSION_REQUEST';

/**
 * Registers notification categories with action buttons.
 * PERMISSION_REQUEST: Allow/Deny buttons for tool permission requests.
 * Silently catches errors (non-critical — app works without categories).
 */
export async function registerNotificationCategories(): Promise<void> {
    try {
        await Notifications.setNotificationCategoryAsync(PERMISSION_CATEGORY_ID, [
            {
                identifier: 'ALLOW',
                buttonTitle: 'Allow',
                options: { opensAppToForeground: false },
            },
            {
                identifier: 'DENY',
                buttonTitle: 'Deny',
                options: { opensAppToForeground: false, isDestructive: true },
            },
        ]);
    } catch {
        // Non-critical — categories may not be supported on all platforms
    }
}
```

**Step 4: Run test to verify it passes**

Run: `yarn workspace happy-app test -- sources/utils/notificationCategories.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/happy-app/sources/utils/notificationCategories.ts packages/happy-app/sources/utils/notificationCategories.test.ts
git commit -m "feat(app): add notification category registration for permission actions"
```

---

### Task 2: Notification response handler hook

**Files:**
- Create: `packages/happy-app/sources/hooks/useNotificationActions.ts`
- Test: `packages/happy-app/sources/hooks/useNotificationActions.test.ts`

This hook listens for notification action responses and calls `sessionAllow`/`sessionDeny`.

**Step 1: Write the failing test**

Test the pure helper function that maps action responses to operations:

```typescript
import { describe, it, expect } from 'vitest';
import { mapNotificationAction } from './useNotificationActions';

describe('mapNotificationAction', () => {
    const baseData = { sessionId: 'sess-1', requestId: 'req-1', tool: 'Bash', type: 'permission_request' };

    it('returns allow action for ALLOW identifier', () => {
        const result = mapNotificationAction('ALLOW', baseData);
        expect(result).toEqual({ type: 'allow', sessionId: 'sess-1', requestId: 'req-1' });
    });

    it('returns deny action for DENY identifier', () => {
        const result = mapNotificationAction('DENY', baseData);
        expect(result).toEqual({ type: 'deny', sessionId: 'sess-1', requestId: 'req-1' });
    });

    it('returns navigate action for default tap (expo DEFAULT_ACTION_IDENTIFIER)', () => {
        const result = mapNotificationAction('expo.modules.notifications.actions.DEFAULT', baseData);
        expect(result).toEqual({ type: 'navigate', sessionId: 'sess-1' });
    });

    it('returns null for missing sessionId', () => {
        const result = mapNotificationAction('ALLOW', { requestId: 'req-1', tool: 'Bash', type: 'permission_request' });
        expect(result).toBeNull();
    });

    it('returns null for missing requestId on allow/deny', () => {
        const result = mapNotificationAction('ALLOW', { sessionId: 'sess-1', tool: 'Bash', type: 'permission_request' });
        expect(result).toBeNull();
    });

    it('returns navigate even without requestId (body tap only needs sessionId)', () => {
        const result = mapNotificationAction('expo.modules.notifications.actions.DEFAULT', { sessionId: 'sess-1' });
        expect(result).toEqual({ type: 'navigate', sessionId: 'sess-1' });
    });
});
```

**Step 2: Run test to verify it fails**

Run: `yarn workspace happy-app test -- sources/hooks/useNotificationActions.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { sessionAllow, sessionDeny } from '@/sync/ops';
import { router } from 'expo-router';

interface NotificationAction {
    type: 'allow' | 'deny' | 'navigate';
    sessionId: string;
    requestId?: string;
}

/**
 * Maps a notification action identifier + data to a typed action.
 * Returns null if required data is missing.
 */
export function mapNotificationAction(
    actionIdentifier: string,
    data: Record<string, any> | undefined,
): NotificationAction | null {
    if (!data?.sessionId) return null;

    if (actionIdentifier === 'ALLOW') {
        if (!data.requestId) return null;
        return { type: 'allow', sessionId: data.sessionId, requestId: data.requestId };
    }

    if (actionIdentifier === 'DENY') {
        if (!data.requestId) return null;
        return { type: 'deny', sessionId: data.sessionId, requestId: data.requestId };
    }

    // Default action (body tap) — navigate to session
    return { type: 'navigate', sessionId: data.sessionId };
}

/**
 * Hook that listens for notification action responses (Allow/Deny buttons + body taps).
 * Calls sessionAllow/sessionDeny for quick actions, navigates for body taps.
 */
export function useNotificationActions() {
    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
            const action = mapNotificationAction(
                response.actionIdentifier,
                response.notification.request.content.data as Record<string, any>,
            );
            if (!action) return;

            switch (action.type) {
                case 'allow':
                    sessionAllow(action.sessionId, action.requestId!);
                    break;
                case 'deny':
                    sessionDeny(action.sessionId, action.requestId!);
                    break;
                case 'navigate':
                    router.push(`/(app)/session/${action.sessionId}`);
                    break;
            }
        });

        return () => subscription.remove();
    }, []);
}
```

**Step 4: Run test to verify it passes**

Run: `yarn workspace happy-app test -- sources/hooks/useNotificationActions.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/happy-app/sources/hooks/useNotificationActions.ts packages/happy-app/sources/hooks/useNotificationActions.test.ts
git commit -m "feat(app): add useNotificationActions hook for push notification quick replies"
```

---

### Task 3: CLI — add categoryId to push notifications

**Files:**
- Modify: `packages/happy-cli/src/api/pushNotifications.ts:152-161`
- Modify: `packages/happy-cli/src/claude/utils/permissionHandler.ts:263-273`

The CLI needs to send `categoryId: 'PERMISSION_REQUEST'` on permission request pushes. Notification-only tools should NOT include the category (so they get no action buttons — just tap-to-navigate).

**Step 1: Modify `sendToAllDevices` to accept optional `categoryId`**

In `pushNotifications.ts`, change the message construction to accept and pass through `categoryId`:

```typescript
// Change signature:
sendToAllDevices(title: string, body: string, data?: Record<string, any>, categoryId?: string): void {

// In the message construction (line ~154), add categoryId:
return {
    to: token.token,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
    ...(categoryId && { categoryId }),
}
```

**Step 2: Modify `permissionHandler.ts` to pass categoryId for non-notification-only tools**

The notification-only tools check already exists in `PermissionBanner.tsx` — replicate the constant list in the CLI (or just always send the category — the app-side category registration determines what buttons appear, and notification-only tools are handled by the banner, not push actions).

Simpler approach: **always send `categoryId: 'PERMISSION_REQUEST'`**. The notification-only tools will still have Allow/Deny buttons on the push notification, but that's actually fine — if the user taps Allow on an `AskUserQuestion` notification, the `sessionAllow` call will go through (it's a valid permission ID). The in-app UX handles the nuance.

```typescript
// In permissionHandler.ts, change sendToAllDevices call (~line 264):
this.session.api.push().sendToAllDevices(
    'Permission Request',
    `Claude wants to ${getToolName(toolName)}`,
    {
        sessionId: this.session.client.sessionId,
        requestId: id,
        tool: toolName,
        type: 'permission_request'
    },
    'PERMISSION_REQUEST'
);
```

**Step 3: Run CLI build to verify**

Run: `yarn workspace happy-coder build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add packages/happy-cli/src/api/pushNotifications.ts packages/happy-cli/src/claude/utils/permissionHandler.ts
git commit -m "feat(cli): add categoryId to permission request push notifications"
```

---

### Task 4: Mount hooks in _layout.tsx

**Files:**
- Modify: `packages/happy-app/sources/app/_layout.tsx`

**Step 1: Add imports and mount**

At the top of `_layout.tsx`, add imports:

```typescript
import { registerNotificationCategories } from '@/utils/notificationCategories';
import { useNotificationActions } from '@/hooks/useNotificationActions';
```

Call `registerNotificationCategories()` at module level (alongside the existing `setNotificationHandler` and channel setup, around line 52):

```typescript
// Register notification categories for action buttons (Allow/Deny)
registerNotificationCategories();
```

Inside the `RootLayoutNav` component (around line 212, near `useViewingSession()`):

```typescript
// Handle notification action responses (Allow/Deny buttons + body taps)
useNotificationActions()
```

**Step 2: Run typecheck**

Run: `yarn workspace happy-app typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/happy-app/sources/app/_layout.tsx
git commit -m "feat(app): mount notification categories and action handler in layout"
```

---

### Task 5: Typecheck + final verification

**Step 1: Run full typecheck**

```bash
yarn workspace happy-app typecheck
```

Expected: PASS

**Step 2: Run all new tests**

```bash
yarn workspace happy-app test -- sources/utils/notificationCategories.test.ts sources/hooks/useNotificationActions.test.ts
```

Expected: All tests PASS

**Step 3: Run CLI build**

```bash
yarn workspace happy-coder build
```

Expected: Build succeeds

---

## Key Design Decisions

1. **Always send `categoryId`**: Even for notification-only tools. Simpler than maintaining a tool allowlist in the CLI. If a user taps Allow on an AskUserQuestion notification, it just resolves the permission — they'll still need to open the app to answer the question, but the tool won't be blocked.

2. **`opensAppToForeground: false`**: Allow/Deny actions resolve silently without opening the app. The user stays in their current context.

3. **`isDestructive: true` on Deny**: iOS renders the Deny button in red, making it visually distinct.

4. **No Android data-only workaround**: Android shows action buttons when the app is in foreground (Expo handles presentation). In background/killed state, the OS presents the notification without action buttons — tapping the body opens the app where `PermissionBanner` handles it. This matches existing behavior and avoids the unreliable `expo-task-manager` + headless task approach.

5. **Body tap navigation**: Added `addNotificationResponseReceivedListener` for the default action (body tap) — navigates directly to the session. This is NEW behavior (currently tapping a notification just opens the app to the last screen).

6. **`useLastNotificationResponse`**: Not needed — `addNotificationResponseReceivedListener` in the root layout handles both warm-start and cold-start cases since it's mounted early enough.

## Verification

1. All tests pass
2. `yarn workspace happy-app typecheck` passes
3. `yarn workspace happy-coder build` succeeds
4. Manual iOS: permission request → notification appears with Allow/Deny buttons → tap Allow → permission resolves without opening app
5. Manual iOS: tap notification body → app opens and navigates to session
6. Manual Android: permission request → notification appears → tap body → app opens → PermissionBanner shows (graceful degradation)
