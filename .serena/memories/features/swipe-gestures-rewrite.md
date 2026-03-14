commit a3f0d2321bea3558dcef7d761d6f6560566e8de7
Author: Jakob Gruenwald <jakob@v2202603343089439572.megasrv.de>
Date:   Sat Mar 14 16:03:04 2026 +0100

    feat(app): rewrite swipe gestures with modern Gesture.Pan() and optimistic reactivation UI
    
    Replace SwipeableRow with unified cross-platform implementation using
    react-native-gesture-handler Gesture.Pan() + Reanimated shared values.
    Removes platform-split (SwipeableRow.web.tsx deleted).
    
    Key improvements:
    - iOS Mail-style free sliding with rubber band at edge
    - Full swipe-to-trigger with graceful vanish animation (slide off + height collapse)
    - Auto-close coordination via module-level registry
    - Haptic feedback at snap points (light at open, medium at full-swipe)
    - Web scroll discrimination via touch-action: pan-y (no failOffsetY)
    - Remove confirmation modals for delete/archive (immediate action)
    - Optimistic reactivation: session appears in active group instantly with
      spinner + "Reactivating..." indicator, auto-cleans up when server confirms

diff --git a/.serena/memories/features/swipe-gestures-rewrite.md b/.serena/memories/features/swipe-gestures-rewrite.md
new file mode 100644
index 00000000..6b3640aa
--- /dev/null
+++ b/.serena/memories/features/swipe-gestures-rewrite.md
@@ -0,0 +1,49 @@
+# Swipe Gestures Rewrite (completed 2026-03-14)
+
+## What Changed
+- **SwipeableRow.tsx** fully rewritten — unified cross-platform (web + native) using `Gesture.Pan()` from react-native-gesture-handler 2.28 + Reanimated shared values
+- **SwipeableRow.web.tsx** deleted — no more platform split
+- Confirmation modals removed from delete/archive/reactivate — actions fire immediately on swipe or tap
+- Optimistic reactivation UI added — session appears in active group instantly with spinner
+
+## Architecture
+
+### SwipeableRow Component
+- `Gesture.Pan()` with `activeOffsetX([-10, 10])` for activation
+- Native scroll discrimination: `failOffsetY([-5, 5])` (native only)
+- Web scroll discrimination: `touch-action: pan-y` CSS (compositor-level)
+- Module-level `Set` registry for auto-close coordination between rows
+- Rubber band at 80% of row width with factor 0.5
+- Full swipe threshold at 50% of row width
+- `vanish(direction)` method: slides content off + collapses height (250ms)
+- `close()` method: snaps back to zero
+- Action containers are `Animated.View`s whose width tracks `|translateX|` — color fills to content edge
+
+### Optimistic Reactivation
+- `useReactivatingSessions.ts` — module-level Set + `useSyncExternalStore` with version counter
+- `useVisibleSessionListViewData.ts` — moves reactivating sessions from inactive → active-sessions group
+- `storage.ts` `isSessionActive()` also checks reactivating set (defense-in-depth)
+- Active session rows show `ActivityIndicator` + "Reactivating..." text via `useIsReactivating()` hook
+- Auto-cleanup: `useEffect` in row components calls `unmarkReactivating()` when `session.active` becomes true
+- Error cleanup: `useCanReactivateSession` accepts `onError` callback to unmark on failure
+
+### Key Constants
+```
+ACTION_WIDTH = 112
+FULL_SWIPE_RATIO = 0.50
+OPEN_THRESHOLD = ACTION_WIDTH * 0.35
+VELOCITY_OPEN = 500
+VELOCITY_FULL_SWIPE = 1200
+FULL_SWIPE_DURATION = 200ms
+VANISH_DURATION = 250ms
+```
+
+## Key Files
+- `SwipeableRow.tsx` — core unified swipeable row component (~320 lines)
+- `useReactivatingSessions.ts` — optimistic reactivation state store
+- `useVisibleSessionListViewData.ts` — session list data with optimistic moves
+- `useCanReactivateSession.ts` — reactivation hook with onError callback
+- `SessionsList.tsx` — inactive session rows (delete + reactivate swipe actions)
+- `ActiveSessionsGroup.tsx` — active session rows (archive swipe, reactivating indicator)
+- `ActiveSessionsGroupCompact.tsx` — compact active rows (archive swipe, reactivating spinner)
+- `haptics.ts` — added `hapticsMedium()` export (note: SwipeableRow inlines `expo-haptics` directly to avoid bundle cache issues)
