# Enforce AskUserQuestion & ExitPlanMode Stop Hook — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A global Stop hook that blocks CC from finishing a turn when it asks questions or proposes plans in plain text instead of using `AskUserQuestion` / `ExitPlanMode`.

**Architecture:** Single Python script at `~/.claude/hooks/enforce-ask-tool.py`. Reads last assistant message from JSONL transcript, applies cheap regex pre-filter, calls Haiku for semantic classification only when needed. Registered globally in `~/.claude/settings.json`.

**Tech Stack:** Python 3.13, `anthropic` SDK, `claude-haiku-4-5-20251001`

---

### Task 1: Install Dependencies

**Step 1: Install anthropic SDK globally**

```bash
pip install anthropic
```

**Step 2: Verify installation**

```bash
python3 -c "import anthropic; print(anthropic.__version__)"
```

Expected: version number printed (e.g. `0.52.0`)

**Step 3: Create hooks directory**

```bash
mkdir -p ~/.claude/hooks
```

---

### Task 2: Write the Hook Script

**Files:**
- Create: `~/.claude/hooks/enforce-ask-tool.py`

**Step 1: Write the script**

```python
#!/usr/bin/env python3
"""Stop hook: enforce AskUserQuestion and ExitPlanMode tool usage.

Blocks CC from finishing a turn when it asks questions or proposes plans
in plain text instead of using the proper tools.
"""

import json
import os
import re
import sys


HAIKU_MODEL = "claude-haiku-4-5-20251001"

SYSTEM_PROMPT = """\
You classify whether an AI coding assistant's final response requires a structured tool \
instead of plain text. Respond with exactly one word: NEEDS_ASK_TOOL, NEEDS_PLAN_TOOL, or OK.

NEEDS_ASK_TOOL — The response's main purpose is to ask the user to make a decision, \
choose between options, provide information, or confirm something before the assistant \
can proceed. These should use the AskUserQuestion tool for structured interaction.

NEEDS_PLAN_TOOL — The response presents a structured multi-step plan, implementation \
approach, or architectural proposal for the user to review or approve. These should use \
EnterPlanMode + ExitPlanMode for proper plan presentation.

OK — The response is informational, contains rhetorical questions, shows code examples, \
or simply communicates results. No tool needed.

Rules:
- Ignore question marks inside code blocks, URLs, or regex patterns.
- A short "should I proceed?" or "does that look right?" tacked onto otherwise \
informational content is OK.
- Only flag NEEDS_ASK_TOOL when the MAIN PURPOSE is soliciting user input.
- Only flag NEEDS_PLAN_TOOL when there is a clear numbered/bulleted multi-step plan \
or structured approach being proposed for approval."""

BLOCK_MESSAGES = {
    "NEEDS_ASK_TOOL": (
        "You asked the user a question in plain text. Use the AskUserQuestion tool "
        "instead so the user gets a structured, actionable UI.\n\n"
        "AskUserQuestion tool reference:\n\n"
        "STRUCTURE:\n"
        "- Ask 1-4 questions in a single call (batch related questions together)\n"
        "- Each question needs: question (clear text ending with ?), "
        "header (short chip label, max 12 chars, e.g. 'Approach', 'Library', 'Scope'), "
        "and 2-4 options\n"
        "- Each option has: label (1-5 words), description (explain trade-offs/implications)\n"
        "- Set multiSelect: true when choices are NOT mutually exclusive "
        "(e.g. 'Which features to enable?')\n"
        "- Users always get an 'Other' option for free text automatically — don't add one\n"
        "- Question texts must be unique; option labels must be unique within each question\n"
        "- Put your recommended option first and add '(Recommended)' to its label\n\n"
        "PREVIEW FIELD (optional, powerful):\n"
        "- Each option can have an optional 'preview' string field\n"
        "- When any option has a preview, the UI switches to a side-by-side layout "
        "(options left, preview right) — the preview updates as the user focuses each option\n"
        "- Preview accepts two content formats:\n"
        "  * Markdown/plain text (default): code blocks, ASCII wireframes, config examples, "
        "architecture sketches — no validation, any string works\n"
        "  * HTML fragments: self-contained <div>/<pre> with inline styles only "
        "(no <script>, <style>, or full document tags)\n"
        "- Previews only work with single-select questions (not multiSelect)\n"
        "- Use preview when comparing: code approaches, UI layouts, config options, "
        "architecture alternatives, API designs\n"
        "- Not every option needs a preview — include only where visual comparison helps\n\n"
        "ANNOTATIONS (response):\n"
        "- User responses come back with per-question annotations keyed by question text\n"
        "- Each annotation can include: preview (content of selected option's preview), "
        "notes (free-text the user typed alongside their selection)\n\n"
        "Rewrite your response to use AskUserQuestion with well-structured options. "
        "Think about what information helps the user decide — use descriptions for "
        "trade-offs and preview for visual/code comparisons."
    ),
    "NEEDS_PLAN_TOOL": (
        "You presented a plan or approach in plain text. Enter plan mode with "
        "EnterPlanMode first, then present your plan via ExitPlanMode. This gives "
        "the user a proper plan review UI."
    ),
}

# Pre-filter patterns — cheap check before calling LLM
QUESTION_PATTERN = re.compile(r"\?\s*$", re.MULTILINE)
PLAN_PATTERNS = re.compile(
    r"(?:^|\n)\s*(?:\d+[\.\)]\s|[-*]\s.*(?:first|then|next|finally|step))",
    re.IGNORECASE | re.MULTILINE,
)

TOOL_NAMES_THAT_SATISFY = {"AskUserQuestion", "ExitPlanMode", "exit_plan_mode", "EnterPlanMode"}


def extract_last_assistant_turn(transcript_path: str) -> tuple[str, set[str]]:
    """Extract text and tool names from the last assistant message in JSONL transcript.

    Returns (text_content, set_of_tool_names_used).
    """
    text_parts = []
    tool_names = set()

    last_assistant_lines = []
    with open(transcript_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("role") == "assistant":
                last_assistant_lines.append(entry)
            else:
                # Reset — we only want the LAST contiguous assistant block
                if last_assistant_lines:
                    last_assistant_lines = []

    # If no reset happened at the end, last_assistant_lines has the final block
    # But we also need to handle the case where assistant is the very last entry
    # Re-read: collect all, take trailing assistant entries
    all_entries = []
    with open(transcript_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                all_entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    # Walk backwards to find contiguous assistant entries at the end
    trailing = []
    for entry in reversed(all_entries):
        if entry.get("role") == "assistant":
            trailing.append(entry)
        else:
            break
    trailing.reverse()

    for entry in trailing:
        content = entry.get("message", {}).get("content", [])
        if isinstance(content, str):
            text_parts.append(content)
            continue
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
                elif block.get("type") == "tool_use":
                    tool_names.add(block.get("name", ""))

    return "\n".join(text_parts), tool_names


def needs_llm_check(text: str) -> bool:
    """Cheap pre-filter: does the text contain question marks or plan-like patterns?"""
    # Strip code blocks before checking
    text_no_code = re.sub(r"```[\s\S]*?```", "", text)
    text_no_code = re.sub(r"`[^`]+`", "", text_no_code)

    if QUESTION_PATTERN.search(text_no_code):
        return True
    if PLAN_PATTERNS.search(text_no_code):
        return True
    return False


def classify_with_llm(text: str) -> str:
    """Call Haiku to classify the assistant's response. Returns verdict string."""
    import anthropic

    client = anthropic.Anthropic()
    response = client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=10,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": text}],
    )
    verdict = response.content[0].text.strip().upper()
    # Normalize: accept partial matches
    if "NEEDS_ASK" in verdict:
        return "NEEDS_ASK_TOOL"
    if "NEEDS_PLAN" in verdict:
        return "NEEDS_PLAN_TOOL"
    return "OK"


