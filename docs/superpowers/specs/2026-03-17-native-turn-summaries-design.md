# Native Turn Summaries — Replace Haiku with CC-Generated Metadata

> **Note (2026-03-17):** The `turn_summary` tool was renamed to `log_step` and decoupled from turn numbering.
> CC now calls it per logical step (not per turn), with optional structured `stats`.
> See `docs/plans/2026-03-17-log-step-refactor.md` for the refactor plan.

**Date:** 2026-03-17
**Status:** Superseded
**Scope:** happy-cli, happy-app, happy-wire (minor)

## Summary

Replace the Haiku-powered summarization system with CC-generated metadata via MCP tools. CC calls `change_title` and `turn_summary` after every turn, producing structured conversation summaries. Permission summaries (`llmSummary`) are dropped in favor of CC's native `description` field.

## Motivation

- **Cost:** Haiku API calls per turn/permission add unnecessary spend
- **Quality:** CC has full conversation context; Haiku only sees tool names + a truncated user message
- **Latency:** Fire-and-forget Haiku calls add 200-500ms of async work
- **Coupling:** CLI currently imports `@anthropic-ai/sdk` solely for summarization
- **Structured history:** Turn summaries keyed by number enable reliable app-side correlation

## Design

### 1. Turn Summary MCP Tool

New `turn_summary` tool registered in `startHappyServer.ts` alongside existing `change_title`.

**MCP tool schema:**
```typescript
mcp.registerTool('turn_summary', {
    title: 'Record Turn Summary',
    description: 'Record a summary of what was accomplished in this turn',
    inputSchema: {
        title: z.string().describe('Short title for this turn (<60 chars)'),
        summary: z.string().describe('Bullet-point summary of actions taken'),
    },
}, async (args) => {
    const turnKey = String(turnCounterRef.value);
    client.updateMetadata((m) => {
        const existing = m.turnSummaries ?? {};
        // Enforce 50-entry growth cap — drop lowest numeric key if at limit
        const keys = Object.keys(existing);
        if (keys.length >= 50) {
            const oldest = keys.sort((a, b) => Number(a) - Number(b))[0];
            delete existing[oldest];
        }
        return {
            ...m,
            turnSummaries: {
                ...existing,
                [turnKey]: {
                    title: args.title,
                    summary: args.summary,
                    createdAt: Date.now(),
                },
            },
        };
    });
    return { content: [{ type: 'text', text: `Turn ${turnKey} summary recorded.` }] };
});
```

**Turn numbering:** `startHappyServer` accepts a mutable ref object `{ value: number }` (e.g., `turnCounterRef`). The MCP handler reads `turnCounterRef.value` inside its closure. The counter is incremented at turn start in `claudeRemoteLauncher.ts`'s `nextMessage` callback (when a user message arrives), so turn 1 gets key `"1"`. `runClaude.ts` creates the ref, passes it to `startHappyServer()` directly, and to the launcher via `Session.turnCounterRef`. CC does not control the turn number — CLI is source of truth.

**Auto-allowed:** `startHappyServer` returns `toolNames: ['change_title', 'turn_summary']`. This array is mapped to `mcp__happy__*` prefixed names in `runClaude.ts` line 539 and passed as `allowedTools`, so neither tool triggers permission prompts.

### 2. Change Title — Now Per-Turn

**Current behavior:** CC calls `change_title` at session start only (system prompt instruction).

**New behavior:** CC calls `change_title` after every turn. Title is short (<60 chars), describes the overall session focus, continuously overwritten as the session evolves.

**No code change to `change_title` itself** — it already overwrites `metadata.summary.text` via `sendClaudeSessionMessage({ type: 'summary', summary: title })`.

### 3. Metadata Schema Extension

```typescript
// In storageTypes.ts MetadataSchema
turnSummaries: z.record(z.string(), z.object({
    title: z.string(),
    summary: z.string(),
    createdAt: z.number(),
})).optional(),
```

Dict keyed by turn number (string). Benefits:
- Gaps are expected — if CC forgets to call the tool, that turn key is simply absent
- App can correlate summaries to turns by number, even with missing entries
- No data corruption or index shift from missed calls
- Each turn has its own title (distinct from session title)

**Growth cap:** 50 entries max. The cap is enforced inside the `turn_summary` tool handler in `startHappyServer.ts`: before appending, if `Object.keys(turnSummaries).length >= 50`, drop the entry with the lowest numeric key. This keeps the encrypted metadata blob reasonable for long sessions.

