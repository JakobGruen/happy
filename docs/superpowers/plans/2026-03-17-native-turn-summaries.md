# Native Turn Summaries Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Haiku-powered summarization with CC-generated metadata via MCP tools, add structured per-turn summaries, and clean up `llmSummary` from the codebase.

**Architecture:** The Happy MCP server (`startHappyServer.ts`) gets a new `turn_summary` tool. A mutable turn counter ref, created in `runClaude.ts`, is shared between the MCP server and the launcher. The system prompt instructs CC to call both `change_title` and `turn_summary` after every turn. All Haiku summarization code and the `llmSummary` field are removed.

**Tech Stack:** TypeScript, MCP SDK, Zod, Vitest

**Spec:** `docs/superpowers/specs/2026-03-17-native-turn-summaries-design.md`

---

## Chunk 1: Turn Summary MCP Tool + Turn Counter

### Task 1: Add `turnSummaries` to Metadata Schema (App)

**Files:**
- Modify: `packages/happy-app/sources/sync/storageTypes.ts:7-46`

- [ ] **Step 1: Add turnSummaries field to MetadataSchema**

In `packages/happy-app/sources/sync/storageTypes.ts`, add after the `summary` field (line 34):

```typescript
    turnSummaries: z.record(z.string(), z.object({
        title: z.string(),
        summary: z.string(),
        createdAt: z.number(),
    })).optional(),
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /home/jakob/repos/happy-dev/happy && bun typecheck`
Expected: No new errors (field is optional, no consumers yet)

- [ ] **Step 3: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-app/sources/sync/storageTypes.ts
git commit -m "feat(app): add turnSummaries field to MetadataSchema"
```

---

### Task 2: Add turn counter ref and wire through Session class

**Files:**
- Modify: `packages/happy-cli/src/claude/utils/startHappyServer.ts:15` (signature change)
- Modify: `packages/happy-cli/src/claude/session.ts` (add turnCounterRef field)
- Modify: `packages/happy-cli/src/claude/runClaude.ts:269` (create ref, pass to server)

**Threading strategy:** `runClaude.ts` creates the ref and passes it to `startHappyServer()` directly. It also passes it to `loop()` via `LoopOptions`, which threads it into `Session`. The launcher (`claudeRemoteLauncher.ts`) reads it from `session.turnCounterRef`. This is consistent with how `Session` already holds shared mutable state (`isReactivation`, `onModelSwitch`).

- [ ] **Step 1: Define TurnCounterRef and update startHappyServer signature**

In `packages/happy-cli/src/claude/utils/startHappyServer.ts`, add the type and update the function signature:

```typescript
export interface TurnCounterRef {
    value: number;
}

