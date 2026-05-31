# App UI Patterns

Durable conventions and gotchas for the Happy app UI: badges, tool rendering, the permission/tool modal, gestures, and cross-platform (mobile/web) quirks.

## Conventions

- **Session list badges**: `CompactMemoryBadge`, `CompactBranchBadge`, `CompactGitStatus` — all follow the same chip pattern (height 16, fontSize 10, `surfaceHighest` bg).
- **Tool rendering pipeline**: `ToolView.tsx` → `knownTools` registry → `toolViewRegistry` → fallback JSON.
- **Tool icons**: use the `knownTools` icon factory `icon(size, color)`; fall back to Ionicons for question/plan/unknown tools.
- **Worktree detection**: `worktreeUtils.ts` detects `.dev/worktree/` and `.claude/worktrees/` path patterns.
- **Worktree creation**: app-side via `createWorktree()` → `machineBash()` RPC → `git worktree add`; path at `.dev/worktree/{name}`.
- **Worktree management**: `WorktreeListSection` on machine detail — `git worktree list --porcelain` via RPC.
- **i18n**: `_default.ts` is the source of truth + 10 translation files under `translations/`; keep technical terms (Worktree, Skill) untranslated.
- **Session hooks**: `useSessions()` returns `SessionListItem[] | null` (a `string | Session` union) — use `useAllSessions()` for a typed `Session[]`.
- **Experiment gate**: `useSetting('experiments')` — the worktree selector was gated, now promoted to always-visible.
- **Command messages**: skill/command expansions contain `<command-name>` XML tags in the user message text. Parsed by `parseCommandMessage.ts` in reducer Phase 1, rendered as a collapsible `CommandMessageBlock` in `MessageView.tsx`.

## Permission modal & tool modal

- **Unified permission modal (Claude sessions)**: inline `PermissionActionBar` (with the `inline` prop) below the tool bubble for pending permissions — no auto-open modal. Tap the header → expand-from-bubble animation via a `progress` shared value (0→1) + `interpolate`. Close → reverse animation (1→0). `measureInWindow` captures the bubble screen rect; `internalVisible` keeps the Modal mounted during the close animation. Outline buttons (transparent bg + colored border). AskUserQuestion has its own buttons; Codex keeps the old `PermissionFooter`. The anti-stacking registry is still active for banner modals.
- **Global permission banner**: `PermissionBanner.tsx` (~230 lines). Cross-session permissions as an amber-bordered chip (session name + tool description + input preview). Tap measures the banner rect and expands `ToolModal` from the banner position. `buildSyntheticToolCall()` bridges `PendingPermissionItem` → `ToolCall`.
- **Expand-from-bubble animation**: `ToolModal.tsx` uses a `progress` shared value + `useAnimatedStyle`/`interpolate` (works on iOS/Android/web). Custom `entering` functions DON'T work on web. The transparent `<Modal>` coordinate system matches screen coordinates. `ACTION_BAR_ESTIMATED_HEIGHT` positions the card when an action bar is present. Drag-to-resize is blocked while `progress < 0.95`.
- **Rich content tools**: Edit tools (Edit, Write, MultiEdit) get a larger card (near full screen), flex layout, drag-handle-only gesture. Regular tools get a smaller card with a full-card swipe gesture.
- **Rich content components**: `PlanSheetContent.tsx` (scrollable markdown), `QuestionSheetContent.tsx` (interactive form), `EditSheetContent.tsx` (scrollable diff view using `knownTools` Zod schemas + `ToolDiffView`).
- **Question submit sync**: `useQuestionFormState.ts` uses a module-level `submittedAnswerStore` Map for cross-instance answer synchronization between the modal and inline views. The CLI uses a deny-with-message workaround for AskUserQuestion (upstream CC bug).
- **Permission modal key files**: `ToolView.tsx` (inline action bar, `measureInWindow`, amber border), `ToolModal.tsx` (progress-driven expand/collapse, content routing), `PermissionActionBar.tsx` (outline buttons, `inline` variant, queue badge), `PermissionFooter.tsx` (Codex only), `PermissionBanner.tsx` (cross-session banner + expand from banner), `permissionBannerUtils.ts` (synthetic ToolCall bridge), `permissionModalRegistry.ts` (anti-stacking), `useCurrentSessionPermissions.ts` (data selector), `usePermissionActions.ts` (RPC dispatch), `useQuestionFormState.ts` (shared question form state).

### Tool modal split pop-out animation

The bubble-to-modal expansion uses a "split pop-out" architecture (a rework from a single-rect approach):

