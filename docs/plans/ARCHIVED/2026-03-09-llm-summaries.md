# LLM Summaries for Permission Requests + Turn Completion

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate Haiku-powered human-readable summaries for (1) permission request banners and (2) CC turn completion, enabling richer notifications and future voice agent context.

**Architecture:** The CLI calls Haiku asynchronously after events — no blocking of the main flow. Summaries are added to existing sync data structures (`agentState.requests[id].llmSummary` and `metadata.summary`) and flow to the app via the existing encrypted sync. The app displays them reactively — PermissionBanner updates when `llmSummary` arrives, session list shows turn summaries.

**Tech Stack:** `@anthropic-ai/sdk` (new dep in happy-cli), existing Unistyles/i18n patterns in happy-app.

---

## Background: Data Flow

```
CLI permissionHandler.ts
  → updateAgentState({ requests: { [id]: { tool, description, llmSummary? } } })
  → Server relay (encrypted)
  → App sync → agentState → buildPermissionQueue() → PendingPermissionItem
  → PermissionBanner shows { llmSummary ?? description }

CLI claudeRemoteLauncher.ts onReady()
  → updateMetadata({ summary: { text, updatedAt } })
  → App sync → session.metadata.summary
  → SessionListItem shows summary.text as subtitle
```

## Key Files

| Role | File |
|---|---|
| CLI: AgentState type | `packages/happy-cli/src/api/types.ts:301-330` |
| CLI: Permission handler | `packages/happy-cli/src/claude/utils/permissionHandler.ts:275-288` |
| CLI: Remote launcher turn end | `packages/happy-cli/src/claude/claudeRemoteLauncher.ts:466-474` |
| App: AgentState schema | `packages/happy-app/sources/sync/storageTypes.ts:49-73` |
| App: Permission queue | `packages/happy-app/sources/sync/permissionQueue.ts` |
| App: Permission banner | `packages/happy-app/sources/components/PermissionBanner.tsx` |
| App: Session list item | Find with `Grep 'SessionListItem\|SessionRow'` in `packages/happy-app/sources/` |

---

## Task 1: Add `@anthropic-ai/sdk` to happy-cli

**Files:**
- Modify: `packages/happy-cli/package.json` (via yarn)

**Step 1: Install the SDK**

```bash
yarn workspace happy-coder add @anthropic-ai/sdk
```

**Step 2: Verify install**

```bash
yarn workspace happy-coder typecheck
```
Expected: no new errors.

**Step 3: Commit**

```bash
git add packages/happy-cli/package.json yarn.lock
git commit -m "feat(cli): add @anthropic-ai/sdk for Haiku summaries"
```

---

## Task 2: Add `llmSummary` to CLI + App `AgentState` types

**Files:**
- Modify: `packages/happy-cli/src/api/types.ts:313`
- Modify: `packages/happy-app/sources/sync/storageTypes.ts:57`

**Step 1: CLI type — add field after `description`**

In `packages/happy-cli/src/api/types.ts`, inside the `requests` record (around line 313):

```typescript
// Before:
      /** Human-readable description of the tool action */
      description?: string,
    }

// After:
      /** Human-readable description of the tool action */
      description?: string,
      /** Haiku-generated summary of what this tool call will do */
      llmSummary?: string,
    }
```

**Step 2: App schema — add Zod field**

In `packages/happy-app/sources/sync/storageTypes.ts`, inside `AgentStateSchema.requests` (around line 57):

```typescript
// Before:
        description: z.string().nullish(),
    })).nullish(),

// After:
        description: z.string().nullish(),
        llmSummary: z.string().nullish(),
    })).nullish(),
```

**Step 3: Typecheck both packages**

```bash
yarn workspace happy-coder typecheck && yarn workspace happy-app typecheck
```
Expected: both pass with no errors.

**Step 4: Commit**

