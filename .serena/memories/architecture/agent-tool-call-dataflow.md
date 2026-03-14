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

diff --git a/.serena/memories/architecture/agent-tool-call-dataflow.md b/.serena/memories/architecture/agent-tool-call-dataflow.md
new file mode 100644
index 00000000..ad85ef3c
--- /dev/null
+++ b/.serena/memories/architecture/agent-tool-call-dataflow.md
@@ -0,0 +1,718 @@
+# 📡 Agent Tool Call Data Flow: CLI → App
+
+Complete tracing of how Agent subagent tool calls travel from Claude SDK through CLI, wire protocol, to the app, including dedup logic and sidechain rendering.
+
+---
+
+## 🏗️ Layer 1: CLI Session Protocol Mapper
+
+**File**: `packages/happy-cli/src/claude/utils/sessionProtocolMapper.ts`
+
+### Agent Tool Detection & Hiding
+
+When SDK emits `tool_use` blocks with `name === 'Task'`:
+- These are **subagent spawning calls** (e.g., creating a new agent to handle a sub-prompt)
+- Mapper **marks them as "hidden"** via `getHiddenParentToolCalls(state).add(call)` (line 336)
+- Hidden tools are **NOT emitted** to wire as normal `tool-call-start` events
+- Instead, their results flow through synthetic `start`/`stop` events (see below)
+
+### Subagent Lifecycle Tracking
+
+**State maps**:
+- `uuidToProviderSubagent`: Maps SDK message UUID → provider subagent ID (e.g., task tool use ID)
+- `providerSubagentToSessionSubagent`: Maps provider subagent ID → session subagent ID (CUID2)
+- `taskPromptToSubagents`: Maps task prompt text → list of subagent IDs (for orphan buffering)
+- `startedSubagents`: Set of subagent IDs that have emitted `start` events
+- `activeSubagents`: Set of subagent IDs currently active (cleared on `stop`)
+- `hiddenParentToolCalls`: Set of provider subagent IDs NOT to emit as normal tool calls
+
+### Message Buffering for Out-of-Order Delivery
+
+When a subagent is referenced before its `Task` tool call arrives:
+- Messages are **buffered** in `bufferedSubagentMessages[providerId]` (line 82)
+- When `Task` is processed, buffered messages are **replayed immediately** via recursive `mapClaudeLogMessageToSessionEnvelopesInternal` (lines 347–353)
+- If a tool result arrives for a hidden parent (Task), it's processed as an `agent.stop` event with the result (lines 568–580)
+
+### Event Emission: `maybeEmitSubagentStart` & `maybeEmitSubagentStop`
+
+**Start event** (line 289):
+```typescript
+envelopes.push(createEnvelope('agent', {
+    t: 'start',
+    ...(title ? { title } : {}),
+}, { turn, subagent }));
+```
+- Emitted once per subagent (tracked in `startedSubagents`)
+- Contains optional `title` from task description/input
+- Marks subagent as `activeSubagents`
+
+**Stop event** (line 305):
+```typescript
+envelopes.push(createEnvelope('agent', {
+    t: 'stop',
+    ...(result && result.length > 0 ? { result } : {}),
+}, { turn, subagent }));
+```
+- Emitted when tool result for hidden task arrives
+- Contains result text (extracted from `block.content`)
+- Removes subagent from `activeSubagents`
+
+**Key property**: `subagent` field contains the **session subagent ID** (CUID2), not the provider task ID.
+
+---
+
+## 🔗 Layer 2: Wire Protocol Events
+
+**File**: `packages/happy-wire/src/sessionProtocol.ts`
+
+### Event Types
+
+Nine discriminated union event types:
+```typescript
+type SessionEvent = 
+  | { t: 'text'; text: string; thinking?: boolean }
+  | { t: 'service'; text: string }
+  | { t: 'tool-call-start'; call: string; name: string; args: Record<string, unknown>; ... }
+  | { t: 'tool-call-end'; call: string; result?: string; isError?: boolean }
+  | { t: 'file'; ref: string; name: string; size: number; image?: {...} }
+  | { t: 'turn-start' }
+  | { t: 'start'; title?: string }  // ← Subagent start
+  | { t: 'turn-end'; status: 'completed' | 'failed' | 'cancelled'; ... }
+  | { t: 'stop'; result?: string }  // ← Subagent stop
+```
+
+### Envelope Structure
+
+```typescript
+type SessionEnvelope = {
+  id: string;              // CUID2 message ID
+  time: number;
+  role: 'user' | 'agent';
+  turn?: string;           // Turn ID (CUID2)
+  subagent?: string;       // Session subagent ID (CUID2)
+  ev: SessionEvent;
+};
+```
+
+**Critical**: The `subagent` field **uniquely identifies** which agent/task this event belongs to. All events from the same subagent (start, text, tool calls, stop) share the same `subagent` CUID2.
+
+---
+
+## 📝 Layer 3: App Raw Message Parsing
+
+**File**: `packages/happy-app/sources/sync/typesRaw.ts`
+
+### Synthetic Task Creation from `start`/`stop` Events
+
+When `SessionEnvelope` with `ev.t === 'start'` arrives:
+
+```typescript
+if (envelope.ev.t === 'start' && envelope.subagent) {
+    return {
+        id: messageId,  // From envelope.id
+        role: 'agent',
+        isSidechain: false,
+        content: [{
+            type: 'tool-call',
+            id: envelope.subagent,        // ← Uses subagent ID as tool ID
+            name: 'Task',
+            input: { description: envelope.ev.title ?? 'Agent' },
+            description: envelope.ev.title ?? null,
+            uuid: contentUUID,             // From envelope.id (for tracer)
+            parentUUID: null
+        }],
+    };
+}
+```
+
+**Key insight**: A synthetic `tool-call` message is created with:
+- Tool ID = session subagent ID (the CUID2 from `envelope.subagent`)
+- Name = `'Task'` (literal)
+- Input = description from optional `envelope.ev.title`
+
+When `ev.t === 'stop'` arrives:
+
+```typescript
+if (envelope.ev.t === 'stop' && envelope.subagent) {
+    return {
+        id: messageId,
+        role: 'agent',
+        isSidechain: false,
+        content: [{
+            type: 'tool-result',
+            tool_use_id: envelope.subagent,     // ← Matches tool ID from start
+            content: envelope.ev.result ?? '',
+            is_error: false,
+            uuid: contentUUID,
+            parentUUID: null
+        }],
+    };
+}
+```
+
+### UUID Tracking for Sidechain Matching
+
+- `envelope.id` becomes the `uuid` of the synthetic content (for tracer to track parent/child relationships)
+- `envelope.subagent` becomes the **tool call ID**, used to match start/stop and to link sidechain messages
+
+### Sidechain Message Routing
+
+Sidechain messages arrive with `subagent` set:
+- `isSidechain: true` is set by the raw message normalizer
+- These messages **inherit** the `subagent` field from their originating event
+- Used later by reducer to group children under parent Task
+
+---
+
+## 🧬 Layer 4A: Reducer Tracer (Message Relationship Linking)
+
+**File**: `packages/happy-app/sources/sync/reducer/reducerTracer.ts`
+
+### Task Tool Indexing
+
+When a **synthetic Task tool-call** is encountered:
+
+```typescript
+if (content.type === 'tool-call' && content.name === 'Task') {
+    state.taskTools.set(message.id, {
+        messageId: message.id,
+        prompt: content.input.prompt
+    });
+    state.promptToTaskId.set(content.input.prompt, message.id);
+    
+    // Also track by tool ID (subagent ID) for session-protocol children
+    state.toolCallToMessageId.set(content.id, message.id);
+}
+```
+
+**Maps created**:
+- `taskTools`: Message ID → Task info (for lookup by sidechain root)
+- `promptToTaskId`: Normalized prompt → Task message ID (for sidechain root matching)
+- `toolCallToMessageId`: Tool ID (subagent ID) → Task message ID (for session-protocol orphans)
+
+### Sidechain Root Matching
+
+Messages with `isSidechain: true` are checked:
+- Look for content type `sidechain` with a `prompt` field
+- Match prompt against `promptToTaskId`
+- Assign matched Task message ID as `sidechainId`
+- Process any orphans waiting for this message UUID
+
+### Parent-Child Linking via UUID
+
+Sidechain messages with `parentUUID` (parent message's UUID):
+- Lookup parent's sidechain ID from `uuidToSidechainId`
+- Inherit the same `sidechainId`
+- Recursively process orphans
+
+### Orphan Handling
+
+Out-of-order messages (child arrives before parent):
+- Buffered in `orphanMessages[parentUuid]`
+- When parent arrives, orphans are processed recursively
+- Prevents permanent orphaning of messages
+
+**Session-protocol children** (real Agent tool-calls from subagent):
+- Have `parentUUID === null` but `subagent` field set
+- Are matched to synthetic Task via `toolCallToMessageId` lookup
+- Inherit the Task's `sidechainId`
+
+---
+
+## 🔄 Layer 4B: Reducer Message Processing
+
+**File**: `packages/happy-app/sources/sync/reducer/reducer.ts`
+
+### Phase 0: Separate Sidechain from Non-Sidechain
+
+Messages split into two arrays based on `message.isSidechain`:
+- **Non-sidechain**: Main conversation messages (permissions, tool calls, text)
+- **Sidechain**: Messages belonging to subagent execution contexts
+
+### Phase 1: User Messages & Dedupe
+
+For user messages:
+- Track `localId` (if present) to prevent duplicate sends
+- Track message `id` globally to dedupe
+- Assign internal message ID
+
+For agent messages:
+- Dedupe by `message.id` (prevent re-processing same wire envelope)
+- Extract and create text/thinking content messages
+
+### Phase 2: Non-Sidechain Tool Calls (Synthetic Tasks & Real Tools)
+
+**Dedup logic** (line 756):
+
+```typescript
+const existingMessageId = state.toolIdToMessageId.get(c.id);
+if (existingMessageId) {
+    // Tool already created — update existing message
+    // (permission → running, add description, etc.)
+} else {
+    // New tool — create message with optional permission data
+}
+```
+
+**For synthetic Task tool-calls**:
+- `c.id` = session subagent ID (CUID2)
+- `c.name` = `'Task'`
+- `c.input.description` = agent title/description
+- Creates a `ToolCall` message with `state: 'running'`
+- Maps `toolIdToMessageId[subagentId] → internalMessageId`
+
+**Special handling** (line 770):
+- If permission exists and was approved, transitions from `completed` → `running` when execution starts
+- Means the UI shows pending→approved transition, then running→completed on finish
+
+### Phase 3: Non-Sidechain Tool Results
+
+For tool results:
+- Lookup source tool via `toolIdToMessageId[tool_use_id]`
+- Update tool state: `running` → `completed`/`error`
+- Store result content
+- Update permission metadata from server response
+
+**For synthetic Task stop events**:
+- `tool_use_id` = session subagent ID
+- `content` = result text from `stop` event
+- Transitions Task to `completed` with result
+
+### Phase 4: Sidechain Messages
+
+For each sidechain message with `sidechainId`:
+- Lookup Task message ID from `sidechainId`
+- Store sidechain message in `state.sidechains[taskMessageId]`
+- These are nested children of the Task
+
+**Sidechain content types**:
+- **Root** (`type: 'sidechain'`): Converted to user message with the prompt text
+- **Text/thinking**: Created as agent text messages
+- **Tool-calls**: Created as tool messages (nested)
+- **Tool-results**: Match nested tool and update state
+
+**Post-Task redirect** (line 972):
+- If text arrives after Task completes, redirect to main chat
+- Defends against CLI sending `subagent` on post-execution text
+- Uses `taskCompletedAt` timestamp comparison
+
+---
+
+## 💾 Layer 5: Reducer Message Conversion
+
+**File**: `packages/happy-app/sources/sync/reducer/reducer.ts` lines 1273–1330
+
+### Sidechain Child Lookup
+
+When converting a tool message to display format:
+
+```typescript
+const children = reducerMsg.realID 
+    ? state.sidechains.get(reducerMsg.realID) || [] 
+    : [];
+```
+
+**Critical gotcha**: Children are stored under the **Task's `realID`** (the synthetic message envelope ID), not the internal message ID!
+
+- `reducerMsg.realID` = `envelope.id` from the `start` event
+- This is the **message ID** of the synthetic Task, not the tool ID
+- Why? Because `state.sidechains` is indexed by **message ID**, not tool ID
+
+### Message Object Structure
+
+```typescript
+type ReducerMessage = {
+    id: number;              // Internal ID (1, 2, 3, ...)
+    realID: string;          // Message ID from wire (envelope.id)
+    role: 'user' | 'agent';
+    createdAt: number;
+    text: string | null;
+    tool: ToolCall | null;
+    event: null;
+    meta?: MessageMeta;
+};
+```
+
+### Tool Message Output Format
+
+```typescript
+{
+    id: reducerMsg.id,
+    localId: null,
+    createdAt: reducerMsg.createdAt,
+    kind: 'tool-call',
+    tool: { ...reducerMsg.tool },
+    children: childMessages,  // ← Sidechain messages
+    meta: reducerMsg.meta
+}
+```
+
+**Children recursively converted**, so nested tools are also fully populated with their own children.
+
+---
+
+## 🎨 Layer 6: Display in Task/Tool Views
+
+**File**: `packages/happy-app/sources/components/tools/views/TaskView.tsx`
+
+### Task as a Container
+
+`TaskView` receives:
+- `tool: ToolCall` — the Task tool object
+- `metadata` — session/user context
+- `messages: Message[]` — **the children** of this tool call
+
+### Rendering Task Progress
+
+TaskView displays:
+- Title: From tool description or extracted via `knownTools` registry
+- Status indicator:
+  - `running`: Spinner (amber/warning color)
+  - `completed`: Checkmark (green/success)
+  - `error`: X circle (red/destructive)
+- Last 3 tools shown, "N more" label if > 3
+
+**No modal opening**: TaskView is a **compact status display**, not clickable.
+
+### Real Tool Calls vs Synthetic Tasks
+
+Real tool calls (Bash, Write, etc.) appear as individual Tool cards in the main chat.
+Synthetic Task calls are **containers** that group sidechain execution.
+
+The children array contains:
+- User messages (sidechain root prompts)
+- Agent text/thinking
+- Real tool calls (nested)
+- Tool results
+
+---
+
+## ⚠️ Critical Gotchas & Pitfalls
+
+### 1. Dual Bubble Problem (MITIGATED)
+
+**Problem**: Both real Agent tool_use AND synthetic Task from start event could create bubbles.
+
+**Solution**:
+- CLI **hides** Agent tool_use calls (marks in `hiddenParentToolCalls`)
+- Only synthetic start/stop events create messages
+- Real tool calls from sidechain agents are still created but nested under Task
+
+### 2. Sidechain Storage Key Mismatch (DOCUMENTED)
+
+**Gotcha**: Sidechain children stored under `state.sidechains[Task.realID]`, not `Task.toolId`.
+
+**Why**:
+- `realID` = synthetic message envelope ID (from `start` event envelope.id)
+- `toolId` = subagent ID (from `envelope.subagent`)
+- Reducer processes messages, not tools
+- Sidechain messages have message IDs, not tool IDs
+
+**Lookup path**:
+1. Tool message has `realID = envelope.id` from start event
+2. Find children: `state.sidechains[tool.realID]`
+3. Convert to display: recursively call `convertReducerMessageToMessage`
+
+### 3. Stop Event with Empty Result (EXPECTED)
+
+The `stop` event may arrive **before** the final `tool-call-end` with actual result:
+- `stop` event marks Task as `completed` with empty/partial result
+- Later, actual `tool-call-end` updates result to final value
+- Both transitions use same `toolIdToMessageId` lookup
+
+**Why this happens**: CLI emits `stop` immediately when subagent context ends, but the tool result may still be in flight.
+
+### 4. FIFO Queue Assumption (CRITICAL FOR PARALLEL AGENTS)
+
+`taskPromptToSubagents` maintains a **queue** (not set) of subagent IDs per prompt:
+
+```typescript
+const queue = promptMap.get(normalized) ?? [];
+queue.push(subagent);  // FIFO order matters
+```
+
+When matching sidechain to Task:
+- `consumeTaskPromptSubagent` uses `queue.shift()` (first-in, first-out)
+- **Assumption**: If 2 agents have the same prompt, sidechain messages arrive in the order tasks were created
+
+**If parallel**: Out-of-order sidechain roots could be mismatched. CLI **must** maintain order or use explicit `parentUuid` linking.
+
+### 5. Session-Protocol Subagent Override
+
+Session-protocol sidechain messages have `parentUUID === subagent_id`:
+- Tracer checks `isUuidLike(parentUuid)` to distinguish UUID parents from subagent IDs
+- Subagent IDs (CUIDs) are not UUIDs
+- Non-UUID parent references are treated as subagent IDs and looked up directly
+
+---
+
+## 🔄 End-to-End Flow Example
+
+**Scenario**: Claude spawns a subagent to "Search for Python examples"
+
+### 1. CLI Mapper (sessionProtocolMapper.ts)
+
+```
+SDK: assistant message with tool_use[name=Task, input={prompt: "Search..."}]
+     ↓
+Mapper: Detects Task, hides it, assigns CUID2 subagent ID (e.g., "abc123")
+        Maps: taskPromptToSubagents["Search..."] = ["abc123"]
+        Maps: providerSubagentToSessionSubagent["abc123"] = "xyz789" (new CUID)
+     ↓
+Emits: tool-call-start(call=abc123, name="Task", args={description: "Search..."})
+
+SDK: sidechain user message with content="Search for Python examples"
+     ↓
+Mapper: Detects parentToolUseId=abc123, buffers until Task seen
+        Later: replays with subagent="xyz789"
+
+SDK: agent message with tool_use[name=bash, input={command: "grep..."}]
+     ↓
+Mapper: Detects parentToolUseId=abc123, looks up subagent="xyz789"
+        Emits: tool-call-start(..., subagent="xyz789")
+```
+
+### 2. Wire Protocol
+
+```
+SessionEnvelope {
+  id: "start-msg-id-1",
+  role: 'agent',
+  turn: "turn-1",
+  subagent: "xyz789",
+  ev: { t: 'start', title: 'Search for Python examples' }
+}
+
+SessionEnvelope {
+  id: "text-msg-id-2",
+  role: 'agent',
+  turn: "turn-1",
+  subagent: "xyz789",
+  ev: { t: 'text', text: 'Starting search...' }
+}
+
+SessionEnvelope {
+  id: "tool-start-msg-id-3",
+  role: 'agent',
+  turn: "turn-1",
+  subagent: "xyz789",
+  ev: { t: 'tool-call-start', call: "bash-1", name: 'bash', ... }
+}
+
+SessionEnvelope {
+  id: "stop-msg-id-4",
+  role: 'agent',
+  turn: "turn-1",
+  subagent: "xyz789",
+  ev: { t: 'stop', result: 'Found 3 examples' }
+}
+```
+
+### 3. App Raw Parsing
+
+```
+Envelope 1 (start) → NormalizedMessage {
+  id: "start-msg-id-1",
+  role: 'agent',
+  isSidechain: false,
+  content: [{
+    type: 'tool-call',
+    id: "xyz789",           ← subagent ID becomes tool ID
+    name: 'Task',
+    input: { description: 'Search for Python examples' },
+    uuid: "start-msg-id-1",  ← For tracer linking
+  }]
+}
+
+Envelope 2 (text) + subagent="xyz789" → NormalizedMessage {
+  id: "text-msg-id-2",
+  role: 'agent',
+  isSidechain: true,        ← Marked because subagent is set
+  content: [{ type: 'text', text: 'Starting search...', ... }]
+}
+
+Envelope 3 (tool-call-start) + subagent="xyz789" → NormalizedMessage {
+  id: "tool-start-msg-id-3",
+  role: 'agent',
+  isSidechain: true,
+  content: [{
+    type: 'tool-call',
+    id: "bash-1",
+    name: 'bash',
+    ...
+  }]
+}
+
+Envelope 4 (stop) → NormalizedMessage {
+  id: "stop-msg-id-4",
+  role: 'agent',
+  isSidechain: false,
+  content: [{
+    type: 'tool-result',
+    tool_use_id: "xyz789",  ← Matches start's tool ID
+    content: 'Found 3 examples',
+  }]
+}
+```
+
+### 4. Tracer
+
+```
+Processed in order:
+
+Message 1 (synthetic Task):
+  → taskTools["start-msg-id-1"] = { messageId: "start-msg-id-1", prompt: "Search..." }
+  → promptToTaskId["Search..."] = "start-msg-id-1"
+  → toolCallToMessageId["xyz789"] = "start-msg-id-1"  ← For orphan matching
+  → Return as-is (non-sidechain)
+
+Message 2 (text, isSidechain=true):
+  → parentUUID = null, but isSidechain=true
+  → Content[0] = type='text', not 'sidechain' type
+  → Buffer as orphan: orphanMessages["start-msg-id-1"] = [msg2]
+
+Message 3 (tool-call, isSidechain=true):
+  → parentUUID = null, isSidechain=true
+  → No 'sidechain' content type
+  → Buffer as orphan: orphanMessages["start-msg-id-1"] = [msg2, msg3]
+
+Message 4 (synthetic result):
+  → Non-sidechain, return as-is
+  → But also triggers: processOrphans("xyz789", "start-msg-id-1")
+    because stop event uses subagent ID, and toolCallToMessageId["xyz789"] maps back
+
+Traced output:
+  1. Message 1 (synthetic Task) — non-sidechain
+  2. Message 2 (orphan text) with sidechainId="start-msg-id-1"
+  3. Message 3 (orphan tool-call) with sidechainId="start-msg-id-1"
+  4. Message 4 (synthetic result) — non-sidechain
+```
+
+### 5. Reducer Phase 4 (Sidechain Storage)
+
+```
+For msg2 (sidechainId="start-msg-id-1"):
+  → existingSidechain = state.sidechains["start-msg-id-1"] || []
+  → Create user message from sidechain content
+  → Push to existingSidechain
+  → state.sidechains["start-msg-id-1"] = [userMsg, ...]
+
+For msg3 (sidechainId="start-msg-id-1"):
+  → existingSidechain = state.sidechains["start-msg-id-1"]
+  → Create tool message (bash call)
+  → Push to existingSidechain
+  → state.sidechains["start-msg-id-1"] = [userMsg, toolMsg, ...]
+```
+
+### 6. Reducer Conversion & Display
+
+```typescript
+// Tool message for synthetic Task:
+const toolMsg = convertReducerMessageToMessage(taskReducerMsg, state);
+// Returns:
+{
+  id: 42,
+  kind: 'tool-call',
+  tool: {
+    name: 'Task',
+    state: 'completed',
+    input: { description: 'Search for Python examples' },
+    result: 'Found 3 examples',
+    ...
+  },
+  children: [
+    // Converted from state.sidechains["start-msg-id-1"]
+    { kind: 'user-text', text: 'Search for Python examples', ... },
+    { kind: 'tool-call', tool: { name: 'bash', ... }, ... },
+    { kind: 'tool-result', result: '...' }
+  ]
+}
+```
+
+### 7. UI Rendering
+
+**Main chat**:
+- Shows the synthetic Task tool card with:
+  - Title: "Search for Python examples"
+  - Status: Checkmark (completed)
+
+**If TaskView is clicked/expanded**:
+- Shows TaskView component with last 3 nested tools
+- Or full ToolModal with nested tools in hierarchy
+
+---
+
+## 📊 Data Relationships Summary
+
+```
+┌─────────────────────────────────────────────────────────────┐
+│                  Session Envelope (Wire)                     │
+│  { id, time, role, turn, subagent, ev }                     │
+└────────────────────────┬────────────────────────────────────┘
+                         │
+                    Normalization
+                         │
+                         ▼
+┌─────────────────────────────────────────────────────────────┐
+│              NormalizedMessage (Raw Parsing)                 │
+│  { id, role, content[], isSidechain, meta }                 │
+│  content items: uuid, parentUUID, ...                       │
+└────────────────────────┬────────────────────────────────────┘
+                         │
+                     Tracing
+                         │
+                         ▼
+┌─────────────────────────────────────────────────────────────┐
+│            TracedMessage (with sidechainId)                  │
+│  { ...NormalizedMessage, sidechainId? }                     │
+└────────────────────────┬────────────────────────────────────┘
+                         │
+                   Reducing
+                         │
+                         ▼
+┌─────────────────────────────────────────────────────────────┐
+│             ReducerMessage (Internal State)                  │
+│  { id, realID, role, text?, tool?, event? }                 │
+│  state.sidechains[realID] = ReducerMessage[]                │
+│  state.toolIdToMessageId[toolId] = internalId               │
+└────────────────────────┬────────────────────────────────────┘
+                         │
+                    Conversion
+                         │
+                         ▼
+┌─────────────────────────────────────────────────────────────┐
+│               Message (Display Format)                       │
+│  { kind, tool?, children?, text?, ... }                     │
+└─────────────────────────────────────────────────────────────┘
+                         │
+                         ▼
+          ┌──────────────────────────┐
+          │  TaskView / ToolModal    │
+          │  (renders children)      │
+          └──────────────────────────┘
+```
+
+---
+
+## 🔧 Key Code Locations
+
+| Concept | File | Lines |
+|---------|------|-------|
+| Task hiding | `sessionProtocolMapper.ts` | 336 |
+| Subagent start | `sessionProtocolMapper.ts` | 289–297 |
+| Subagent stop | `sessionProtocolMapper.ts` | 305–310 |
+| Synthetic Task creation | `typesRaw.ts` | 606–625 |
+| Synthetic result creation | `typesRaw.ts` | 631–653 |
+| Tracer task indexing | `reducerTracer.ts` | 121–131 |
+| Tracer orphan handling | `reducerTracer.ts` | 64–87 |
+| Reducer Phase 4 (sidechain) | `reducer.ts` | 924–1040 |
+| Sidechain child lookup | `reducer.ts` | 1302 |
+| TaskView rendering | `TaskView.tsx` | 16–130 |
+
+---
+
+## 📚 Related Documentation
+
+- `docs/session-protocol.md` — Wire envelope format
+- `docs/session-protocol-claude.md` — Claude launcher emission patterns
+- Tool modal: `docs/TOOL_MODAL_PATTERNS.md`
