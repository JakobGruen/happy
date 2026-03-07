"""Tests for pipecat_tools.py — tool definitions and name mappings.

Verifies:
  - get_tools() returns a ToolsSchema with 8 FunctionSchema definitions
  - Each tool has name, description, properties, and required fields
  - Input schemas declare the right required/optional properties
  - TOOL_NAME_TO_CLIENT and CLIENT_TO_TOOL_NAME are consistent inverses
"""

import pytest

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema

from pipecat_tools import CLIENT_TO_TOOL_NAME, TOOL_NAME_TO_CLIENT, get_tools


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

EXPECTED_TOOL_NAMES = [
    "message_claude_code",
    "process_permission_request",
    "abort_claude_code",
    "switch_mode",
    "run_slash_command",
    "answer_single_question",
    "confirm_question_answers",
    "reject_question_answers",
]


def _tool_by_name(name: str) -> FunctionSchema:
    """Look up a single tool definition by name."""
    tools = get_tools()
    matches = [t for t in tools.standard_tools if t.name == name]
    assert len(matches) == 1, f"Expected exactly 1 tool named {name!r}, got {len(matches)}"
    return matches[0]


# ---------------------------------------------------------------------------
# 1. get_tools returns a ToolsSchema with exactly 8 tools
# ---------------------------------------------------------------------------

def test_get_tools_returns_eight_tools():
    """get_tools() returns a ToolsSchema with exactly 8 tool definitions."""
    tools = get_tools()
    assert isinstance(tools, ToolsSchema)
    assert len(tools.standard_tools) == 8


# ---------------------------------------------------------------------------
# 2. All 8 expected tool names are present
# ---------------------------------------------------------------------------

def test_all_expected_tool_names_present():
    """Every expected tool name appears in the ToolsSchema."""
    tools = get_tools()
    actual_names = {t.name for t in tools.standard_tools}
    for name in EXPECTED_TOOL_NAMES:
        assert name in actual_names, f"Missing tool: {name}"


# ---------------------------------------------------------------------------
# 3. Each tool has name, description, properties, and required
# ---------------------------------------------------------------------------

def test_every_tool_has_required_fields():
    """Each FunctionSchema has name, description, properties, and required."""
    for tool in get_tools().standard_tools:
        assert isinstance(tool, FunctionSchema)
        assert isinstance(tool.name, str) and len(tool.name) > 0
        assert isinstance(tool.description, str) and len(tool.description) > 0
        assert isinstance(tool.properties, dict)
        assert isinstance(tool.required, list)


# ---------------------------------------------------------------------------
# 4. message_claude_code requires 'message' (string)
# ---------------------------------------------------------------------------

def test_message_claude_code_schema():
    """message_claude_code requires a 'message' property of type string."""
    tool = _tool_by_name("message_claude_code")

    assert "message" in tool.properties
    assert tool.properties["message"]["type"] == "string"
    assert "message" in tool.required


# ---------------------------------------------------------------------------
# 5. process_permission_request requires 'decision' (enum), optional 'mode'
# ---------------------------------------------------------------------------

def test_process_permission_request_schema():
    """process_permission_request requires 'decision' (allow/deny), 'mode' is optional."""
    tool = _tool_by_name("process_permission_request")

    # decision is required, string enum
    assert "decision" in tool.properties
    assert tool.properties["decision"]["type"] == "string"
    assert set(tool.properties["decision"]["enum"]) == {"allow", "deny"}
    assert "decision" in tool.required

    # mode is present but NOT required
    assert "mode" in tool.properties
    assert tool.properties["mode"]["type"] == "string"
    assert "mode" not in tool.required


# ---------------------------------------------------------------------------
# 6. answer_single_question requires question_index, header, selected_labels
# ---------------------------------------------------------------------------

def test_answer_single_question_schema():
    """answer_single_question requires question_index (int), header (str), selected_labels (array of str)."""
    tool = _tool_by_name("answer_single_question")

    assert tool.properties["question_index"]["type"] == "integer"
    assert tool.properties["header"]["type"] == "string"
    assert tool.properties["selected_labels"]["type"] == "array"
    assert tool.properties["selected_labels"]["items"]["type"] == "string"

    assert set(tool.required) == {"question_index", "header", "selected_labels"}


