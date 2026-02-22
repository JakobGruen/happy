# Plan: Multi-Question Interactive User Tool (Voice Relay)

## Problem Statement

When Claude Code calls the `AskUserQuestion` tool, the app displays a multi-choice UI. However, the voice agent **cannot relay these questions** to the user or send structured answers back. The voice agent only has two tools: `messageClaudeCode` (text relay) and `processPermissionRequest` (binary allow/deny).

### Key Gaps Identified

1. **Voice agent doesn't receive `lk.chat` messages** — Permission requests (including AskUserQuestion) are sent via the `lk.chat` text stream topic, but the agent only registers a handler for `lk.context`. The `lk.chat` messages may be silently dropped.

2. **No structured question format for voice** — `formatPermissionRequest()` sends raw JSON tool args in XML tags. Not voice-friendly. The agent would need to parse JSON to understand the questions.

3. **No tool to send structured answers** — Even if the agent receives the question, `processPermissionRequest` only handles allow/deny. AskUserQuestion requires **both** permission approval AND a formatted text response (`sessionAllow()` + `sync.sendMessage()`).

4. **"Other" free-text option not wired up** — Translation keys exist (`tools.askUserQuestion.other`, `otherDescription`, `otherPlaceholder`) but the app UI doesn't implement it yet.

---

## Architecture Overview

### Current Flow (App-only, works)
```
Claude Code → AskUserQuestion tool → agentState.requests
    → App renders AskUserQuestionView
    → User taps options + Submit
    → sessionAllow(permissionId) + sync.sendMessage(formatted answer)
    → Response flows back to Claude Code
```

### New Flow (Voice relay)
```
Claude Code → AskUserQuestion tool → agentState.requests
    → voiceHooks.onPermissionRequested() formats question for voice
    → Agent receives via lk.chat, reads questions aloud
    → User speaks their choice(s)
    → Agent calls answer_user_question RPC with selections
    → App handler: sessionAllow() + sync.sendMessage(formatted answer)
    → Response flows back to Claude Code
```

Both flows coexist — app UI still works independently. Voice relay is additive.

---

## Implementation Tasks

### Task 1: Register `lk.chat` handler in voice agent

**File:** `packages/happy-voice-agent/agent.py` (in `on_enter()`)

Currently only `lk.context` is registered. Add a second handler for `lk.chat`:

```python
async def _handle_chat(reader, participant_identity):
    text = await reader.read_all()
    if text:
        logger.info(f"Chat update from {participant_identity}: {text[:200]}")
        chat_ctx = self.chat_ctx.copy()
        chat_ctx.add_message(role="system", content=text)
        await self.update_chat_ctx(chat_ctx)

room.register_text_stream_handler(
    "lk.chat",
    lambda reader, pid: asyncio.create_task(_handle_chat(reader, pid)),
)
```

**Why:** Permission requests and ready events use `lk.chat` for immediate delivery (no debounce). Without this handler, the agent never sees them.

---

### Task 2: Voice-friendly AskUserQuestion context formatter

**File:** `packages/happy-app/sources/realtime/hooks/contextFormatters.ts`

Add a new formatter that presents questions in a structured, voice-readable format:

```typescript
export function formatAskUserQuestion(
    sessionId: string,
    requestId: string,
    questions: Array<{
        question: string;
        header: string;
        options: Array<{ label: string; description: string }>;
        multiSelect: boolean;
    }>
): string {
    const lines: string[] = [];
    lines.push(`Claude Code is asking the user question(s) (session ${sessionId}):`);
    lines.push(`<request_id>${requestId}</request_id>`);
    lines.push('');

    questions.forEach((q, i) => {
        const num = questions.length > 1 ? `Question ${i + 1}: ` : '';
        lines.push(`${num}${q.question}`);
        lines.push(`[${q.multiSelect ? 'Select one or more' : 'Select one'}]`);
        q.options.forEach((opt, j) => {
            const letter = String.fromCharCode(65 + j); // A, B, C, D
            lines.push(`  ${letter}) ${opt.label} — ${opt.description}`);
        });
        lines.push('');
    });

    lines.push('Read the question and options to the user. After they choose, call answer_user_question with their selections.');
    return lines.join('\n');
}
```

**File:** `packages/happy-app/sources/realtime/hooks/voiceHooks.ts`

