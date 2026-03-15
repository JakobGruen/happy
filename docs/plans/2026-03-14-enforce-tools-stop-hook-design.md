# Enforce AskUserQuestion & ExitPlanMode — Stop Hook Design

**Date**: 2026-03-14
**Status**: Approved

## Problem

Claude Code often asks questions or proposes plans in plain text instead of using the proper tools (`AskUserQuestion`, `ExitPlanMode`). This bypasses the structured UI (permission sheets, plan mode) and degrades the mobile experience — the user gets a wall of text instead of actionable buttons.

## Solution

A global Stop hook (`~/.claude/hooks/enforce-ask-tool.py`) that:
1. Fires when the main agent finishes a turn
2. Extracts only the **last assistant message text** from the transcript
3. Applies a cheap pre-filter (skip LLM if no indicators found)
4. Calls **Haiku** (`claude-haiku-4-5-20251001`) for semantic classification
5. Blocks the turn with corrective instructions if a tool should have been used

## Three-Way Classification

| Verdict | What CC did wrong | Corrective instruction |
|---|---|---|
| `NEEDS_ASK_TOOL` | Asked a question, presented choices, or requested confirmation in plain text | Rich guidance on AskUserQuestion capabilities (1-4 questions, single/multi select, 2-4 options with labels+descriptions, preview support, recommended option pattern) |
| `NEEDS_PLAN_TOOL` | Presented a structured multi-step plan or approach in text (even outside plan mode) | "Enter plan mode with EnterPlanMode, then present your plan via ExitPlanMode." |
| `OK` | Rhetorical questions, informational content, code examples, no user input needed | Allow — no action. |

### Classification Nuance

- **Quick confirmation** ("should I use approach A or B?") → `NEEDS_ASK_TOOL`
- **Multi-step plan** ("Here's my plan: 1. First we... 2. Then... 3. Finally...") → `NEEDS_PLAN_TOOL`
- **Rhetorical** ("does that make sense?", "as you can see...") → `OK`
- **Code with `?`** (ternary operators, URL params) → `OK`

## Architecture

```
CC finishes turn
  → Stop hook fires
  → Python reads stdin JSON → gets transcript_path
  → Reads JSONL transcript → extracts LAST assistant message text blocks only
  → Pre-filter:
      No "?" AND no plan indicators (numbered lists, "plan", "approach", "steps")
        → return {} (allow, ~50ms)
      "?" or plan indicators found
        → Check if AskUserQuestion or ExitPlanMode tool_use exists in this turn
          → If yes → return {} (allow, ~50ms)
          → If no → call Haiku
  → Haiku returns NEEDS_ASK_TOOL / NEEDS_PLAN_TOOL / OK
      → OK → return {}
      → NEEDS_* → return {"decision": "block", "reason": "..."}
```

## Hook Registration

Location: `~/.claude/settings.json` (global, all projects)

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [{
          "type": "command",
          "command": "python3 ~/.claude/hooks/enforce-ask-tool.py",
          "timeout": 10000
        }]
      }
    ]
  }
}
```

**Scope**: Main agent only (Stop, not SubagentStop). Subagents communicate back to the orchestrator via text, not tools.

## LLM Evaluation

**Model**: `claude-haiku-4-5-20251001` (fast, cheap)

**Input**: Only the last assistant message text (typically 100-500 tokens). No prior context, no tool inputs/outputs.

**System prompt** (concise, focused):
```
You classify whether an AI coding assistant's final response requires a structured tool
instead of plain text. Respond with exactly one word.

NEEDS_ASK_TOOL — The response asks the user to make a decision, choose between options,
provide information, or confirm something before the assistant can proceed. These should
use the AskUserQuestion tool for structured interaction.

NEEDS_PLAN_TOOL — The response presents a structured multi-step plan, implementation
approach, or architectural proposal for the user to review/approve. These should use
EnterPlanMode + ExitPlanMode for proper plan presentation.

OK — The response is informational, contains rhetorical questions, shows code examples
with question marks, or simply communicates results. No tool needed.

Ignore question marks inside code blocks, URLs, or regex patterns.
A short "should I proceed?" or "does that look right?" at the end of otherwise
informational content is OK — only flag when the MAIN PURPOSE of the response is
to solicit user input or present a plan for approval.
```

## Cost & Latency

| Scenario | LLM call? | Added latency | Frequency |
|---|---|---|---|
| No indicators in text | No | ~50ms | ~60% of turns |
| Indicators + tool already used | No | ~50ms | ~15% of turns |
| Indicators + Haiku → OK | Yes | ~0.5-1.5s | ~20% of turns |
| Indicators + Haiku → block | Yes | ~0.5-1.5s | ~5% of turns |

Estimated cost: ~$0.0005 per Haiku call.

## Error Handling

- **No transcript file** → allow (graceful degradation)
- **Transcript parse error** → allow
- **API key missing** → allow + stderr warning
- **API call fails** → allow (never block on hook infrastructure errors)
- **Timeout** → 10s limit, auto-allows on timeout

## Dependencies

- Python 3.12+ (already available)
- `anthropic` Python package (`pip install anthropic` or `uv pip install anthropic`)
- `ANTHROPIC_API_KEY` env var (already set for Claude Code usage)

## Files

| File | Purpose |
|---|---|
| `~/.claude/hooks/enforce-ask-tool.py` | Hook script (single file, ~100 lines) |
| `~/.claude/settings.json` | Hook registration (add to existing) |

## Future Considerations

- Could add a `--dry-run` mode that logs but doesn't block (for tuning)
- Could cache recent verdicts to avoid re-evaluating identical text
- If false positive rate is too high, tighten the system prompt or add an allowlist
