# CC as Source of Truth for Mode/Model Sync

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Claude Code the single source of truth for the displayed permission mode, model, and their available options — eliminating stale local state in the app.

**Architecture:** The app derives its display exclusively from `session.metadata.currentOperatingModeCode` and `session.metadata.currentModelCode` (written by CLI). Two reconciliation triggers keep these in sync:

1. **After every CC message** — CLI scans tool calls for mode-changing tools (`EnterPlanMode`, `ExitPlanMode`) and reconciles state
2. **After app-initiated mode/model change** — CLI processes the RPC, updates state, and confirms via session event. App retries with backoff if confirmation doesn't arrive.

When the user changes mode/model in the app, the app sends an RPC to CLI and waits for CLI to confirm via metadata update + session event (no optimistic local state).

**Tech Stack:** TypeScript (React Native app + Node.js CLI), Zod schemas (happy-wire), Socket.IO RPCs

---

## Current Architecture (Bug Analysis)

### Problem 1: EnterPlanMode not reflected in app
When CC autonomously uses `EnterPlanMode`, the CLI has **no code** that detects this and emits a `permission-mode-changed` event. Only the `switch-permission-mode` RPC handler (app-initiated) sends that event. The app never learns CC entered plan mode.

### Problem 2: App local state takes priority over CC state
`SessionView.tsx:207-212` resolves display with:
```ts
resolveCurrentOption(availableModes, [
    session.permissionMode,              // 1st: LOCAL app state (stale!)
    session.metadata?.currentOperatingModeCode,  // 2nd: CC metadata (truth!)
    getDefaultPermissionModeKey(flavor),  // fallback
])
```
Same pattern for model at lines 214-220. The local state is set optimistically on user interaction, meaning even when CC reports a different mode via metadata, the app shows the stale local value.

### Problem 3: Model RPC doesn't update CC's running state
The `switch-model` RPC handler at `claudeRemoteLauncher.ts:127-137` only updates metadata, not the `currentModel` variable in `runClaude.ts`. The actual model change only happens when the next user message carries `meta.model`.

### Problem 4: Hardcoded options
Models and modes are hardcoded in both CLI (`claudeModels.ts`) and app (`modelModeOptions.ts`). The app already reads `session.metadata.models` / `session.metadata.operatingModes` when available, falling back to hardcoded lists. This is acceptable for now since CC doesn't dynamically expose its supported modes.

---

## Implementation Plan

### Task 1: CLI — Mode reconciliation after every message

**Files:**
- Modify: `packages/happy-cli/src/claude/claudeRemoteLauncher.ts:205-216`

The CLI already processes every SDK message in the `onMessage` handler. We add a reconciliation step: after processing each message, check if any tool calls indicate a mode change, and if so, sync state to the app.

**Step 1: Track mode-changing tool calls and reconcile**

The CLI already has a `planModeToolCalls` Set that tracks `ExitPlanMode` tool IDs. Extend this to also track `EnterPlanMode`. When detected, immediately:
1. Update `permissionHandler` mode
2. Update metadata `currentOperatingModeCode`
3. Emit `permission-mode-changed` session event

Add a `prePlanMode` variable to remember the mode before plan mode was entered, so we can restore it on exit.

```ts
// Near line 74 (declarations section), add:
let prePlanMode: PermissionMode | undefined;

// In the onMessage handler (runs for EVERY message), around line 206-216:
// Replace the existing ExitPlanMode-only detection with full reconciliation:
if (message.type === 'assistant') {
    let umessage = message as SDKAssistantMessage;
    if (umessage.message.content && Array.isArray(umessage.message.content)) {
        for (let c of umessage.message.content) {
            if (c.type === 'tool_use') {
                // CC entered plan mode
                if (c.name === 'enter_plan_mode' || c.name === 'EnterPlanMode') {
                    logger.debug('[remote]: mode reconciliation — CC entered plan mode');
                    prePlanMode = permissionHandler.getPermissionMode();
                    permissionHandler.handleModeChange('plan');
                    session.client.updateMetadata((m) => ({
                        ...m, currentOperatingModeCode: 'plan',
                    }));
                    session.client.sendSessionEvent({
                        type: 'permission-mode-changed', mode: 'plan',
                    });
                }
                // CC wants to exit plan mode — track for result handling
                if (c.name === 'exit_plan_mode' || c.name === 'ExitPlanMode') {
                    logger.debug('[remote]: detected ExitPlanMode tool call ' + c.id!);
                    planModeToolCalls.add(c.id! as string);
                }
            }
        }
    }
}
```

**Step 2: Add mode restore on ExitPlanMode tool result**

Find where `planModeToolCalls.has(c.tool_use_id)` is checked (around line 261, the "hack plan mode exit" block). After the existing logic, add mode restoration:

```ts
// After the existing plan mode hack block, add:
if (c.type === 'tool_result' && c.tool_use_id && planModeToolCalls.has(c.tool_use_id)) {
    const restoreMode = prePlanMode ?? 'default';
    logger.debug(`[remote]: mode reconciliation — CC exited plan mode, restoring ${restoreMode}`);
    permissionHandler.handleModeChange(restoreMode);
    session.client.updateMetadata((m) => ({
        ...m, currentOperatingModeCode: restoreMode,
    }));
    session.client.sendSessionEvent({
        type: 'permission-mode-changed', mode: restoreMode,
    });
    planModeToolCalls.delete(c.tool_use_id);
    prePlanMode = undefined;
}
```

