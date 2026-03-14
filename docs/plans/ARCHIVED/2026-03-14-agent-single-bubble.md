# Agent Single Bubble Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show exactly ONE bubble per Agent/Task tool call in the main chat, with full info in a 3-tab modal (Prompt/Activity/Output).

**Architecture:** Two-pronged fix: (1) Enrich the synthetic tool-call from `start` events with full agent metadata (prompt, subagent_type, description) so the app has all info in one place. (2) Fix the `convertSidechainUserMessage` in the CLI to handle 'Agent' tool name (currently only handles 'Task'). (3) Add diagnostic logging to understand why there are currently TWO bubbles, and fix the root cause.

**Tech Stack:** TypeScript, React Native, Expo, session protocol envelopes

---

## Background: How Agent Tool Calls Flow

### CLI Side (sessionProtocolMapper.ts)
1. Claude emits `assistant` message with `tool_use` block (name=`Agent` or `Task`)
2. Mapper **hides** the tool call (no `tool-call-start` envelope) — line 496-509
3. Creates subagent mapping: `toolu_xxx → CUID2`
4. Queues prompt → tool-call-id mapping for sidechain matching
5. First sidechain message triggers `maybeEmitSubagentStart` → `start` envelope with `subagent: CUID2`
6. Sidechain messages get `subagent: CUID2` on their envelopes
7. Tool result triggers `maybeEmitSubagentStop` → `stop` envelope with result

### CLI Side (claudeRemoteLauncher.ts)
- Line 360: Creates a **fake sidechain user message** for `'Task'` tools (NOT 'Agent')
- This fake message goes through the mapper and triggers the `start` event early
- For 'Agent' tools, the `start` event is only triggered when real SDK sidechain messages arrive

### App Side (typesRaw.ts)
- `start` event with `subagent` → **synthetic Task tool-call** (line 607-625):
  ```typescript
  content: [{ type: 'tool-call', id: CUID2, name: 'Task', input: { description: title } }]
  ```
- `stop` event with `subagent` → **synthetic Task tool-result** (line 631-649)
- Sidechain text/tool messages have `parentUUID = CUID2` → linked as children

### App Side (reducerTracer.ts)
- Synthetic tool-call registered in `toolCallToMessageId` (CUID2 → messageId)
- BUT **NOT** registered in `taskTools/promptToTaskId` because input has `description`, not `prompt`
- Sidechain messages find parent via `toolCallToMessageId.get(parentUUID)` ← works

### Root Cause Hypothesis for Two Bubbles
Most likely: The synthetic tool-call from `start` events contains only `{ description: title }` as input. The real Agent tool-call's `input` has `{ prompt, description, subagent_type }`. If both the old `tool-call-start` envelope (from before my mapper fix) AND the new `start` event are in the session history, the app sees TWO tool-calls.

Alternative: Sidechain children are not properly linking to the synthetic tool-call, causing the tracer/reducer to create a second tool-call for orphan messages.

---

### Task 1: Add Diagnostic Logging to Understand Two Bubbles

**Files:**
- Modify: `packages/happy-app/sources/sync/reducer/reducer.ts`

**Step 1: Add logging in Phase 2 (tool-call processing)**

Add a console.log when creating Agent/Task tool-call messages to see if multiple are created.

At the tool-call creation block (~line 830-844), after `state.messages.set(mid, ...)`:
```typescript
if (toolCall.name === 'Task' || toolCall.name === 'Agent') {
    console.log(`[DIAG:agent-tool] Creating tool-call: mid=${mid}, name=${toolCall.name}, realID=${msg.id}, input=${JSON.stringify(toolCall.input).substring(0, 100)}`);
}
```

**Step 2: Add logging in Phase 4 (sidechain processing)**

At line 1137-1143, when sidechain content is added:
```typescript
if (existingSidechain.length > sidechainLengthBefore) {
    console.log(`[DIAG:agent-sidechain] Adding ${existingSidechain.length - sidechainLengthBefore} children to sidechainId=${msg.sidechainId}, ownerInternalId=${ownerInternalId}`);
}
```

**Step 3: Test and read browser console**

Open the app, trigger an Agent tool call, and check the browser console for:
- How many `[DIAG:agent-tool]` logs appear (should be 1)
- Whether `[DIAG:agent-sidechain]` has the correct owner

Run: `bun web` (or reload the web app)
Expected: Diagnostic logs in browser console

**Step 4: Remove logging after diagnosis**

Once root cause is confirmed, remove the `[DIAG:agent-tool]` and `[DIAG:agent-sidechain]` logs.

