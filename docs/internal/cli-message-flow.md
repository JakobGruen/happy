# CLI Message Flow & Metadata Sync

How user/agent messages flow between the app, the CLI, and the wrapped Claude Code (CC) process, and how mode/model metadata stays in sync. Implementation-level companion to `cli-architecture.md` and `session-protocol-claude.md`.

## Core architecture

- The CLI wraps the local `claude` binary via `--output-format stream-json` (NOT the Claude Agents SDK).
- Metadata flow: CLI → server (encrypted) → app. The app sends per-message `meta` (model, permissionMode).
- `MessageQueue2` uses a mode hash to detect changes — a hash mismatch triggers a CC restart.
- RPC calls flow through Socket.IO: `apiSocket.sessionRPC(sessionId, method, params)`.

## User message echo architecture

CC does NOT echo user messages in its stdout stream. The CLI must send user session envelopes itself.

- **Why**: CC's `--output-format stream-json` output only contains `system`, `assistant`, `rate_limit_event`, and `result` messages. User messages pushed via `PushableAsyncIterable` are consumed silently.
- **How**: `claudeRemoteLauncher.ts` tracks pending user texts and sends `role:'user'` session envelopes based on CC's output signals:
  - **CC idle** (`ccBusy=false`): envelope sent immediately in the `nextMessage` callback (no pending bubble).
  - **CC busy** (`ccBusy=true`): text + timestamp queued in `pendingUserMessages`, flushed when CC emits `result` (turn complete) or the first `assistant`/`system` message.
  - Deferred envelopes carry the **original send timestamp** so they sort correctly before CC's responses.
- **`PushableAsyncIterable.onConsumed` is NOT reliable** — the SDK eagerly consumes from the iterable (buffers internally), so `onConsumed` fires before CC actually processes the message.
- **Image handling**: session envelopes only carry text (`{t:'text', text:'...'}`). Image data lives in the app's `PendingMessage` store (base64). When a user session envelope arrives, `applyMessages` in `sync.ts` enriches it with pending image data (upgrades `text` → `multimodal` content) before entering the reducer.
- **Key files**: `claudeRemoteLauncher.ts` (`pendingUserMessages`, `ccBusy`, `flushPendingUserEnvelopes()`), `claudeRemote.ts` (producer loop pushes to `PushableAsyncIterable`), `sync.ts` (`sendMessage()` stores images, `applyMessages()` enriches), `PendingMessages.tsx`, `storage.ts` (`PendingMessage` with optional `images`).

## Metadata sync — CC as source of truth

- **Model registry**: `@jakobgruen/happy-wire/src/claudeModels.ts` — shared between CLI and app. `normalizeModelCode()` maps full SDK IDs (e.g. `claude-opus-4-20250514`) to shorthand (`opus`). `onModelDetected` in `claudeRemoteLauncher.ts` handles dynamic discovery of unknown models.
- **No `default` model** — the selector always shows the actual model (sonnet/opus/haiku).
- Turn-end stats (`durationMs`, `numTurns`, `costUsd`) flow through session protocol envelopes.
- **Display priority**: the app resolves mode/model from `session.metadata` (CC truth) first, with `session.permissionMode`/`session.modelMode` (local) as fallback only before metadata arrives.
- **Mode reconciliation**: the CLI scans every message for `EnterPlanMode`/`ExitPlanMode` tool calls → updates `permissionHandler`, metadata, and emits a `permission-mode-changed` event. `prePlanMode` tracks the mode to restore on exit.
- **Model switch RPC fix**: `session.onModelSwitch` callback wired from `runClaude.ts` → `claudeRemoteLauncher.ts` RPC handler now updates `currentModel` (not just metadata).
- **No optimistic local state**: app mode/model change handlers send the RPC only; the display updates when the CLI confirms via metadata. Retry with backoff after 2s; local-state fallback on RPC failure.
- **`model-changed` event**: new session event type (alongside `permission-mode-changed`). Emitted from the `switch-model` RPC and `onModelDetected`. The app reducer handles it and updates `session.modelMode` via storage.
- **Key files**: `claudeRemoteLauncher.ts` (RPC handlers, SDK lifecycle, permission/model switching), `runClaude.ts` (main loop, message processing, metadata updates), `modelModeOptions.ts` (app-side resolution, metadata-first), `SessionView.tsx` (wires selectors, fires RPCs), `messageMeta.ts` (per-message meta resolution).

## Eager session initialization

- **Feature**: when the '+' button creates a session, CC starts immediately without waiting for the first user message. Type-hints for slash commands/file links work immediately, and the voice agent is available from session start.
- **Implementation (Approach B)**: `claudeRemote.ts` spawns the SDK with an empty `PushableAsyncIterable` stream, then pushes the first message asynchronously. The SDK starts eagerly; the message queue fills as messages arrive. Mode/command handling is deferred to the first message.
- **Pattern**: an async first-message handler (`async IIFE`) processes `/clear`, `/compact` commands and mode settings without blocking SDK startup.
- **Backward compatible**: no app or daemon changes — pure CLI-side improvement.

## Agent single-bubble dedup

- **Problem**: Agent tool calls showed TWO bubbles — the real Agent `tool_use` plus a synthetic Task from the `start` event.
- **Fix**: FIFO queue dedup in reducer Phase 2 merges them into one bubble.
- **Sidechain redirect**: children stored under the synthetic Task's raw ID; the surviving Agent has a different `realID` → `_sidechainRedirects` Map bridges the gap.
- **Late result**: the `stop` event marks completed with `""`; `tool-call-end` arrives later with the actual result → a Phase 3 exception allows the update.
- **Wire enrichment**: the `start` event now carries `prompt` and `subagentType` fields (added to the wire schema).
- **Display**: `AgentModalContent.tsx` — 3-tab modal (Prompt/Activity/Output); `knownTools.tsx` shows `subagent_type` as title, `description` as subtitle.
- **Pitfalls**: `isSyntheticTask` uses `!c.id.startsWith('toolu_')` — fragile if Claude changes the tool ID format. Dedup uses `(state as any)._unmatchedAgents` etc. — not in the `ReducerState` type, won't survive serialization.

## CLI hook injection architecture

- **Key file**: `packages/happy-cli/src/claude/utils/generateHookSettings.ts`.
- **Principle**: hooks that depend on happy MCP tools (like `mcp__happy__log_step`) must be injected via the CLI, not placed in global `~/.claude/settings.json`. Global settings apply to ALL CC sessions including vanilla ones where happy tools don't exist.
- **Injected hooks (happy sessions only)**:
  - `SessionStart` → `session_hook_forwarder.cjs` (notifies the HTTP server)
  - `Stop` → `enforce_log_step.cjs` (blocks the turn if work was done without `log_step`)
  - `PostToolUse[TodoWrite]` → prompt nudge to sync `log_step`
  - `PostToolUse[mcp__happy__log_step]` → prompt nudge to sync TodoWrite
- **Global hooks (all CC sessions)**: `Stop` → `enforce-ask-tool.py` (blocks plain-text questions/plans).
- **How it works**: `generateHookSettingsFile(port)` writes a temp settings JSON to `~/.happy/tmp/hooks/session-hook-<pid>.json`. The CLI passes this file to CC via `--settings`. Cleaned up by `cleanupHookSettingsFile()`.