**Step 3: Run CLI tests**

Run: `cd packages/happy-cli && bun run build && bun test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/happy-cli/src/claude/claudeRemoteLauncher.ts
git commit -m "fix(cli): reconcile mode state after every message — detect EnterPlanMode/ExitPlanMode"
```

---

### Task 2: CLI — Make model switch RPC update the running model

**Files:**
- Modify: `packages/happy-cli/src/claude/claudeRemoteLauncher.ts:127-137`
- Modify: `packages/happy-cli/src/claude/runClaude.ts:328`

The `switch-model` RPC only updates metadata. The `currentModel` variable in `runClaude.ts` controls what model CC actually uses next, but it's inaccessible from the RPC handler.

**Step 1: Expose currentModel via callback**

In `runClaude.ts`, after `let currentModel = options.model;` (line 328), add a callback:
```ts
const handleModelSwitch = (model: string) => {
    currentModel = model;
    logger.debug(`[loop] Model switched via RPC to: ${model}`);
};
```

Pass `handleModelSwitch` into the remote launcher setup via the session/options object that `claudeRemoteLauncher` receives. Check what interface `session` uses and add `onModelSwitch` to it.

**Step 2: Update switch-model RPC handler**

In `claudeRemoteLauncher.ts`, update the handler to call the callback:
```ts
session.client.rpcHandlerManager.registerHandler<{ model: string }, void>(
    'switch-model', async (data) => {
        const { model } = data;
        logger.debug(`[remote]: Model switch → ${model}`);

        // Update running model state
        onModelSwitch(model);

        // Sync metadata
        session.client.updateMetadata((m) => ({
            ...m,
            currentModelCode: model,
        }));
    }
);
```

**Step 3: Run CLI tests**

Run: `cd packages/happy-cli && bun run build && bun test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/happy-cli/src/claude/claudeRemoteLauncher.ts packages/happy-cli/src/claude/runClaude.ts
git commit -m "fix(cli): model switch RPC now updates running model state, not just metadata"
```

---

### Task 3: App — Remove local state priority, use metadata as source of truth

**Files:**
- Modify: `packages/happy-app/sources/-session/SessionView.tsx:206-220` (display priority)
- Modify: `packages/happy-app/sources/-session/SessionView.tsx:244-254` (RPC dispatch)

**Step 1: Flip display priority — metadata first**

```ts
// BEFORE (local state wins):
resolveCurrentOption(availableModes, [
    session.permissionMode,                       // 1st: LOCAL (stale!)
    session.metadata?.currentOperatingModeCode,   // 2nd: CC metadata
    getDefaultPermissionModeKey(flavor),
])

// AFTER (CC metadata wins):
resolveCurrentOption(availableModes, [
    session.metadata?.currentOperatingModeCode,   // 1st: CC metadata (truth!)
    session.permissionMode,                       // 2nd: fallback before metadata arrives
    getDefaultPermissionModeKey(flavor),
])
```

Same for model:
```ts
resolveCurrentOption(availableModels, [
    session.metadata?.currentModelCode,           // 1st: CC metadata (truth!)
    session.modelMode,                            // 2nd: fallback
    getDefaultModelKey(flavor),
])
```

**Step 2: Remove optimistic local state from change handlers**

Remove `storage.getState().updateSessionPermissionMode()` and `updateSessionModelMode()` from the RPC dispatch callbacks. The display should only update when CLI confirms via metadata.

```ts
// AFTER — RPC only, no local state:
const updatePermissionMode = React.useCallback((mode: PermissionMode) => {
    apiSocket.sessionRPC(sessionId, 'switch-permission-mode', { mode: mode.key }).catch(() => {});
}, [sessionId]);

const updateModelMode = React.useCallback((mode: ModelMode) => {
    apiSocket.sessionRPC(sessionId, 'switch-model', { model: mode.key }).catch(() => {});
}, [sessionId]);
```

**Step 3: Run typecheck**

Run: `cd packages/happy-app && bun typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/happy-app/sources/-session/SessionView.tsx
git commit -m "fix(app): use CC metadata as source of truth for mode/model display"
```

---

### Task 4: App — Retry with backoff when mode/model change not confirmed

**Files:**
- Modify: `packages/happy-app/sources/-session/SessionView.tsx` (updatePermissionMode, updateModelMode)

After the app sends a mode/model change RPC, it waits for CLI confirmation via metadata update. If the confirmation doesn't arrive (network issue, CLI busy), the app should retry.

**Step 1: Add confirmation check with delayed retry**