```bash
git add packages/happy-cli/src/api/types.ts packages/happy-app/sources/sync/storageTypes.ts
git commit -m "feat: add llmSummary field to AgentState permission requests"
```

---

## Task 3: Create `summarizer.ts` with pure prompt builders

**Files:**
- Create: `packages/happy-cli/src/claude/utils/summarizer.ts`

This file has two concerns:
1. **Pure prompt builder functions** (testable without API)
2. **Thin Haiku callers** that call the SDK

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/ui/logger';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 80; // summaries should be short

/**
 * Build the prompt for summarizing a single permission request.
 * Pure function — takes tool name, args, and optional CC description.
 * Returns the prompt string to send to Haiku.
 */
export function buildPermissionSummaryPrompt(
    tool: string,
    args: Record<string, unknown>,
    description?: string | null,
): string {
    const argsSummary = formatArgs(tool, args);
    const descLine = description ? `\nDescription: ${description}` : '';
    return (
        `Tool: ${tool}\nArguments: ${argsSummary}${descLine}\n\n` +
        `In one short sentence (under 80 chars), describe what this AI coding agent is about to do. ` +
        `Be specific about the file/command/action. No preamble, just the sentence.`
    );
}

/**
 * Build the prompt for summarizing what CC accomplished in a turn.
 * Pure function — takes the user message and a list of tool calls made.
 */
export function buildTurnSummaryPrompt(
    userMessage: string,
    toolCalls: Array<{ tool: string; description?: string | null }>,
): string {
    const toolLines = toolCalls.length > 0
        ? toolCalls.map(t => `- ${t.tool}${t.description ? ': ' + t.description : ''}`).join('\n')
        : '(no tool calls)';
    return (
        `User asked: "${userMessage.slice(0, 200)}"\n` +
        `Tools used:\n${toolLines}\n\n` +
        `In one short sentence (under 80 chars), summarize what the AI coding agent accomplished. ` +
        `Use past tense. No preamble, just the sentence.`
    );
}

/**
 * Format tool arguments to a short readable string.
 * Handles common tool types (Bash command, file paths, etc.)
 */
function formatArgs(tool: string, args: Record<string, unknown>): string {
    if (tool === 'Bash' && typeof args.command === 'string') {
        return args.command.slice(0, 300);
    }
    if (typeof args.file_path === 'string') {
        return args.file_path;
    }
    if (typeof args.path === 'string') {
        return args.path;
    }
    // Generic: JSON truncated
    return JSON.stringify(args).slice(0, 200);
}

/**
 * Call Haiku to generate a permission request summary.
 * Returns null on error (caller falls back to existing description).
 */
export async function generatePermissionSummary(
    tool: string,
    args: Record<string, unknown>,
    description?: string | null,
): Promise<string | null> {
    try {
        const client = new Anthropic();
        const prompt = buildPermissionSummaryPrompt(tool, args, description);
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [{ role: 'user', content: prompt }],
        });
        const text = response.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('')
            .trim();
        return text || null;
    } catch (err) {
        logger.debug('[summarizer] generatePermissionSummary failed:', err);
        return null;
    }
}

/**
 * Call Haiku to generate a turn completion summary.
 * Returns null on error (caller skips metadata update).
 */
export async function generateTurnSummary(
    userMessage: string,
    toolCalls: Array<{ tool: string; description?: string | null }>,
): Promise<string | null> {
    try {
        const client = new Anthropic();
        const prompt = buildTurnSummaryPrompt(userMessage, toolCalls);
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [{ role: 'user', content: prompt }],
        });
        const text = response.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('')
            .trim();
        return text || null;
    } catch (err) {
        logger.debug('[summarizer] generateTurnSummary failed:', err);
        return null;
    }
}
```

**Step 1: Run typecheck to verify the file is valid**

```bash
yarn workspace happy-coder typecheck
```
Expected: passes.

**Step 2: Commit**

```bash
git add packages/happy-cli/src/claude/utils/summarizer.ts
git commit -m "feat(cli): add summarizer utility with Haiku prompt builders"
```

---

## Task 4: Unit tests for prompt builders

**Files:**
- Create: `packages/happy-cli/src/claude/utils/summarizer.test.ts`

These tests only cover the pure `buildXxxPrompt` functions — no API calls needed.

```typescript
import { describe, expect, it } from 'vitest';
import { buildPermissionSummaryPrompt, buildTurnSummaryPrompt } from './summarizer';

