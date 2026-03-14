# Agent Single Bubble — Data Flow & Dedup Architecture

**Completed**: 2026-03-14
**Status**: Working — single bubble with Prompt/Activity/Output tabs

---

## End-to-End Agent Data Flow (CLI → Wire → App)

### 1. CLI: sessionProtocolMapper.ts

When Claude Code spawns a subagent:

1. SDK emits `assistant` message with `tool_use` block (`name='Agent'`, `id='toolu_xxx'`)
2. Mapper **hides** the real tool_use — no `tool-call-start` envelope emitted (line ~508)
3. Creates subagent mapping: `toolu_xxx → CUID2` (via `queueTaskPromptSubagent`)
4. Stores metadata: prompt, subagent_type, description in `subagentMetadata` map
5. First sidechain message triggers `maybeEmitSubagentStart` → emits `start` envelope with `subagent: CUID2`, includes `prompt` and `subagentType` fields
6. All sidechain messages get `subagent: CUID2` header on their envelopes
7. When agent completes, `maybeEmitSubagentStop` → emits `stop` envelope with `result` (may be empty at this point)
8. The real `tool_result` for `toolu_xxx` flows through normally as `tool-call-end` envelope

### 2. CLI: claudeRemoteLauncher.ts

- Line ~360: Creates a **fake sidechain user message** for `'Task'` OR `'Agent'` tools
- This fake message enters the mapper and triggers `start` event early
- Without this, `start` only fires when real SDK sidechain messages arrive (delayed)

### 3. Wire: sessionProtocol.ts

- `start` event schema: `{ t: 'start', title?, prompt?, subagentType? }`
- `stop` event schema: `{ t: 'stop', result? }`
- Both carry `subagent: CUID2` in the envelope header

### 4. App: typesRaw.ts (raw message parsing)

- `start` event with `subagent` → **synthetic tool-call** content block:
  ```
  { type: 'tool-call', id: CUID2, name: 'Task', input: { description, prompt?, subagent_type? } }
  ```
- `stop` event with `subagent` → **synthetic tool-result** content block:
  ```
  { type: 'tool-result', tool_use_id: CUID2, content: result ?? '' }
  ```
- The CUID2 is used as both tool ID and sidechain parent UUID

### 5. App: reducerTracer.ts

- Synthetic tool-call registered in `toolCallToMessageId` (CUID2 → rawMessageId)
- Sidechain messages find parent via `toolCallToMessageId.get(parentUUID)` where parentUUID = CUID2
- Non-UUID parent references (like CUID2) are treated as subagent IDs

### 6. App: reducer.ts — The Dedup Logic

**The problem**: App receives BOTH:
- Real Agent `tool_use` (name='Agent', id='toolu_xxx', rich input with prompt/description/subagent_type)
- Synthetic Task from `start` event (name='Task', id=CUID2, minimal input)

Both create separate tool-call messages → two bubbles.

**The fix** (Phase 2, lines ~793-896): FIFO queue dedup

```
isRealAgent = c.name === 'Agent'
isSyntheticTask = c.name === 'Task' && !c.id.startsWith('toolu_')
```

- **Agent arrives first**: Creates message, pushes to `_unmatchedAgents` queue. When synthetic Task arrives, pops from queue, aliases its IDs to Agent's message, creates sidechain redirect.
- **Synthetic arrives first**: Creates message, pushes to `_unmatchedTasks` queue. When Agent arrives, pops from queue, merges input into Task's message, aliases Agent's tool ID.

**Sidechain redirect** (line ~1362-1368): Children are stored under the synthetic Task's raw message ID (set by tracer). The surviving Agent message has a different `realID`. A `_sidechainRedirects` Map bridges the gap in `convertReducerMessageToMessage`.

**Late result update** (Phase 3, lines ~933-942): The `stop` event marks tool as 'completed' with empty result `""`. The real `tool-call-end` arrives later with actual result text. Normally Phase 3 skips completed tools, but a special case allows Agent/Task tools completed with empty result to receive late updates.

### 7. App: AgentModalContent.tsx (display)

- `useAgentSections` hook splits sidechain children into:
  - **Prompt**: First agent-text/user-text message (or `tool.input.prompt` fallback)
  - **Activity**: Tool calls and intermediate agent text
  - **Output**: Trailing agent-text after last tool call, or `tool.result`
- Three tabs: Prompt (markdown), Activity (recursive ToolView), Output (markdown)
- Auto-switches to Output tab when agent completes

---

## ⚠️ Critical Pitfalls

### 1. Dual Message Problem
Both the real Agent `tool_use` AND the synthetic Task from `start` reach the app. The CLI hides the Agent `tool_use` (no `tool-call-start` envelope), but the raw `tool_use` block still flows through as part of the assistant message content. The FIFO queue dedup in the reducer handles this.

### 2. Sidechain Key Mismatch
Sidechain children are stored under `state.sidechains.get(rawMessageId)` where `rawMessageId` is the synthetic Task's raw message ID. But the surviving deduped message (Agent) has a different `realID`. The `_sidechainRedirects` map is essential — without it, the Activity tab is empty.

### 3. Result Timing Race
The `stop` event arrives first and marks the tool completed with empty result `""`. The `tool-call-end` envelope arrives later with the actual result text. Without the late result update exception in Phase 3, the Output tab would always be empty.

### 4. FIFO Queue Ordering Assumption
The dedup uses FIFO queues — parallel agents must arrive in matching order (real Agent 1 matches synthetic Task 1). This works because the CLI processes messages sequentially, but could break if message ordering is ever randomized.

### 5. `toolu_` Prefix Check
Synthetic Task IDs are CUID2 (no `toolu_` prefix). Real Agent IDs start with `toolu_`. The `isSyntheticTask` check relies on `!c.id.startsWith('toolu_')`. If Claude ever changes its tool ID format, this breaks.

### 6. Reducer State Extensions
The dedup uses `(state as any)._unmatchedAgents`, `_unmatchedTasks`, `_sidechainRedirects` — these are not in the ReducerState type definition. They're runtime-only extensions. This is intentional to avoid touching the type system for a dedup mechanism, but means they won't survive serialization.

---

## Key Files

| File | Role |
|---|---|
| `happy-cli/src/claude/utils/sessionProtocolMapper.ts` | Converts SDK messages → session protocol, hides Agent tool_use, emits start/stop |
| `happy-cli/src/claude/claudeRemoteLauncher.ts` | Creates fake sidechain message for Agent/Task tools (line ~360) |
| `happy-wire/src/sessionProtocol.ts` | Wire schemas for start/stop events |
| `happy-app/sources/sync/typesRaw.ts` | Converts start/stop envelopes → synthetic tool-call/tool-result |
| `happy-app/sources/sync/reducer/reducerTracer.ts` | Links sidechain messages to parent tools via CUID2 |
| `happy-app/sources/sync/reducer/reducer.ts` | FIFO dedup (Phase 2), late result (Phase 3), sidechain redirect |
| `happy-app/sources/components/tools/modal/AgentModalContent.tsx` | 3-tab display: Prompt/Activity/Output |
| `happy-app/sources/components/tools/knownTools.tsx` | Agent bubble title (subagent_type) and subtitle (description) |