def main():
    try:
        hook_input = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        json.dump({}, sys.stdout)
        return

    transcript_path = hook_input.get("transcript_path", "")
    if not transcript_path or not os.path.exists(transcript_path):
        json.dump({}, sys.stdout)
        return

    text, tools_used = extract_last_assistant_turn(transcript_path)

    if not text.strip():
        json.dump({}, sys.stdout)
        return

    # If the relevant tools were already used, no need to check
    if tools_used & TOOL_NAMES_THAT_SATISFY:
        json.dump({}, sys.stdout)
        return

    # Cheap pre-filter
    if not needs_llm_check(text):
        json.dump({}, sys.stdout)
        return

    # LLM classification
    try:
        verdict = classify_with_llm(text)
    except Exception as e:
        print(f"enforce-ask-tool: LLM call failed: {e}", file=sys.stderr)
        json.dump({}, sys.stdout)
        return

    if verdict in BLOCK_MESSAGES:
        json.dump({"decision": "block", "reason": BLOCK_MESSAGES[verdict]}, sys.stdout)
    else:
        json.dump({}, sys.stdout)


if __name__ == "__main__":
    main()
```

**Step 2: Make executable**

```bash
chmod +x ~/.claude/hooks/enforce-ask-tool.py
```

---

### Task 3: Register the Hook in settings.json

**Files:**
- Modify: `~/.claude/settings.json` (add `hooks` key at top level)

**Step 1: Add the hooks configuration**

Add a `"hooks"` key to the existing settings.json (after `"mcpServers"` or anywhere at root level):

```json
"hooks": {
  "Stop": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "python3 ~/.claude/hooks/enforce-ask-tool.py",
          "timeout": 10000
        }
      ]
    }
  ]
}
```

**Step 2: Verify JSON is valid**

```bash
python3 -c "import json; json.load(open(os.path.expanduser('~/.claude/settings.json'))); print('OK')"
```

Or simply:

```bash
python3 -c "import json, os; json.load(open(os.path.expanduser('~/.claude/settings.json'))); print('Valid JSON')"
```

---

### Task 4: Manual Smoke Test

**Step 1: Test the pre-filter (no LLM call)**

Create a mock input with no questions:

```bash
echo '{"transcript_path": "/tmp/test-transcript.jsonl"}' > /tmp/test-hook-input.json