---

### Task 2: Fix `convertSidechainUserMessage` for 'Agent' Name

**Files:**
- Modify: `packages/happy-cli/src/claude/utils/claudeRemoteLauncher.ts:360`

**Step 1: Write the test (if not already covered)**

Check if `claudeRemoteLauncher.test.ts` or `sessionProtocolMapper.test.ts` covers this. If not, skip test for this change (it's a one-line conditional fix).

**Step 2: Fix the condition**

Change line 360 from:
```typescript
if (c.type === 'tool_use' && c.name === 'Task' && c.input && typeof (c.input as any).prompt === 'string') {
```
to:
```typescript
if (c.type === 'tool_use' && (c.name === 'Task' || c.name === 'Agent') && c.input && typeof (c.input as any).prompt === 'string') {
```

**Step 3: Run tests**

Run: `cd packages/happy-cli && npx vitest run`
Expected: All existing tests pass

**Step 4: Rebuild CLI and restart daemon**

Run: `bun dev:reset -c -d`
Expected: CLI rebuilt, daemon restarted

---

### Task 3: Enrich Synthetic Tool-Call with Full Agent Metadata

**Files:**
- Modify: `packages/happy-cli/src/claude/utils/sessionProtocolMapper.ts` (pickTaskTitle, queueTaskPromptSubagent area)
- Modify: `packages/happy-app/sources/sync/typesRaw.ts:607-625` (start event decoder)
- Modify: `packages/happy-wire/src/sessionProtocol.ts` (start event schema — add optional fields)

**Step 1: Extend `start` event to carry prompt and subagent_type**

In `packages/happy-wire/src/sessionProtocol.ts`, find the `start` event schema and add optional `prompt` and `subagentType` fields:
```typescript
// In the service event for 'start':
{
    t: z.literal('start'),
    title: z.string().optional(),
    prompt: z.string().optional(),        // NEW
    subagentType: z.string().optional(),   // NEW
}
```

**Step 2: Emit prompt and subagentType in the `start` envelope**

In `sessionProtocolMapper.ts`, update `maybeEmitSubagentStart` to accept and emit prompt/subagentType. Store them alongside the title in the subagent tracking state. Then include them in the `start` envelope:
```typescript
envelopes.push(createEnvelope('agent', {
    t: 'start',
    ...(title ? { title } : {}),
    ...(prompt ? { prompt } : {}),
    ...(subagentType ? { subagentType } : {}),
}, { turn, subagent }));
```

The prompt and subagentType should be stored when `queueTaskPromptSubagent` is called at line 499. Create a map `subagentMetadata: Map<string, { prompt: string, subagentType?: string }>` and populate it alongside the existing `taskPromptToSubagents`.

**Step 3: Decode prompt and subagentType in synthetic tool-call**

In `typesRaw.ts` at line 607-625, change the synthetic tool-call input to include prompt and subagentType:
```typescript
return {
    ...
    content: [{
        type: 'tool-call',
        id: envelope.subagent,
        name: 'Task',
        input: {
            description: envelope.ev.title ?? 'Agent',
            ...(envelope.ev.prompt ? { prompt: envelope.ev.prompt } : {}),
            ...(envelope.ev.subagentType ? { subagent_type: envelope.ev.subagentType } : {}),
        },
        description: envelope.ev.title ?? null,
        uuid: contentUUID,
        parentUUID: null
    }],
};
```

**Step 4: Build wire, rebuild CLI, restart daemon**

Run: `bun run --filter @jakobgruen/happy-wire build && bun dev:reset -c -d`

**Step 5: Run tests**

Run: `cd packages/happy-cli && npx vitest run`
Expected: Tests pass (existing tests may need updates for the new fields)

---

### Task 4: Update Chat Bubble Display

**Files:**
- Modify: `packages/happy-app/sources/components/tools/knownTools.tsx`

**Step 1: Update AGENT_TOOL_CONFIG title and subtitle**

The `title` function should show the agent type (subagent_type), and `extractSubtitle` should show the description:

```typescript
const AGENT_TOOL_CONFIG = {
    title: (opts: { metadata: Metadata | null, tool: ToolCall }) => {
        // Show subagent_type as title (e.g., "Explore", "Plan", "general-purpose")
        const subagentType = opts.tool.input?.subagent_type;
        if (subagentType && typeof subagentType === 'string') {
            return subagentType;
        }
        return t('tools.names.task');
    },
    extractSubtitle: (opts: { tool: ToolCall, metadata: Metadata | null }) => {
        // Show description as subtitle
        const description = opts.tool.input?.description;
        if (description && typeof description === 'string') {
            return description;
        }
        return null;
    },
    icon: ICON_TASK,
    isMutable: true,
    minimal: true,
    input: z.object({
        prompt: z.string().describe('The task for the agent to perform'),
        description: z.string().optional().describe('Short summary'),
        subagent_type: z.string().optional().describe('The type of specialized agent to use')
    }).partial().passthrough()
};
```

**Step 2: Verify chat bubble rendering**

Open the app and check that:
- Agent bubble shows agent type (e.g., "Explore") as title
- Agent bubble shows description as subtitle
- Only ONE bubble appears per agent

---

### Task 5: Update AgentModalContent for New Data Shape

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/AgentModalContent.tsx`
- Modify: `packages/happy-app/sources/components/tools/modal/ToolModal.tsx`

**Step 1: Update modal title/subtitle**

In `ToolModal.tsx`, the header for agent tools should show:
- Title: subagent_type (or fallback to "Agent")
- Subtitle: description

These are already extracted from `tool.input` — verify they work with the enriched synthetic tool-call.

**Step 2: Update Prompt tab in AgentModalContent**

The Prompt tab should render `tool.input.prompt` as markdown. Now that the synthetic tool-call includes `prompt` in its input, this should work directly:
```typescript
const prompt = tool.input?.prompt;
// Render as markdown in Prompt tab
```

**Step 3: Update Output tab**

The Output tab should render the tool result. The synthetic tool-result from `stop` events carries `content: envelope.ev.result ?? ''`. Verify this appears in `tool.result`.

**Step 4: Test modal end-to-end**

Open the app, trigger an Agent call, tap the bubble, verify:
- Prompt tab shows the full prompt
- Activity tab shows sub-tool calls
- Output tab shows the agent's response

---

### Task 6: Fix Root Cause of Duplicate Bubbles (Based on Diagnostics)

**Files:** Depends on Task 1 findings

This task is conditional on what the diagnostic logging from Task 1 reveals. Likely scenarios:

**Scenario A: Old `tool-call-start` envelope in session history**
- Fix: Add deduplication in reducer — if a `Task`/`Agent` tool-call already exists with matching prompt, skip creating a new one
- Or: When synthetic tool-call from `start` arrives, check if a regular `Agent` tool-call already exists with the same CUID2 and merge/skip

**Scenario B: Sidechain children not linking to parent**
- Fix: Ensure `toolCallToMessageId` lookup works for CUID2 IDs
- Verify that `parentUUID` on sidechain messages matches the CUID2 from `start` event

**Scenario C: Timing issue — `stop` arrives before children**
- Fix: Remove or adjust the "redirect after completion" logic at reducer.ts:961-989 for Agent tools

**Step 1: Implement fix based on diagnostics**
**Step 2: Verify single bubble**
**Step 3: Remove diagnostic logging from Task 1**

---

### Task 7: Clean Up Dead Code

**Files:**
- Modify: `packages/happy-app/sources/components/tools/views/TaskView.tsx` — The inline TaskView is unused now (minimal: true means it's never rendered). Keep the file but add a comment noting it's only used as a fallback.
- Modify: `packages/happy-app/sources/components/tools/ToolView.tsx` — The `AdaptiveToolDisplay` import (line 19) is dead code. Remove it.

**Step 1: Remove dead import**

In `ToolView.tsx`, remove:
```typescript
import { AdaptiveToolDisplay } from './adaptive/AdaptiveToolDisplay';
```

**Step 2: Run typecheck**

Run: `bun typecheck`
Expected: No errors

---

### Task 8: Commit

**Step 1: Stage all changes**

```bash
git add packages/happy-cli/src/claude/claudeRemoteLauncher.ts
git add packages/happy-cli/src/claude/utils/sessionProtocolMapper.ts
git add packages/happy-app/sources/sync/reducer/reducer.ts
git add packages/happy-app/sources/sync/typesRaw.ts
git add packages/happy-app/sources/components/tools/knownTools.tsx
git add packages/happy-app/sources/components/tools/ToolView.tsx
git add packages/happy-app/sources/components/tools/modal/AgentModalContent.tsx
git add packages/happy-app/sources/components/tools/modal/ToolModal.tsx
git add packages/happy-wire/src/sessionProtocol.ts
```

**Step 2: Commit**

```bash
git commit -m "fix(app): single bubble for Agent tools + enriched metadata"
```