### 4. Permission Summary Removal

**Drop `llmSummary`** — CC's native `description` field (provided on every `ToolPermissionContext`) is already stored and used as fallback.

**Display chain change:**
- Before: `llmSummary ?? description ?? tool`
- After: `description ?? tool`

**Files affected (remove `llmSummary` references):**

CLI:
- `src/claude/utils/summarizer.ts` — **delete entirely**
- `src/claude/utils/summarizer.test.ts` — **delete entirely**
- `src/claude/utils/permissionHandler.ts` — remove Haiku call (lines 317-331)
- `src/claude/claudeRemoteLauncher.ts` — remove Haiku call (lines 555-565), remove `turnToolCalls` tracking (lines 185-187, 249-252, 484, 501)
- `src/api/types.ts` — remove `llmSummary` from AgentState type

App:
- `sources/sync/storageTypes.ts` — remove `llmSummary` from AgentStateSchema
- `sources/sync/permissionQueue.ts` — remove `llmSummary` field
- `sources/components/PermissionBanner.tsx` — use `description ?? tool`
- `sources/components/tools/modal/PermissionActionBar.tsx` — remove `llmSummary` prop
- `sources/components/tools/PermissionSheetBar.tsx` — remove `llmSummary` fallback
- `sources/components/tools/ToolView.tsx` — remove `llmSummary` reference
- `sources/components/tools/ToolModal.tsx` — remove `llmSummary` prop pass-through
- `sources/components/tools/permissionBannerUtils.ts` — remove `llmSummary` mapping
- `sources/hooks/useCurrentSessionPermissions.ts` — remove `llmSummary` field

**No wire migration needed:** `llmSummary` is `z.string().nullish()` — old sessions with it still parse. We just stop writing and reading it.

### 5. System Prompt Update

**File:** `src/claude/utils/systemPrompt.ts`

Replace current `BASE_SYSTEM_PROMPT` with:

```
After every turn, call these two tools:
1. "mcp__happy__change_title" — Set/update the session title. Keep it short (<60 chars).
   Update it whenever the session focus shifts. This helps the user find this chat later.
2. "mcp__happy__turn_summary" — Summarize what you did this turn.
   - "title": Short title for this turn (<60 chars, e.g., "Refactored auth module")
   - "summary": Bullet points of key actions (e.g., "- Renamed 3 functions\n- Updated tests")
```

### 6. Dependency Cleanup

Remove `@anthropic-ai/sdk` from `happy-cli/package.json`. The only usage was in `summarizer.ts`. The CLI wraps the `claude` binary via `@anthropic-ai/claude-code` and does not need a direct Anthropic SDK dependency.

## Data Flow

### Turn Summary Flow
```
CC completes turn
  → CC calls mcp__happy__turn_summary({ title, summary })
  → startHappyServer handler receives call
  → Handler reads turnCounterRef.value from shared ref
  → client.updateMetadata() appends to turnSummaries dict
  → Metadata encrypted + synced to server
  → App receives updated metadata
  → App reads session.metadata.turnSummaries[turnNumber]
```

### Title Flow (unchanged mechanism, new frequency)
```
CC completes turn
  → CC calls mcp__happy__change_title({ title })
  → Handler calls sendClaudeSessionMessage({ type: 'summary', summary: title })
  → apiSession.ts updates metadata.summary.text
  → App reads via getSessionName() → metadata.summary.text
```

### Permission Flow (simplified)
```
CC requests tool permission
  → canCallTool callback fires with ToolPermissionContext
  → context.description stored in agentState.requests[id].description
  → (no more Haiku call)
  → App displays: description ?? tool name
```

## Future Use (out of scope for this change)

- **App display:** Turn summaries shown as a structured timeline/accordion in session detail view
- **Voice agent context:** Feed `turnSummaries` to voice agent for richer awareness of CC's recent work
- **Notification text:** Use turn title as notification body when CC completes a turn

## Testing

- Unit test for `turn_summary` MCP tool handler (title/summary stored at correct turn key)
- Unit test for turn number increment (counter advances on each `onReady`)
- Unit test for growth cap (oldest entries dropped at 50)
- Verify `change_title` still works (existing test coverage)
- Verify permission display uses `description` fallback (update existing tests)
- Integration: run a session, verify `turnSummaries` populated in metadata