# Create a transcript with informational response (no question marks)
echo '{"role": "assistant", "message": {"content": [{"type": "text", "text": "I have completed the refactoring. All tests pass."}]}}' > /tmp/test-transcript.jsonl

python3 ~/.claude/hooks/enforce-ask-tool.py < /tmp/test-hook-input.json
```

Expected: `{}` (allow)

**Step 2: Test the LLM path (question without tool)**

```bash
echo '{"role": "assistant", "message": {"content": [{"type": "text", "text": "Which approach would you prefer?\n\n1. Use a database migration\n2. Use a config file\n3. Hardcode the values\n\nLet me know which one you want to go with."}]}}' > /tmp/test-transcript.jsonl

python3 ~/.claude/hooks/enforce-ask-tool.py < /tmp/test-hook-input.json
```

Expected: `{"decision": "block", "reason": "You asked the user a question..."}`

**Step 3: Test the bypass (AskUserQuestion tool used)**

```bash
echo '{"role": "assistant", "message": {"content": [{"type": "text", "text": "Let me ask you about the approach."}, {"type": "tool_use", "id": "toolu_123", "name": "AskUserQuestion", "input": {}}]}}' > /tmp/test-transcript.jsonl

python3 ~/.claude/hooks/enforce-ask-tool.py < /tmp/test-hook-input.json
```

Expected: `{}` (allow — tool was used)

**Step 4: Test plan detection**

```bash
echo '{"role": "assistant", "message": {"content": [{"type": "text", "text": "Here is my plan:\n\n1. First, refactor the database layer\n2. Then, update the API endpoints\n3. Next, write integration tests\n4. Finally, update the documentation\n\nDoes this approach work for you?"}]}}' > /tmp/test-transcript.jsonl

python3 ~/.claude/hooks/enforce-ask-tool.py < /tmp/test-hook-input.json
```

Expected: `{"decision": "block", "reason": "You presented a plan..."}`

**Step 5: Clean up test files**

```bash
rm /tmp/test-hook-input.json /tmp/test-transcript.jsonl
```

---

### Task 5: Commit

```bash
git add docs/plans/2026-03-14-enforce-tools-stop-hook-design.md docs/plans/2026-03-14-enforce-tools-stop-hook.md
git commit -m "docs: add design + implementation plan for enforce-tools stop hook"
```

Note: The hook script itself lives in `~/.claude/hooks/` (outside the repo), so it's not committed to git. The design doc and this plan are committed for reference.