describe('buildPermissionSummaryPrompt', () => {
    it('includes tool name and bash command in prompt', () => {
        const prompt = buildPermissionSummaryPrompt(
            'Bash',
            { command: 'yarn workspace happy-app typecheck' },
            'Run TypeScript type checking'
        );
        expect(prompt).toContain('Bash');
        expect(prompt).toContain('yarn workspace happy-app typecheck');
        expect(prompt).toContain('Run TypeScript type checking');
    });

    it('includes file path for file-based tools', () => {
        const prompt = buildPermissionSummaryPrompt(
            'Write',
            { file_path: '/home/jakob/foo.ts', content: 'hello' },
            null
        );
        expect(prompt).toContain('/home/jakob/foo.ts');
    });

    it('omits description line when description is null', () => {
        const prompt = buildPermissionSummaryPrompt('Read', { file_path: '/tmp/x' }, null);
        expect(prompt).not.toContain('Description:');
    });

    it('truncates long bash commands to 300 chars', () => {
        const longCmd = 'x'.repeat(500);
        const prompt = buildPermissionSummaryPrompt('Bash', { command: longCmd }, null);
        // The formatted args should be max 300 chars
        expect(prompt).toContain('x'.repeat(300));
        expect(prompt).not.toContain('x'.repeat(400));
    });
});