```ts
const updatePermissionMode = React.useCallback((mode: PermissionMode) => {
    const sendRPC = () =>
        apiSocket.sessionRPC(sessionId, 'switch-permission-mode', { mode: mode.key });

    sendRPC()
        .then(() => {
            // RPC delivered — CLI should update metadata shortly.
            // Check after 2s if metadata actually changed; retry if not.
            setTimeout(() => {
                const current = storage.getState().sessions[sessionId];
                if (current?.metadata?.currentOperatingModeCode !== mode.key) {
                    logger.debug(`[mode] Retry: mode not confirmed after 2s, retrying RPC`);
                    sendRPC().catch(() => {
                        // Final fallback: set local state so UI isn't stuck
                        storage.getState().updateSessionPermissionMode(sessionId, mode.key);
                    });
                }
            }, 2000);
        })
        .catch(() => {
            // CLI offline — fall back to local state
            storage.getState().updateSessionPermissionMode(sessionId, mode.key);
        });
}, [sessionId]);
```

Same pattern for `updateModelMode` with `currentModelCode`.

**Step 2: Run typecheck**

Run: `cd packages/happy-app && bun typecheck`

**Step 3: Commit**

```bash
git add packages/happy-app/sources/-session/SessionView.tsx
git commit -m "fix(app): retry mode/model change with backoff, fallback to local state on failure"
```

---

### Task 5: CLI — Emit model-changed session event

**Files:**
- Modify: `packages/happy-cli/src/claude/claudeRemoteLauncher.ts` (switch-model RPC + onModelDetected)
- Modify: `packages/happy-app/sources/sync/typesRaw.ts:43-46` (add model-changed event schema)
- Modify: `packages/happy-app/sources/sync/reducer/reducer.ts` (handle model-changed event)
- Modify: `packages/happy-app/sources/sync/storage.ts` (apply modelChanged from reducer)

Currently there's a `permission-mode-changed` session event but no `model-changed` event. Model changes only propagate via metadata (slower, no reactive trigger).

**Step 1: Add model-changed event to app schema**

In `typesRaw.ts`, extend `agentEventSchema`:
```ts
z.object({
    type: z.literal('model-changed'),
    model: z.string(),
})
```

**Step 2: Emit from CLI**

In `switch-model` RPC handler, add:
```ts
session.client.sendSessionEvent({ type: 'model-changed', model });
```

In `onModelDetected` callback (line 479-492), add:
```ts
session.client.sendSessionEvent({ type: 'model-changed', model: normalized });
```

**Step 3: Handle in app reducer**

In `reducer.ts`, add (after the `permission-mode-changed` handler at line 299):
```ts
if (msg.role === 'event' && msg.content.type === 'model-changed') {
    state.messageIds.set(msg.id, msg.id);
    modelChanged = msg.content.model;
    continue;
}
```

In `storage.ts`, after the `permissionModeChanged` handling, add:
```ts
if (modelChanged) {
    get().updateSessionModelMode(sessionId, modelChanged);
}
```

**Step 4: Run tests**

Run: `bun test:wire && bun test:cli`

**Step 5: Commit**

```bash
git add packages/happy-wire packages/happy-cli packages/happy-app
git commit -m "feat: add model-changed session event for CLI→app model sync"
```

---

### Task 6: Integration test — verify round-trip

**Manual testing checklist:**

1. **Plan mode via CC**: Start a session, have CC use `EnterPlanMode` → app should show "Plan" mode
2. **Plan mode exit**: Have CC use `ExitPlanMode` → app should restore previous mode
3. **Mode change from app**: Change mode in app selector → should update after CLI confirms (~500ms)
4. **Mode change retry**: Change mode while CLI is slow → should retry after 2s
5. **Model change from app**: Change model in app selector → should update after CLI confirms
6. **Offline mode change**: Disconnect CLI, change mode in app → should update immediately (fallback)
7. **Model detection**: Start session → app should show the actual model CC is using (from `onModelDetected`)

---

### Task 7 (Future): Dynamic option discovery from CC

**Not in scope**, but worth noting: CC doesn't dynamically expose which modes it supports. The current hardcoded list in `claudeModels.ts` (`default`, `acceptEdits`, `plan`, `bypassPermissions`) is acceptable since Happy controls the mode-to-SDK mapping. Dynamic model discovery already works via `onModelDetected` (unknown models are auto-added to metadata).

---

## Summary of Changes

| Component | File | Change |
|---|---|---|
| CLI | `claudeRemoteLauncher.ts` | Mode reconciliation on every message, model RPC updates state, emit model-changed event |
| CLI | `runClaude.ts` | Expose `currentModel` mutator for RPC handler |
| App | `SessionView.tsx` | Flip priority: metadata > local state, remove optimistic updates, retry with backoff |
| App | `typesRaw.ts` | Add `model-changed` event schema |
| App | `reducer.ts` | Handle `model-changed` event |
| App | `storage.ts` | Apply `modelChanged` from reducer output |

**Two reconciliation triggers:**
1. **Every CC message** — CLI scans for mode-changing tool calls → emits `permission-mode-changed`
2. **App-initiated change** — RPC → CLI confirms via event/metadata → app retries at 2s if unconfirmed

**UX trade-off:** Removing optimistic updates adds ~500ms latency to mode/model selector changes. Correctness > speed. The retry-with-backoff ensures changes aren't silently lost.
