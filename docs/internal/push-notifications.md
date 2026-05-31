# Push Notifications

The push notification system across mobile (Expo/OS), in-app banners, and the web (Service Worker).

- **Push flow**: CLI daemon → fetches push tokens from server → sends via the Expo Push API (`expo-server-sdk`) → device shows OS notification.
- **CLI triggers**: `permissionHandler.ts` sends on a permission request; `claudeRemoteLauncher.ts` sends a "ready" notification.
- **Server role**: token registry only (`AccountPushToken` table, CRUD via `pushRoutes.ts`) — the server never sends pushes directly.
- **Foreground suppression**: `sync.isAppActive` getter on the `Sync` class; the notification handler in `_layout.tsx` checks it before showing alerts.

## In-app notifications

- `viewingSessionId` in the Zustand store tracks the current session; `usePendingPermissionQueue()` selector returns the flattened cross-session permission queue; `PermissionBanner` shows quick allow/deny actions with animated queuing (one at a time, oldest first).
- **PermissionBanner redesign**: single mode — all tools show the same amber chip banner. No inline Allow/Deny on the banner. Tap measures the rect + expands `ToolModal` from the banner position. `surfaceHigh` for a solid opaque background. Pure functions in `permissionQueue.ts`; an equality check prevents re-render loops.

## Platform-specific delivery

- **Mobile action buttons (iOS)**: `notificationCategories.ts` registers a `PERMISSION_REQUEST` category with Allow/Deny via `setNotificationCategoryAsync`. `useNotificationActions.ts` handles responses via `addNotificationResponseReceivedListener`. The CLI sends `categoryId: 'PERMISSION_REQUEST'` in the push payload. Android degrades gracefully (buttons don't appear in the background — the user taps the body to open the app).
- **Web browser notifications**: Service Worker (`public/notification-sw.js`) + Browser Notification API. `useBrowserNotifications.web.ts` subscribes to the Zustand store, diffs the permission queue, and shows OS notifications when `document.hidden`. Native no-op stub at `useBrowserNotifications.ts`. Pure utilities in `utils/web/browserNotifications.ts`.
- **Tap navigation**: body tap on a push notification navigates to `/(app)/session/${sessionId}` via `router.push` (previously it just opened the app to the last screen).

## Key files

`PermissionBanner.tsx`, `permissionQueue.ts`, `useViewingSession.ts`, `usePendingPermissionQueue()` in `storage.ts`, `useNotificationActions.ts`, `notificationCategories.ts`, `useBrowserNotifications.web.ts`, `notification-sw.js`.