Update `onPermissionRequested` to detect AskUserQuestion and use the voice-friendly formatter:

```typescript
onPermissionRequested(sessionId: string, requestId: string, toolName: string, toolArgs: any) {
    if (VOICE_CONFIG.DISABLE_PERMISSION_REQUESTS) return;

    reportSession(sessionId);

    if (toolName === 'AskUserQuestion' && toolArgs?.questions) {
        // Use voice-friendly question format
        reportTextUpdate(formatAskUserQuestion(sessionId, requestId, toolArgs.questions));
    } else {
        // Standard permission request format
        reportTextUpdate(formatPermissionRequest(sessionId, requestId, toolName, toolArgs));
    }
}
```

---

### Task 3: New `answerUserQuestion` RPC handler in app

**File:** `packages/happy-app/sources/realtime/realtimeClientTools.ts`

Add a new handler that mirrors what `AskUserQuestionView.handleSubmit()` does:

```typescript
answerUserQuestion: async (parameters: unknown) => {
    const schema = z.object({
        answers: z.array(z.object({
            questionIndex: z.number(),
            header: z.string(),
            selectedLabels: z.array(z.string().min(1)),
        }))
    });
    const parsed = schema.safeParse(parameters);
    if (!parsed.success) {
        return "error (invalid parameters)";
    }

    const sessionId = getCurrentRealtimeSessionId();
    if (!sessionId) return "error (no active session)";

    // Find the pending AskUserQuestion permission request
    const session = storage.getState().sessions[sessionId];
    const requests = session?.agentState?.requests;
    if (!requests || Object.keys(requests).length === 0) {
        return "error (no pending question)";
    }

    // Find the AskUserQuestion request
    const requestEntry = Object.entries(requests).find(
        ([_, req]) => req.tool === 'AskUserQuestion'
    );
    if (!requestEntry) {
        return "error (no pending AskUserQuestion)";
    }
    const [requestId] = requestEntry;

    // Format answer text (same format as AskUserQuestionView)
    const responseText = parsed.data.answers
        .map(a => `${a.header}: ${a.selectedLabels.join(', ')}`)
        .join('\n');

    try {
        // 1. Approve the permission
        await sessionAllow(sessionId, requestId);
        // 2. Send the formatted answer as a message
        await sync.sendMessage(sessionId, responseText);
        return `Answer submitted: ${responseText}. Briefly confirm to the user.`;
    } catch (error) {
        return "error (failed to submit answer)";
    }
}
```

---

### Task 4: Register the new RPC method in LiveKit session components

**File:** `packages/happy-app/sources/realtime/LiveKitVoiceSession.tsx` (RoomHandler useEffect)
**File:** `packages/happy-app/sources/realtime/LiveKitVoiceSession.web.tsx` (same pattern)

Add registration alongside existing RPC methods:

```typescript
room.registerRpcMethod('answerUserQuestion', async (data) => {
    const payload = JSON.parse(data.payload);
    return await realtimeClientTools.answerUserQuestion(payload);
});

// In cleanup:
room.unregisterRpcMethod('answerUserQuestion');
```

---

### Task 5: New `answer_user_question` tool in voice agent

**File:** `packages/happy-voice-agent/agent.py`

Add a third function tool to the HappyAgent class:

```python
@function_tool
async def answer_user_question(
    self,
    context: RunContext,
    answers: list[dict],
):
    """Answer a multi-choice question from Claude Code on behalf of the user.
    Call this after the user verbally chooses from the presented options.

    Args:
        answers: List of answer objects, each with:
            - questionIndex (int): 0-based index of the question
            - header (str): The question header/category
            - selectedLabels (list[str]): Labels of the selected option(s)
    """
    try:
        response = await get_job_context().room.local_participant.perform_rpc(
            destination_identity=self._get_user_identity(),
            method="answerUserQuestion",
            payload=json.dumps({"answers": answers}),
            response_timeout=10.0,
        )
        return response
    except Exception as e:
        logger.error(f"Failed to submit answer: {e}")
        raise ToolError("Failed to submit answer to question")
```

---

### Task 6: Update voice agent system prompt

**File:** `packages/happy-voice-agent/agent.py` (SYSTEM_PROMPT)

Add a new section after "# Permission Handling":