describe('buildTurnSummaryPrompt', () => {
    it('includes user message and tool calls', () => {
        const prompt = buildTurnSummaryPrompt(
            'Fix the type errors in the reducer',
            [
                { tool: 'Read', description: 'packages/happy-app/sources/sync/reducer.ts' },
                { tool: 'Edit', description: 'Fix type assertion' },
            ]
        );
        expect(prompt).toContain('Fix the type errors in the reducer');
        expect(prompt).toContain('Read');
        expect(prompt).toContain('Edit');
    });

    it('handles empty tool calls', () => {
        const prompt = buildTurnSummaryPrompt('Just describe what you see', []);
        expect(prompt).toContain('(no tool calls)');
    });

    it('truncates long user messages', () => {
        const longMsg = 'a'.repeat(500);
        const prompt = buildTurnSummaryPrompt(longMsg, []);
        // User message should be max 200 chars
        expect(prompt).toContain('"' + 'a'.repeat(200) + '"');
        expect(prompt).not.toContain('a'.repeat(300));
    });
});
```

**Step 1: Run tests to verify they pass**

```bash
cd packages/happy-cli && yarn vitest run src/claude/utils/summarizer.test.ts
```
Expected: all tests pass.

**Step 2: Commit**

```bash
git add packages/happy-cli/src/claude/utils/summarizer.test.ts
git commit -m "test(cli): add unit tests for summarizer prompt builders"
```

---

## Task 5: Wire permission summarizer into `permissionHandler.ts`

**Files:**
- Modify: `packages/happy-cli/src/claude/utils/permissionHandler.ts`

**Background:** Read `permissionHandler.ts` lines 275-292 first. The key block is where `updateAgentState()` is called to store the new request. After that block, add a fire-and-forget async call.

**Step 1: Add import at the top of `permissionHandler.ts`**

Find the existing import block at the top and add:

```typescript
import { generatePermissionSummary } from '@/claude/utils/summarizer';
```

**Step 2: After the `updateAgentState()` call that stores the request, add the async summary call**

Find the block (around lines 275-288) that looks like:
```typescript
this.session.client.updateAgentState((currentState) => ({
    ...currentState,
    requests: {
        ...currentState.requests,
        [id]: {
            tool: toolName,
            arguments: input,
            createdAt: Date.now(),
            permissionSuggestions: context?.permissionSuggestions,
            decisionReason: context?.decisionReason,
            description: context?.description,
        }
    }
}));
```

After this block (not inside it), add:

```typescript
// Fire-and-forget: generate Haiku summary asynchronously
// Does not block permission request display
void generatePermissionSummary(toolName, input, context?.description).then((summary) => {
    if (!summary) return;
    this.session.client.updateAgentState((currentState) => {
        const existing = currentState.requests?.[id];
        if (!existing) return currentState; // request was already completed
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

**Step 3: Typecheck**

```bash
yarn workspace happy-coder typecheck
```
Expected: passes.

**Step 4: Commit**

```bash
git add packages/happy-cli/src/claude/utils/permissionHandler.ts
git commit -m "feat(cli): generate Haiku summary for permission requests async"
```

---

## Task 6: Wire turn summarizer into `claudeRemoteLauncher.ts`

**Files:**
- Modify: `packages/happy-cli/src/claude/claudeRemoteLauncher.ts`

**Background:** We need to:
1. Track tool calls during a turn (reset at start of turn, collect during `onMessage`)
2. After `onReady`, call `generateTurnSummary()` and update `metadata.summary`

**Step 1: Read the top section of `claudeRemoteLauncher.ts`** to understand the loop structure and where `onMessage` is defined (around line 457).

**Step 2: Add import for summarizer**

```typescript
import { generateTurnSummary } from '@/claude/utils/summarizer';
```

**Step 3: Add turn-level tool call tracking variable**

Inside the per-turn loop (before the `runClaude()` / SDK spawn call), add a mutable variable to collect tool calls for the current turn:

```typescript
// Track tool calls this turn for summary generation
const turnToolCalls: Array<{ tool: string; description?: string | null }> = [];
```

**Step 4: Collect tool calls in `onMessage`**

Find the `onMessage` callback (line ~457):
```typescript
onMessage,
```

This references a function defined earlier. Find where `onMessage` is defined and add tool-call collection. Look for where tool_use messages are processed (search for `tool_use` in the file). When a tool_use message is received, push to `turnToolCalls`:

```typescript
if (msg.type === 'tool_use' || (msg.content && Array.isArray(msg.content))) {
    // Collect tool calls for turn summary
    for (const item of Array.isArray(msg.content) ? msg.content : []) {
        if (item.type === 'tool_use') {
            turnToolCalls.push({ tool: item.name, description: item.description });
        }
    }
}
```

> **Note for implementer:** The exact shape of messages depends on how `onMessage` works. Read the `onMessage` handler and the `RunOutputMessage` type to find where tool_use items are available. Alternatively, collect from `permissionHandler`'s existing tool tracking if available.

**Step 5: After `closeClaudeSessionTurn('completed', stats)` in `onReady`, add turn summary generation**

Find the `onReady` callback (line 466-474):
```typescript
onReady: (stats) => {
    session.client.closeClaudeSessionTurn('completed', stats);
    // ... push notification code ...
},
```

Add after `closeClaudeSessionTurn`:

```typescript
onReady: (stats) => {
    session.client.closeClaudeSessionTurn('completed', stats);

    // Fire-and-forget: generate turn summary for session list + voice agent
    const lastUserMessage = session.queue.getLastUserMessage?.() ?? '';
    if (lastUserMessage && turnToolCalls.length > 0) {
        void generateTurnSummary(lastUserMessage, turnToolCalls).then((summary) => {
            if (!summary) return;
            session.client.updateMetadata((m) => ({
                ...m,
                summary: { text: summary, updatedAt: Date.now() },
            }));
        });
    }

    // ... rest of onReady (push notification) ...
},
```

> **Note for implementer:** If `session.queue.getLastUserMessage()` doesn't exist, find the right way to get the last user message. Look at `session.queue` API or track it manually with a variable in the loop. The key insight is: we just need the user's last request text (the message that triggered this CC turn).

**Step 6: Typecheck**

```bash
yarn workspace happy-coder typecheck
```
Expected: passes.

**Step 7: Commit**

```bash
git add packages/happy-cli/src/claude/claudeRemoteLauncher.ts
git commit -m "feat(cli): generate Haiku turn summary after CC turn completion"
```

---

## Task 7: Update app `PendingPermissionItem` + queue builder

**Files:**
- Modify: `packages/happy-app/sources/sync/permissionQueue.ts`

**Step 1: Add `llmSummary` to `PendingPermissionItem` interface**

```typescript
// Before:
export interface PendingPermissionItem {
    sessionId: string;
    session: Session;
    permissionId: string;
    tool: string;
    description?: string | null;
    createdAt?: number | null;
    permissionSuggestions?: any[] | null;
}

// After:
export interface PendingPermissionItem {
    sessionId: string;
    session: Session;
    permissionId: string;
    tool: string;
    description?: string | null;
    llmSummary?: string | null;   // ← add this
    createdAt?: number | null;
    permissionSuggestions?: any[] | null;
}
```

**Step 2: Pass `llmSummary` through in `buildPermissionQueue()`**

Find the `items.push({...})` call (around line 30-40) and add the field:

```typescript
items.push({
    sessionId: session.id,
    session,
    permissionId: permId,
    tool: req.tool,
    description: req.description,
    llmSummary: req.llmSummary,   // ← add this
    createdAt: req.createdAt,
    permissionSuggestions: req.permissionSuggestions,
});
```

**Step 3: Typecheck**

```bash
yarn workspace happy-app typecheck
```
Expected: passes.

**Step 4: Commit**

```bash
git add packages/happy-app/sources/sync/permissionQueue.ts
git commit -m "feat(app): pass llmSummary through permission queue builder"
```

---

## Task 8: Update `PermissionBanner.tsx` to use `llmSummary`

**Files:**
- Modify: `packages/happy-app/sources/components/PermissionBanner.tsx`

**Background:** The banner already constructs `toolLine` from `current.description`. We need to use `llmSummary` when available, falling back to description.

**Step 1: Read `PermissionBanner.tsx`** to find where `toolLine` is constructed (look for `permissionTool` or `current.description`).

**Step 2: Update the `toolLine` construction**

Find the line that builds `toolLine` for regular (non-notification) permissions. It currently looks like:
```typescript
: t('notifications.permissionTool', {
    tool: current.tool,
    description: current.description ?? undefined,
});
```

Change it to use `llmSummary` when available:
```typescript
: (current.llmSummary
    ? current.llmSummary  // Use Haiku summary directly (already human-readable)
    : t('notifications.permissionTool', {
        tool: current.tool,
        description: current.description ?? undefined,
    }));
```

> **Design note:** `llmSummary` is already a complete sentence like "Running TypeScript type checking on the happy-app package". The `permissionTool` i18n key formats as `"Bash · run tests"`. When `llmSummary` is present, we show it directly instead of the i18n-formatted string. When absent, we fall back to the existing behavior.

**Step 3: Optionally style the LLM summary differently**

If you want to visually distinguish between the technical description and the LLM summary, you can check `!!current.llmSummary` and apply a slightly different text style. But this is optional — the existing `subtitleText` style is fine.

**Step 4: Typecheck**

```bash
yarn workspace happy-app typecheck
```
Expected: passes.

**Step 5: Commit**

```bash
git add packages/happy-app/sources/components/PermissionBanner.tsx
git commit -m "feat(app): show LLM-generated summary in PermissionBanner subtitle"
```

---

## Task 9: Display `metadata.summary` in session list + session detail

Two display locations:
1. **Session list** — single truncated line as subtitle under session name
2. **Session detail** — slightly more space (2-3 lines, non-truncated)

### 9a: Session list subtitle

**Files:**
- Find session list item component: `grep -r "getSessionName" packages/happy-app/sources --include="*.tsx" -l`
- Likely: something in `packages/happy-app/sources/components/` or `app/(app)/`

**Step 1: Find and read the session list item component**

**Step 2: Add one-line summary subtitle**

After the session name text element, conditionally render the summary:

```typescript
{session.metadata?.summary?.text && (
    <Text style={styles.summaryText} numberOfLines={1}>
        {session.metadata.summary.text}
    </Text>
)}
```

**Step 3: Add style**

```typescript
summaryText: {
    fontSize: 12,
    color: theme.colors.typographySecondary,
    marginTop: 1,
},
```

### 9b: Session detail view

**Files:**
- Find session detail/header component: look in `packages/happy-app/sources/app/(app)/session/[id]/`
- Likely the session header or a metadata section at the top of the session view

**Step 1: Find and read the session detail component**

**Step 2: Add multi-line summary block**

In a suitable spot (e.g. below session name/metadata header, above messages), add:

```typescript
{session.metadata?.summary?.text && (
    <View style={styles.summaryBlock}>
        <Text style={styles.summaryBlockText} numberOfLines={3}>
            {session.metadata.summary.text}
        </Text>
    </View>
)}
```

**Step 3: Add styles**

```typescript
summaryBlock: {
    paddingHorizontal: theme.margins.md,
    paddingVertical: 6,
    marginBottom: 4,
},
summaryBlockText: {
    fontSize: 13,
    color: theme.colors.typographySecondary,
    lineHeight: 18,
},
```

> **Note for implementer:** Adjust padding/margins to match surrounding components. The summary block should feel like a soft context note, not a prominent UI element. Check existing session header patterns to find the right insertion point.

**Step 4: Typecheck**

```bash
yarn workspace happy-app typecheck
```
Expected: passes.

**Step 5: Commit**

```bash
git add packages/happy-app/sources/  # stage all modified app files
git commit -m "feat(app): show turn summary in session list and session detail"
```

---

## Task 10: Final typecheck + build verification

**Step 1: Full typecheck**

```bash
yarn workspace happy-coder typecheck && yarn workspace happy-app typecheck
```
Expected: both pass.

**Step 2: Run CLI tests**

```bash
yarn workspace happy-coder test -- --run src/claude/utils/summarizer.test.ts
```
Expected: all pass.

**Step 3: Final commit if anything was missed**

```bash
git status  # check nothing was left unstaged
```

---

## Verification Checklist

1. ✅ `yarn workspace happy-coder typecheck` passes
2. ✅ `yarn workspace happy-app typecheck` passes
3. ✅ Summarizer tests pass
4. ✅ Manual: start daemon + trigger a bash permission → banner shows Haiku summary after ~1s
5. ✅ Manual: complete a CC turn → session list shows summary text
6. ✅ Fallback: if `ANTHROPIC_API_KEY` not set → Haiku call fails silently, banner shows existing `description`

## Notes for Implementer

- **Fire-and-forget pattern**: Both Haiku calls are `void promise.then(...)` — they never block the main flow. If Haiku fails, we log at debug level and continue without the summary.
- **No loading state**: The banner shows existing `description` immediately, then smoothly updates to `llmSummary` when it arrives (~500ms-2s). No skeleton/spinner needed.
- **`Metadata.summary` already exists**: The `summary: { text, updatedAt }` field is already in both CLI `Metadata` type and app `MetadataSchema` — no schema changes needed for turn summaries.
- **Cost**: Haiku is ~$0.00025/1k input tokens. Each permission summary uses ~100 input tokens = $0.000025 per permission request. Negligible.
- **ANTHROPIC_API_KEY**: Must be set in the user's environment. The CLI already depends on this for CC itself, so it will always be available.