- `ToolView` splits the `measureInWindow` result into `headerRect` + `permBarRect` using `onLayout`-measured heights.
- `ToolModal` receives `sourceRects: { header, permBar }` plus a legacy `sourceRect` (banner path).
- The detail card starts from a header-only height and grows into the full modal ("tear apart" effect). The permission card starts from its inline position and slides to the bottom, with top corners rounding from 0→12.
- Both cards share `translateY` for synchronized bi-directional dismiss gestures.
- The permission card uses `bottom` positioning at rest (`p > 0.99`) for true auto-sizing, and `top` during animation.
- `PermissionActionBar` uses `inline={true}` + `containerStyle={{ borderTopWidth: 0 }}` in the modal for compact sizing.
- `onLayout` self-measurement is the fallback for the banner path (no pre-measurement available).
- `measureInWindow` is used for BOTH open and close paths (fixes the web coordinate mismatch).
- **Known cosmetic deferrals**: a black border can appear on non-pending bubbles (`overflow: hidden` + `borderRadius` artifact), and a header color flash can occur during expand (`surfaceHighest` vs `surfaceHigh` mismatch).
- **Key files**: `ToolModal.tsx`, `ToolView.tsx`, `PermissionActionBar.tsx` (added `containerStyle` prop).

### AskUserQuestion preview pane

- Options with `preview?: string` show a smart preview pane above the options list in `QuestionSheetContent`.
- **Renderer**: `OptionPreviewPane.tsx` — HTML → WebView (injected theme CSS), code → `SimpleSyntaxHighlighter`, text → monospace.
- **Content detection**: `detectContentType.ts` includes an `'html'` type — detection order is `JSON → HTML → Code → Text`. HTML heuristic: `/^<[a-z]/` (a lowercase tag prevents TypeScript-generics false positives).
- **Animation gotcha**: the `key` prop on a single React child does nothing. Wrap `Animated.View` in `[<Animated.View key=... />]` (a single-element array) so `key` triggers a remount and re-runs `FadeIn`.
- **Tab reset**: use a `useEffect` watching `form.activeTab` to reset `previewOptionIndex` — handles both manual tap and voice-bridge `active-tab-change` events.
- **Key files**: `OptionPreviewPane.tsx`, `QuestionSheetContent.tsx`, `detectContentType.ts`, `useQuestionFormState.ts` (`QuestionOption.preview`).

## Swipeable rows & optimistic UI

- **SwipeableRow**: unified cross-platform (no `.web.tsx` split). Uses `Gesture.Pan()` + Reanimated shared values. iOS Mail-style free sliding, full swipe-to-trigger with a vanish animation (slide off + height collapse). A module-level `Set` registry handles auto-close coordination. Web scroll: `touch-action: pan-y`; native: `failOffsetY`. No confirmation modals — actions fire immediately.
- **Optimistic reactivation UI**: `useReactivatingSessions.ts` (module-level `Set` + `useSyncExternalStore` with a version counter). `useVisibleSessionListViewData` moves reactivating sessions from inactive → active group. Active rows show an `ActivityIndicator` + "Reactivating..." until `session.active` becomes true. The error path calls `unmarkReactivating()` via the `useCanReactivateSession` `onError` callback.

## Gesture & scroll gotchas (mobile web)

These are hard-won fixes for react-native-gesture-handler and scroll behavior on React Native Web.

- **Async gesture race**: when gesture handlers use `runOnJS` to call async callbacks, `onStart` and `onEnd` can fire in the same JS microtask batch. If `onStart` begins an async operation (e.g. requesting mic permission + preparing a recorder) and `onEnd` calls a cleanup/stop function, the stop runs before the start finishes. **Fix**: use a `startPromise` ref — `start()` stores its promise, `stop()` awaits it before proceeding. See `useVoiceRecording.ts`. (Symptom that motivated this: "Cannot start an audio recording without initializing a MediaRecorder.")
- **Mobile web hijacks touch**: mobile (phone) browsers aggressively intercept long-press and touch events, breaking gesture-handler gestures (e.g. hold-to-record was completely non-functional). Required CSS overrides on gesture targets:
  - `touch-action: none` — prevents the browser from claiming touch for scroll/zoom
  - `userSelect: 'none'` — prevents text selection on long-press
  - `-webkit-touch-callout: none` — prevents the iOS Safari preview popup
  - `onContextMenu` → `e.preventDefault()` — prevents the context menu
  - Also: React Native's `FormData` pattern `{ uri, type, name }` does NOT work on web — fetch the blob URL first and wrap it as a `File`. See `VoiceMessageButton.tsx`.
- **Inverted FlatList on web**: `maintainVisibleContentPosition` does NOT work on React Native Web. On web, the inverted FlatList uses CSS `transform: scaleY(-1)` and the native scroll-position maintenance is bypassed entirely (`autoscrollToTopThreshold` is a no-op on web). For web chat scroll:
  - Manually manage `scrollTop`: capture `scrollHeight` before new content, offset `scrollTop += diff` in a `useLayoutEffect` (before paint), then animate back to 0.
  - Use a lerp (exponential decay) for smooth animation — handles rapid message accumulation naturally.
  - Check `scrollAnimRef.current !== 0` alongside `scrollTop < threshold` when deciding whether to animate — mid-animation `scrollTop` can be far from 0.
  - Snap `scrollTop = 0` on initial load (before paint) to avoid starting at the wrong position.
  - Set `overflow-anchor: none` on the scroll node so the browser doesn't also adjust scroll position.
  - A `useLayoutEffect` with no deps is needed to catch render-phase captured state (runs every render).