```
# Answering Questions from Claude Code

When you receive a message about Claude Code asking the user question(s):
1. Read the question and all options aloud to the user. Use the letter labels (A, B, C, D).
   Example: "Claude is asking: Which database should we use? A, PostgreSQL. B, SQLite. C, MySQL."
2. Wait for the user to speak their choice.
3. Map their spoken answer to the option label(s). Users might say the letter, the label, or describe it.
4. Call answer_user_question with the structured answer.
   Example: answers=[{"questionIndex": 0, "header": "Database", "selectedLabels": ["PostgreSQL"]}]

For multi-select questions, collect multiple answers before submitting.
If the user's answer is ambiguous, ask for clarification: "Did you mean A or B?"

IMPORTANT: Do NOT use processPermissionRequest for AskUserQuestion — use answer_user_question instead.
It handles both the permission approval and sending the structured answer back.
```

---

### Task 7: Add "Other" free-text option to AskUserQuestionView (General improvement)

**File:** `packages/happy-app/sources/components/tools/views/AskUserQuestionView.tsx`

Wire up the existing i18n keys to add an "Other" option with a text input:
- Add an "Other" button at the end of each question's options
- When selected, show a `TextInput` using the existing translation keys
- Include the custom text in the response as `"Other: <user text>"`
- State: add `customTexts: Map<number, string>` alongside `selections`

This is additive and improves the non-voice experience too.

---

### Task 8: Add tests

**Voice agent tests** (`packages/happy-voice-agent/test_agent.py`):
- Test `answer_user_question` tool validates answer structure
- Test RPC payload is correctly formatted
- Test error handling (no user connected, timeout)

**App RPC handler tests** (`packages/happy-app/sources/realtime/realtimeClientTools.spec.ts`):
- Test `answerUserQuestion` validates parameters
- Test it finds AskUserQuestion permission request (not other tool types)
- Test it calls `sessionAllow()` + `sync.sendMessage()` with correct format
- Test error cases (no session, no pending question, invalid params)

**Context formatter tests** (new file or extend existing):
- Test `formatAskUserQuestion` output format
- Test single question vs multiple questions
- Test single-select vs multi-select labels

---

## File Change Summary

| File | Change |
|------|--------|
| `packages/happy-voice-agent/agent.py` | Add `lk.chat` handler, `answer_user_question` tool, update system prompt |
| `packages/happy-app/sources/realtime/realtimeClientTools.ts` | Add `answerUserQuestion` handler |
| `packages/happy-app/sources/realtime/LiveKitVoiceSession.tsx` | Register `answerUserQuestion` RPC method |
| `packages/happy-app/sources/realtime/LiveKitVoiceSession.web.tsx` | Register `answerUserQuestion` RPC method |
| `packages/happy-app/sources/realtime/hooks/contextFormatters.ts` | Add `formatAskUserQuestion()` |
| `packages/happy-app/sources/realtime/hooks/voiceHooks.ts` | Detect AskUserQuestion in `onPermissionRequested` |
| `packages/happy-app/sources/components/tools/views/AskUserQuestionView.tsx` | Add "Other" free-text option |
| `packages/happy-voice-agent/test_agent.py` | Add tests for new tool |
| `packages/happy-app/sources/realtime/realtimeClientTools.spec.ts` | Add tests for new handler |

---

## Implementation Order

1. **Tasks 1-2** (context pipeline) — Agent can receive and understand AskUserQuestion
2. **Tasks 3-4** (app RPC) — App can process structured answers from voice agent
3. **Task 5-6** (agent tool + prompt) — Agent can relay answers back
4. **Task 7** (Other option) — General improvement to app UI
5. **Task 8** (tests) — Verify everything works

Tasks 1-2 are independent of tasks 3-4 and can be parallelized.

---

## Risk Considerations

- **`lk.chat` handler safety**: Adding this handler means the agent now receives ALL chat messages. The handler should be lightweight (just adds to context) so this is low risk.
- **Answer format must match**: The formatted response text (`Header: Label1, Label2`) must exactly match what `AskUserQuestionView` produces, since Claude Code parses this response.
- **Race condition**: If user taps the app UI AND the voice agent submits simultaneously, double-submission could occur. Mitigation: the first `sessionAllow()` succeeds, the second fails (permission already approved). The second `sendMessage()` would be a duplicate. Low probability, acceptable.