# ---------------------------------------------------------------------------
# 7. TOOL_NAME_TO_CLIENT maps all 8 tools correctly
# ---------------------------------------------------------------------------

def test_tool_name_to_client_maps_all_tools():
    """TOOL_NAME_TO_CLIENT has an entry for every tool returned by get_tools()."""
    tool_names = {t.name for t in get_tools().standard_tools}
    assert set(TOOL_NAME_TO_CLIENT.keys()) == tool_names


def test_tool_name_to_client_key_mappings():
    """Spot-check several key snake_case -> camelCase mappings."""
    assert TOOL_NAME_TO_CLIENT["message_claude_code"] == "messageClaudeCode"
    assert TOOL_NAME_TO_CLIENT["process_permission_request"] == "processPermissionRequest"
    assert TOOL_NAME_TO_CLIENT["abort_claude_code"] == "abortClaudeCode"
    assert TOOL_NAME_TO_CLIENT["switch_mode"] == "switchMode"
    assert TOOL_NAME_TO_CLIENT["run_slash_command"] == "runSlashCommand"
    assert TOOL_NAME_TO_CLIENT["answer_single_question"] == "answerSingleQuestion"
    assert TOOL_NAME_TO_CLIENT["confirm_question_answers"] == "confirmQuestionAnswers"
    assert TOOL_NAME_TO_CLIENT["reject_question_answers"] == "rejectQuestionAnswers"


# ---------------------------------------------------------------------------
# 8. CLIENT_TO_TOOL_NAME is the exact reverse of TOOL_NAME_TO_CLIENT
# ---------------------------------------------------------------------------

def test_client_to_tool_name_is_reverse():
    """CLIENT_TO_TOOL_NAME is the exact inverse of TOOL_NAME_TO_CLIENT."""
    assert len(CLIENT_TO_TOOL_NAME) == len(TOOL_NAME_TO_CLIENT)
    for snake, camel in TOOL_NAME_TO_CLIENT.items():
        assert CLIENT_TO_TOOL_NAME[camel] == snake


# ---------------------------------------------------------------------------
# 9. get_tools returns fresh ToolsSchema each call (no shared mutable state)
# ---------------------------------------------------------------------------

def test_get_tools_returns_fresh_instance():
    """Each call to get_tools() returns a new ToolsSchema."""
    a = get_tools()
    b = get_tools()
    assert a is not b


# ---------------------------------------------------------------------------
# 10. Tools without required params have empty properties
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("tool_name", [
    "abort_claude_code",
    "confirm_question_answers",
    "reject_question_answers",
])
def test_no_arg_tools_have_empty_properties(tool_name):
    """Tools that take no arguments have empty properties and required lists."""
    tool = _tool_by_name(tool_name)
    assert tool.properties == {}
    assert tool.required == []


# ---------------------------------------------------------------------------
# 11. switch_mode requires 'mode' with correct enum values
# ---------------------------------------------------------------------------

def test_switch_mode_schema():
    """switch_mode requires 'mode' with the 4 valid permission mode values."""
    tool = _tool_by_name("switch_mode")

    assert "mode" in tool.properties
    assert tool.properties["mode"]["type"] == "string"
    assert set(tool.properties["mode"]["enum"]) == {"default", "acceptEdits", "bypassPermissions", "plan"}
    assert tool.required == ["mode"]


# ---------------------------------------------------------------------------
# 12. run_slash_command requires 'command', optional 'args'
# ---------------------------------------------------------------------------

def test_run_slash_command_schema():
    """run_slash_command requires 'command' (str), has optional 'args' (str)."""
    tool = _tool_by_name("run_slash_command")

    assert tool.properties["command"]["type"] == "string"
    assert "command" in tool.required

    assert "args" in tool.properties
    assert tool.properties["args"]["type"] == "string"
    assert "args" not in tool.required