export async function startHappyServer(client: ApiSessionClient, turnCounterRef: TurnCounterRef) {
```

- [ ] **Step 2: Update toolNames return to include turn_summary**

In the same file, change line 110:

```typescript
// Before:
        toolNames: ['change_title'],
// After:
        toolNames: ['change_title', 'turn_summary'],
```

- [ ] **Step 3: Add turnCounterRef to Session class**

In `packages/happy-cli/src/claude/session.ts`:

Add to the class fields (after line 27, near `onModelSwitch`):

```typescript
    /** Mutable ref for turn counter — shared with MCP server for turn_summary keying */
    readonly turnCounterRef: TurnCounterRef;
```

Add to constructor opts interface:

```typescript
        turnCounterRef: TurnCounterRef,
```

Add to constructor body:

```typescript
        this.turnCounterRef = opts.turnCounterRef;
```

Add the import:

```typescript
import type { TurnCounterRef } from './utils/startHappyServer';
```

- [ ] **Step 4: Add turnCounterRef to LoopOptions and Session construction in loop.ts**

In `packages/happy-cli/src/claude/loop.ts`:

Add to `LoopOptions` interface (after line 44):

```typescript
    turnCounterRef: TurnCounterRef
```

Add the import:

```typescript
import type { TurnCounterRef } from './utils/startHappyServer';
```

Add to `Session` constructor call (after line 65):

```typescript
        turnCounterRef: opts.turnCounterRef,
```

- [ ] **Step 5: Create turn counter ref in runClaude.ts and pass to both**

In `packages/happy-cli/src/claude/runClaude.ts`, before line 269:

```typescript
    // Mutable ref for turn counter — shared between MCP server and launcher
    const turnCounterRef: TurnCounterRef = { value: 0 };
```

Update line 269:

```typescript
// Before:
    const happyServer = await startHappyServer(session);
// After:
    const happyServer = await startHappyServer(session, turnCounterRef);
```

Add `turnCounterRef` to the `loop()` call (after line 571):

```typescript
        turnCounterRef,
```

Add the import at the top of `runClaude.ts`:

```typescript
import type { TurnCounterRef } from '@/claude/utils/startHappyServer';
```

- [ ] **Step 6: Verify typecheck passes**

Run: `cd /home/jakob/repos/happy-dev/happy && bun typecheck`
Expected: Pass

- [ ] **Step 7: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-cli/src/claude/utils/startHappyServer.ts packages/happy-cli/src/claude/session.ts packages/happy-cli/src/claude/loop.ts packages/happy-cli/src/claude/runClaude.ts
git commit -m "feat(cli): add TurnCounterRef and wire through runClaude → Session → startHappyServer"
```

---

### Task 3: Register `turn_summary` MCP tool

**Files:**
- Modify: `packages/happy-cli/src/claude/utils/startHappyServer.ts:44-75` (add tool after change_title)
- Test: `packages/happy-cli/src/claude/utils/startHappyServer.test.ts` (new file)

- [ ] **Step 1: Write failing tests for turn_summary tool**

Create `packages/happy-cli/src/claude/utils/startHappyServer.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startHappyServer } from './startHappyServer';

// Mock ApiSessionClient with metadata accumulation
function createMockClient() {
    let metadata: Record<string, any> = {};
    return {
        sessionId: 'test-session-id',
        sendClaudeSessionMessage: vi.fn(),
        updateMetadata: vi.fn((handler: (m: any) => any) => {
            metadata = handler(metadata);
        }),
        getMetadata: () => metadata,
    };
}

describe('startHappyServer', () => {
    let server: Awaited<ReturnType<typeof startHappyServer>> | null = null;

    afterEach(() => {
        server?.stop();
        server = null;
    });

    it('should return both change_title and turn_summary in toolNames', async () => {
        const client = createMockClient();
        server = await startHappyServer(client as any, { value: 0 });

        expect(server.toolNames).toContain('change_title');
        expect(server.toolNames).toContain('turn_summary');
    });

    it('should store turn summary at the correct turn key via updateMetadata', async () => {
        const client = createMockClient();
        const turnCounterRef = { value: 5 };
        server = await startHappyServer(client as any, turnCounterRef);

        // Call the turn_summary tool via HTTP
        const res = await fetch(`${server.url}mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'tools/call',
                params: { name: 'turn_summary', arguments: { title: 'Test turn', summary: '- Did stuff' } },
            }),
        });
        expect(res.ok).toBe(true);

        // Verify updateMetadata was called and the turn key is "5"
        expect(client.updateMetadata).toHaveBeenCalled();
        const metadata = client.getMetadata();
        expect(metadata.turnSummaries).toBeDefined();
        expect(metadata.turnSummaries['5']).toBeDefined();
        expect(metadata.turnSummaries['5'].title).toBe('Test turn');
        expect(metadata.turnSummaries['5'].summary).toBe('- Did stuff');
    });

    it('should enforce 50-entry growth cap by dropping oldest key', async () => {
        // Pre-fill metadata with 50 entries (keys "0" through "49")
        const client = createMockClient();
        const existing: Record<string, any> = {};
        for (let i = 0; i < 50; i++) {
            existing[String(i)] = { title: `Turn ${i}`, summary: 'x', createdAt: i };
        }
        // Seed the metadata so updateMetadata handler sees existing entries
        (client as any).updateMetadata.mockImplementation((handler: (m: any) => any) => {
            const base = { turnSummaries: existing };
            const result = handler(base);
            Object.assign(existing, result.turnSummaries);
        });

        const turnCounterRef = { value: 99 };
        server = await startHappyServer(client as any, turnCounterRef);

        // Call turn_summary — should trigger cap
        await fetch(`${server.url}mcp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/call',
                params: { name: 'turn_summary', arguments: { title: 'New turn', summary: '- New' } },
            }),
        });

        expect(client.updateMetadata).toHaveBeenCalled();
        // Key "0" (oldest) should have been dropped, key "99" added
        expect(existing['99']).toBeDefined();
        expect(existing['0']).toBeUndefined();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jakob/repos/happy-dev/happy && bun vitest run packages/happy-cli/src/claude/utils/startHappyServer.test.ts`
Expected: FAIL — `startHappyServer` expects 1 arg, got 2

- [ ] **Step 3: Register turn_summary tool in startHappyServer**

In `packages/happy-cli/src/claude/utils/startHappyServer.ts`, add after the `change_title` registration (after line 75):

```typescript
    mcp.registerTool('turn_summary', {
        description: 'Record a summary of what was accomplished in this turn',
        title: 'Record Turn Summary',
        inputSchema: {
            title: z.string().describe('Short title for this turn (<60 chars)'),
            summary: z.string().describe('Bullet-point summary of actions taken'),
        },
    }, async (args) => {
        const turnKey = String(turnCounterRef.value);
        logger.debug(`[happyMCP] Recording turn summary for turn ${turnKey}`);
        try {
            client.updateMetadata((m: any) => {
                const existing = m.turnSummaries ?? {};
                // Enforce 50-entry growth cap — drop lowest numeric key if at limit
                const capped = { ...existing };
                const keys = Object.keys(capped);
                if (keys.length >= 50) {
                    const oldest = keys.sort((a, b) => Number(a) - Number(b))[0];
                    delete capped[oldest];
                }
                return {
                    ...m,
                    turnSummaries: {
                        ...capped,
                        [turnKey]: {
                            title: args.title,
                            summary: args.summary,
                            createdAt: Date.now(),
                        },
                    },
                };
            });
            return {
                content: [{ type: 'text' as const, text: `Turn ${turnKey} summary recorded.` }],
                isError: false,
            };
        } catch (error) {
            return {
                content: [{ type: 'text' as const, text: `Failed to record turn summary: ${String(error)}` }],
                isError: true,
            };
        }
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/jakob/repos/happy-dev/happy && bun vitest run packages/happy-cli/src/claude/utils/startHappyServer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-cli/src/claude/utils/startHappyServer.ts packages/happy-cli/src/claude/utils/startHappyServer.test.ts
git commit -m "feat(cli): register turn_summary MCP tool with 50-entry growth cap"
```

---

### Task 4: Increment turn counter in `onReady`

**Files:**
- Modify: `packages/happy-cli/src/claude/claudeRemoteLauncher.ts:545`

**Timing invariant:** CC calls `turn_summary` MCP tool DURING its turn (as one of its last tool calls). The MCP handler fires synchronously during message processing, BEFORE `onReady`. So at `turn_summary` call time, the ref holds the current turn's value. `onReady` then increments it for the next turn. Example: turn counter starts at `0`, first turn's `turn_summary` reads key `"0"`, `onReady` increments to `1`, second turn reads `"1"`, etc.

- [ ] **Step 1: Increment turnCounterRef in onReady**

In `packages/happy-cli/src/claude/claudeRemoteLauncher.ts`, at line 545 (`onReady` callback), add the increment AFTER `closeClaudeSessionTurn`:

```typescript
                    onReady: (stats) => {
                        session.client.closeClaudeSessionTurn('completed', stats);
                        // Increment for next turn — CC already called turn_summary during this turn
                        session.turnCounterRef.value++;
```

The ref is accessible via `session.turnCounterRef` (added in Task 2, Step 3).

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /home/jakob/repos/happy-dev/happy && bun typecheck`
Expected: Pass

- [ ] **Step 3: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-cli/src/claude/claudeRemoteLauncher.ts
git commit -m "feat(cli): increment turn counter in onReady callback (after CC's turn_summary call)"
```

---

### Task 5: Update system prompt

**Files:**
- Modify: `packages/happy-cli/src/claude/utils/systemPrompt.ts:7-9`

- [ ] **Step 1: Replace BASE_SYSTEM_PROMPT**

In `packages/happy-cli/src/claude/utils/systemPrompt.ts`, replace lines 7-9:

```typescript
const BASE_SYSTEM_PROMPT = (() => trimIdent(`
    After every turn, call these two tools:
    1. "mcp__happy__change_title" — Set/update the session title. Keep it short (<60 chars). Update it whenever the session focus shifts. This helps the user find this chat later.
    2. "mcp__happy__turn_summary" — Summarize what you did this turn.
       - "title": Short title for this turn (<60 chars, e.g., "Refactored auth module")
       - "summary": Bullet points of key actions (e.g., "- Renamed 3 functions\\n- Updated tests")
`))();
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /home/jakob/repos/happy-dev/happy && bun typecheck`
Expected: Pass

- [ ] **Step 3: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-cli/src/claude/utils/systemPrompt.ts
git commit -m "feat(cli): update system prompt to instruct CC to call change_title + turn_summary per turn"
```

---

## Chunk 2: Remove Haiku Summarizer + llmSummary (CLI side)

### Task 6: Delete summarizer module

**Files:**
- Delete: `packages/happy-cli/src/claude/utils/summarizer.ts`
- Delete: `packages/happy-cli/src/claude/utils/summarizer.test.ts`

- [ ] **Step 1: Delete summarizer files**

```bash
cd /home/jakob/repos/happy-dev/happy
rm packages/happy-cli/src/claude/utils/summarizer.ts
rm packages/happy-cli/src/claude/utils/summarizer.test.ts
```

- [ ] **Step 2: Verify files are gone**

Run: `ls packages/happy-cli/src/claude/utils/summarizer*`
Expected: `No such file or directory`

- [ ] **Step 3: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add -u packages/happy-cli/src/claude/utils/summarizer.ts packages/happy-cli/src/claude/utils/summarizer.test.ts
git commit -m "chore(cli): delete Haiku summarizer module"
```

---

### Task 7: Remove Haiku calls from permissionHandler.ts

**Files:**
- Modify: `packages/happy-cli/src/claude/utils/permissionHandler.ts:18,317-331`

- [ ] **Step 1: Remove import**

In `packages/happy-cli/src/claude/utils/permissionHandler.ts`, delete line 18:

```typescript
// DELETE THIS LINE:
import { generatePermissionSummary } from "@/claude/utils/summarizer";
```

- [ ] **Step 2: Remove fire-and-forget Haiku call**

Delete lines 317-331 (the entire `// Fire-and-forget: generate Haiku summary asynchronously` block):

```typescript
// DELETE THIS BLOCK (lines 317-331):
            // Fire-and-forget: generate Haiku summary asynchronously
            void generatePermissionSummary(toolName, input as Record<string, unknown>, context?.description).then((summary) => {
                if (!summary) return;
                this.session.client.updateAgentState((currentState) => {
                    const existing = currentState.requests?.[id];
                    if (!existing) return currentState; // already completed
                    return {
                        ...currentState,
                        requests: {
                            ...currentState.requests,
                            [id]: { ...existing, llmSummary: summary },
                        },
                    };
                });
            });
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd /home/jakob/repos/happy-dev/happy && bun typecheck`
Expected: Pass

- [ ] **Step 4: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-cli/src/claude/utils/permissionHandler.ts
git commit -m "chore(cli): remove Haiku permission summary from permissionHandler"
```

---

### Task 8: Remove Haiku turn summary + turnToolCalls tracking from claudeRemoteLauncher.ts

**Files:**
- Modify: `packages/happy-cli/src/claude/claudeRemoteLauncher.ts:20,185-187,249-252,484,501,555-565`

- [ ] **Step 1: Remove import**

Delete line 20:

```typescript
// DELETE:
import { generateTurnSummary } from "@/claude/utils/summarizer";
```

- [ ] **Step 2: Remove turnToolCalls declaration and lastUserMessage**

Delete lines 185-187:

```typescript
// DELETE:
    // Track turn data for summary generation
    let lastUserMessage: UserContent = '';
    let turnToolCalls: Array<{ tool: string; description?: string | null }> = [];
```

- [ ] **Step 3: Remove turnToolCalls.push() in tool tracking**

Delete lines 249-252 (inside the `if (message.type === 'assistant')` block):

```typescript
// DELETE:
                        // Track for turn summary (top-level tool calls only)
                        if (!umessage.parent_tool_use_id) {
                            turnToolCalls.push({ tool: c.name ?? 'unknown' });
                        }
```

- [ ] **Step 4: Remove turnToolCalls.length = 0 resets**

Delete `turnToolCalls.length = 0;` at lines 484 and 501.
Also delete `lastUserMessage = p.message;` at line 483 and `lastUserMessage = msg.message;` at line 500.

- [ ] **Step 5: Remove Haiku turn summary fire-and-forget in onReady**

Delete lines 555-565:

```typescript
// DELETE:
                        // Fire-and-forget: generate turn summary via Haiku
                        const summaryText = typeof lastUserMessage === 'string' ? lastUserMessage : lastUserMessage.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('\n');
                        if (summaryText) {
                            void generateTurnSummary(summaryText, turnToolCalls).then((summary) => {
                                if (!summary) return;
                                session.client.updateMetadata((m) => ({
                                    ...m,
                                    summary: { text: summary, updatedAt: Date.now() },
                                }));
                            });
                        }
```

- [ ] **Step 6: Verify typecheck passes**

Run: `cd /home/jakob/repos/happy-dev/happy && bun typecheck`
Expected: Pass

- [ ] **Step 7: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-cli/src/claude/claudeRemoteLauncher.ts
git commit -m "chore(cli): remove Haiku turn summary and turnToolCalls tracking from launcher"
```

---

### Task 9: Remove llmSummary from CLI AgentState type

**Files:**
- Modify: `packages/happy-cli/src/api/types.ts:362-363`

- [ ] **Step 1: Remove llmSummary field**

In `packages/happy-cli/src/api/types.ts`, delete lines 362-363:

```typescript
// DELETE:
      /** Haiku-generated summary of what this tool call will do */
      llmSummary?: string,
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /home/jakob/repos/happy-dev/happy && bun typecheck`
Expected: Pass

- [ ] **Step 3: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-cli/src/api/types.ts
git commit -m "chore(cli): remove llmSummary from AgentState type"
```

---

### Task 10: Remove `@anthropic-ai/sdk` dependency

**Files:**
- Modify: `packages/happy-cli/package.json:94`

- [ ] **Step 1: Remove the dependency**

In `packages/happy-cli/package.json`, delete the line:

```json
    "@anthropic-ai/sdk": "^0.78.0",
```

- [ ] **Step 2: Reinstall dependencies**

Run: `cd /home/jakob/repos/happy-dev/happy && bun install`
Expected: Successful install without `@anthropic-ai/sdk`

- [ ] **Step 3: Verify build still works**

Run: `cd /home/jakob/repos/happy-dev/happy && bun run --filter happy-coder build`
Expected: Build succeeds (no imports of `@anthropic-ai/sdk` remain)

- [ ] **Step 4: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-cli/package.json bun.lock
git commit -m "chore(cli): remove @anthropic-ai/sdk dependency (only used by deleted summarizer)"
```

---

## Chunk 3: Remove llmSummary from App

### Task 11: Remove llmSummary from app schema and permission queue

**Files:**
- Modify: `packages/happy-app/sources/sync/storageTypes.ts:59`
- Modify: `packages/happy-app/sources/sync/permissionQueue.ts:10,38`

- [ ] **Step 1: Remove llmSummary from AgentStateSchema**

In `packages/happy-app/sources/sync/storageTypes.ts`, delete line 59:

```typescript
// DELETE:
        llmSummary: z.string().nullish(),
```

- [ ] **Step 2: Remove llmSummary from PendingPermissionItem interface**

In `packages/happy-app/sources/sync/permissionQueue.ts`, delete line 10:

```typescript
// DELETE:
    llmSummary?: string | null;
```

- [ ] **Step 3: Remove llmSummary from buildPermissionQueue mapping**

In the same file, delete line 38:

```typescript
// DELETE:
                llmSummary: req.llmSummary,
```

- [ ] **Step 4: Verify typecheck — expect errors in app components**

Run: `cd /home/jakob/repos/happy-dev/happy && bun typecheck`
Expected: Type errors in components still referencing `llmSummary` — this is expected and will be fixed in subsequent tasks.

- [ ] **Step 5: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-app/sources/sync/storageTypes.ts packages/happy-app/sources/sync/permissionQueue.ts
git commit -m "chore(app): remove llmSummary from AgentStateSchema and permissionQueue"
```

---

### Task 12: Remove llmSummary from useCurrentSessionPermissions hook

**Files:**
- Modify: `packages/happy-app/sources/hooks/useCurrentSessionPermissions.ts:13,50`

- [ ] **Step 1: Remove llmSummary from interface**

In `packages/happy-app/sources/hooks/useCurrentSessionPermissions.ts`, delete line 13:

```typescript
// DELETE:
    llmSummary: string | null;
```

- [ ] **Step 2: Remove llmSummary from mapping**

Delete line 50:

```typescript
// DELETE:
                llmSummary: req.llmSummary ?? null,
```

- [ ] **Step 3: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-app/sources/hooks/useCurrentSessionPermissions.ts
git commit -m "chore(app): remove llmSummary from useCurrentSessionPermissions"
```

---

### Task 13: Remove llmSummary from permissionBannerUtils

**Files:**
- Modify: `packages/happy-app/sources/components/tools/permissionBannerUtils.ts:38`

- [ ] **Step 1: Remove llmSummary from buildPermissionItem**

In `packages/happy-app/sources/components/tools/permissionBannerUtils.ts`, delete line 38:

```typescript
// DELETE:
        llmSummary: item.llmSummary ?? null,
```

- [ ] **Step 2: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-app/sources/components/tools/permissionBannerUtils.ts
git commit -m "chore(app): remove llmSummary from permissionBannerUtils"
```

---

### Task 14: Update PermissionBanner display chain

**Files:**
- Modify: `packages/happy-app/sources/components/PermissionBanner.tsx:66`

- [ ] **Step 1: Update toolDescription fallback**

In `packages/happy-app/sources/components/PermissionBanner.tsx`, change line 66:

```typescript
// Before:
    const toolDescription = current.description ?? current.llmSummary ?? current.tool;
// After:
    const toolDescription = current.description ?? current.tool;
```

- [ ] **Step 2: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-app/sources/components/PermissionBanner.tsx
git commit -m "chore(app): use description ?? tool in PermissionBanner (drop llmSummary)"
```

---

### Task 15: Update PermissionSheetBar display chain

**Files:**
- Modify: `packages/happy-app/sources/components/tools/PermissionSheetBar.tsx:29-32`

- [ ] **Step 1: Update displayText resolution**

In `packages/happy-app/sources/components/tools/PermissionSheetBar.tsx`, change lines 29-32:

```typescript
// Before:
    // Resolve display text — prefer llmSummary, fall back to description or tool name
    const displayText = permission.llmSummary
        ?? permission.description
        ?? permission.tool;
// After:
    // Resolve display text — prefer description, fall back to tool name
    const displayText = permission.description ?? permission.tool;
```

- [ ] **Step 2: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-app/sources/components/tools/PermissionSheetBar.tsx
git commit -m "chore(app): use description ?? tool in PermissionSheetBar (drop llmSummary)"
```

---

### Task 16: Remove llmSummary from PermissionActionBar

**Files:**
- Modify: `packages/happy-app/sources/components/tools/modal/PermissionActionBar.tsx:12,27,93-98`

- [ ] **Step 1: Remove llmSummary prop from interface**

In `packages/happy-app/sources/components/tools/modal/PermissionActionBar.tsx`:

Remove `llmSummary` from the interface (line 12):
```typescript
// DELETE:
    llmSummary: string | null;
```

Remove from destructuring (line 27):
```typescript
// Before:
    llmSummary,
// After:
    (remove this line)
```

Remove the LLM summary display block (lines 93-98):
```typescript
// DELETE:
            {/* LLM summary */}
            {llmSummary ? (
                <Text style={styles.summary} numberOfLines={3}>
                    {llmSummary}
                </Text>
            ) : null}
```

- [ ] **Step 2: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-app/sources/components/tools/modal/PermissionActionBar.tsx
git commit -m "chore(app): remove llmSummary prop from PermissionActionBar"
```

---

### Task 17: Remove llmSummary from ToolView and ToolModal

**Files:**
- Modify: `packages/happy-app/sources/components/tools/ToolView.tsx:69,198`
- Modify: `packages/happy-app/sources/components/tools/modal/ToolModal.tsx:413`

- [ ] **Step 1: Update ToolView permissionItem construction**

In `packages/happy-app/sources/components/tools/ToolView.tsx`, change line 69:

```typescript
// Before:
            llmSummary: tool.permission.decisionReason ?? null,
// After:
            (delete this line)
```

- [ ] **Step 2: Remove llmSummary prop from PermissionActionBar usage in ToolView**

Change line 198:

```typescript
// DELETE:
                        llmSummary={permissionItem?.llmSummary ?? null}
```

- [ ] **Step 3: Remove llmSummary prop from PermissionActionBar usage in ToolModal**

In `packages/happy-app/sources/components/tools/modal/ToolModal.tsx`, change line 413:

```typescript
// DELETE:
                                    llmSummary={permission!.llmSummary}
```

- [ ] **Step 4: Verify full typecheck passes**

Run: `cd /home/jakob/repos/happy-dev/happy && bun typecheck`
Expected: PASS — all `llmSummary` references removed

- [ ] **Step 5: Commit**

```bash
cd /home/jakob/repos/happy-dev/happy && git add packages/happy-app/sources/components/tools/ToolView.tsx packages/happy-app/sources/components/tools/modal/ToolModal.tsx
git commit -m "chore(app): remove llmSummary from ToolView and ToolModal"
```

---

## Chunk 4: Run Tests + Final Verification

### Task 18: Run all test suites

**Files:** (none — verification only)

- [ ] **Step 1: Run CLI tests**

Run: `cd /home/jakob/repos/happy-dev/happy && bun run --filter happy-coder build && bun test:cli`
Expected: All pass (1 pre-existing failure in `sessionProtocolMapper.test.ts` is unrelated)

- [ ] **Step 2: Run wire tests**

Run: `cd /home/jakob/repos/happy-dev/happy && bun test:wire`
Expected: All pass

- [ ] **Step 3: Run app typecheck**

Run: `cd /home/jakob/repos/happy-dev/happy && bun typecheck`
Expected: No errors

- [ ] **Step 4: Run server tests**

Run: `cd /home/jakob/repos/happy-dev/happy && bun test:server`
Expected: All pass

- [ ] **Step 5: Commit any test fixes if needed**

If any tests reference `llmSummary` or `summarizer`, fix them and commit.

```bash
cd /home/jakob/repos/happy-dev/happy && git add -A
git commit -m "test: fix any remaining llmSummary references in tests"
```
