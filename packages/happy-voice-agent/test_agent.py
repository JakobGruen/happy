"""Local tests for the Happy voice agent.

These tests verify agent behavior without a running LiveKit server.
All LiveKit runtime dependencies are mocked where needed.
"""

import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock, patch


# ---------------------------------------------------------------------------
# 1. Module imports successfully
# ---------------------------------------------------------------------------

def test_module_imports():
    """agent.py can be imported without errors."""
    import agent  # noqa: F401


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def happy_agent():
    from agent import HappyAgent
    return HappyAgent()


# ---------------------------------------------------------------------------
# 2. HappyAgent instantiates with correct system prompt
# ---------------------------------------------------------------------------

def test_agent_has_system_prompt(happy_agent):
    """HappyAgent stores the SYSTEM_PROMPT as its instructions."""
    from agent import SYSTEM_PROMPT
    assert happy_agent.instructions == SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# 3. _get_user_identity raises ToolError when no participants
# ---------------------------------------------------------------------------

def test_get_user_identity_no_participants(happy_agent):
    """_get_user_identity raises ToolError when the room has no remote participants."""
    from livekit.agents.llm import ToolError

    mock_room = MagicMock()
    mock_room.remote_participants = {}

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        with pytest.raises(ToolError, match="No user connected"):
            happy_agent._get_user_identity()


def test_get_user_identity_returns_first_participant(happy_agent):
    """_get_user_identity returns the first participant identity when present."""
    mock_room = MagicMock()
    mock_room.remote_participants = {"user-abc": MagicMock()}

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        identity = happy_agent._get_user_identity()
        assert identity == "user-abc"


# ---------------------------------------------------------------------------
# 4. process_permission_request validates decision input
# ---------------------------------------------------------------------------

def test_process_permission_invalid_decision(happy_agent):
    """process_permission_request raises ToolError for invalid decision values."""
    from livekit.agents.llm import ToolError

    ctx = MagicMock()
    for bad_value in ("yes", "no", "approve", "", "ALLOW"):
        with pytest.raises(ToolError, match="must be 'allow' or 'deny'"):
            asyncio.run(happy_agent.process_permission_request(ctx, bad_value))


def test_process_permission_valid_decisions(happy_agent):
    """process_permission_request accepts 'allow' and 'deny' past validation."""
    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="ok")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        for decision in ("allow", "deny"):
            result = asyncio.run(happy_agent.process_permission_request(ctx, decision))
            assert result == "ok"


# ---------------------------------------------------------------------------
# 5. Tool methods exist on the agent
# ---------------------------------------------------------------------------

def test_tool_methods_exist(happy_agent):
    """HappyAgent exposes message_claude_code and process_permission_request."""
    assert hasattr(happy_agent, "message_claude_code")
    assert callable(happy_agent.message_claude_code)
    assert hasattr(happy_agent, "process_permission_request")
    assert callable(happy_agent.process_permission_request)


# ---------------------------------------------------------------------------
# 6. System prompt contains key sections
# ---------------------------------------------------------------------------

def test_system_prompt_sections():
    """SYSTEM_PROMPT includes key sections for role, context, and speech rules."""
    from agent import SYSTEM_PROMPT

    assert "# Your Role" in SYSTEM_PROMPT
    assert "# Context Awareness" in SYSTEM_PROMPT
    assert "# Tool Usage Rules" in SYSTEM_PROMPT
    assert "# Speech Rules" in SYSTEM_PROMPT
    assert "# Prompt Formatting" in SYSTEM_PROMPT
    assert "# Mode Switching" in SYSTEM_PROMPT
    assert "# Plan Mode" in SYSTEM_PROMPT
    assert "# Abort / Interrupt" in SYSTEM_PROMPT
    assert "# Slash Commands" in SYSTEM_PROMPT


def test_system_prompt_identity():
    """SYSTEM_PROMPT identifies the assistant as Happy."""
    from agent import SYSTEM_PROMPT
    assert "You are Happy" in SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# 7. Entrypoint and prewarm are defined
# ---------------------------------------------------------------------------

def test_entrypoint_is_defined():
    """Module-level `entrypoint` async function exists."""
    import agent
    assert hasattr(agent, "entrypoint")
    assert callable(agent.entrypoint)


def test_prewarm_is_defined():
    """Module-level `prewarm` function exists."""
    from agent import prewarm
    assert callable(prewarm)


# ---------------------------------------------------------------------------
# 8. message_claude_code RPC works with mocked room
# ---------------------------------------------------------------------------

def test_message_claude_code_sends_rpc(happy_agent):
    """message_claude_code calls perform_rpc with correct method and payload."""
    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="ack")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        result = asyncio.run(happy_agent.message_claude_code(ctx, "fix the tests"))
        assert result == "ack"

        call_kwargs = mock_local.perform_rpc.call_args.kwargs
        assert call_kwargs["method"] == "messageClaudeCode"
        assert '"fix the tests"' in call_kwargs["payload"]
        assert call_kwargs["destination_identity"] == "user-1"


# ---------------------------------------------------------------------------
# 9. process_permission_request mode parameter
# ---------------------------------------------------------------------------

def test_process_permission_invalid_mode(happy_agent):
    """process_permission_request raises ToolError for invalid mode values."""
    from livekit.agents.llm import ToolError

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="ok")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        with pytest.raises(ToolError, match="Mode must be one of"):
            asyncio.run(happy_agent.process_permission_request(ctx, "allow", "badMode"))


def test_process_permission_with_mode(happy_agent):
    """process_permission_request includes mode in RPC payload when provided."""
    import json

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="ok")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        result = asyncio.run(
            happy_agent.process_permission_request(ctx, "allow", "acceptEdits")
        )
        assert result == "ok"

        call_kwargs = mock_local.perform_rpc.call_args.kwargs
        payload = json.loads(call_kwargs["payload"])
        assert payload["decision"] == "allow"
        assert payload["mode"] == "acceptEdits"


def test_process_permission_without_mode_omits_key(happy_agent):
    """process_permission_request omits mode from payload when not provided."""
    import json

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="ok")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        asyncio.run(happy_agent.process_permission_request(ctx, "deny"))

        call_kwargs = mock_local.perform_rpc.call_args.kwargs
        payload = json.loads(call_kwargs["payload"])
        assert payload["decision"] == "deny"
        assert "mode" not in payload


# ---------------------------------------------------------------------------
# 10. answer_single_question tool exists on agent
# ---------------------------------------------------------------------------

def test_answer_single_question_tool_exists(happy_agent):
    """HappyAgent exposes answer_single_question as a callable tool."""
    assert hasattr(happy_agent, "answer_single_question")
    assert callable(happy_agent.answer_single_question)


def test_confirm_question_answers_tool_exists(happy_agent):
    """HappyAgent exposes confirm_question_answers as a callable tool."""
    assert hasattr(happy_agent, "confirm_question_answers")
    assert callable(happy_agent.confirm_question_answers)


def test_reject_question_answers_tool_exists(happy_agent):
    """HappyAgent exposes reject_question_answers as a callable tool."""
    assert hasattr(happy_agent, "reject_question_answers")
    assert callable(happy_agent.reject_question_answers)


# ---------------------------------------------------------------------------
# 11. System prompt includes question answering section
# ---------------------------------------------------------------------------

def test_system_prompt_includes_question_answering_section():
    """SYSTEM_PROMPT includes the Answering Questions from Claude Code section."""
    from agent import SYSTEM_PROMPT
    assert "# Answering Questions from Claude Code" in SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# 12. System prompt references all three question tools and sequential flow
# ---------------------------------------------------------------------------

def test_system_prompt_references_question_tools():
    """SYSTEM_PROMPT mentions all three question tools and ONE AT A TIME flow."""
    from agent import SYSTEM_PROMPT
    assert "answer_single_question" in SYSTEM_PROMPT
    assert "confirm_question_answers" in SYSTEM_PROMPT
    assert "reject_question_answers" in SYSTEM_PROMPT
    assert "ONE AT A TIME" in SYSTEM_PROMPT


# ---------------------------------------------------------------------------
# 13. answer_single_question validates empty selected_labels
# ---------------------------------------------------------------------------

def test_answer_single_question_validates_empty_selected_labels(happy_agent):
    """answer_single_question raises ToolError when selected_labels is empty."""
    from livekit.agents.llm import ToolError

    ctx = MagicMock()

    with pytest.raises(ToolError, match="must be a non-empty list"):
        asyncio.run(happy_agent.answer_single_question(ctx, 0, "Database", []))


# ---------------------------------------------------------------------------
# 14. answer_single_question validates missing header
# ---------------------------------------------------------------------------

def test_answer_single_question_validates_missing_header(happy_agent):
    """answer_single_question raises ToolError when header is empty."""
    from livekit.agents.llm import ToolError

    ctx = MagicMock()

    with pytest.raises(ToolError, match="header is required"):
        asyncio.run(happy_agent.answer_single_question(ctx, 0, "", ["PostgreSQL"]))


# ---------------------------------------------------------------------------
# 15. answer_single_question sends correct RPC
# ---------------------------------------------------------------------------

def test_answer_single_question_sends_correct_rpc(happy_agent):
    """answer_single_question calls perform_rpc with method='answerSingleQuestion' and correct payload."""
    import json

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="next-question")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        result = asyncio.run(
            happy_agent.answer_single_question(ctx, 0, "Database", ["PostgreSQL"])
        )
        assert result == "next-question"

        call_kwargs = mock_local.perform_rpc.call_args.kwargs
        assert call_kwargs["method"] == "answerSingleQuestion"
        assert call_kwargs["destination_identity"] == "user-1"

        payload = json.loads(call_kwargs["payload"])
        assert payload["questionIndex"] == 0
        assert payload["header"] == "Database"
        assert payload["selectedLabels"] == ["PostgreSQL"]


# ---------------------------------------------------------------------------
# 16. answer_single_question raises ToolError on RPC failure
# ---------------------------------------------------------------------------

def test_answer_single_question_raises_tool_error_on_rpc_failure(happy_agent):
    """answer_single_question raises ToolError when perform_rpc fails."""
    from livekit.agents.llm import ToolError

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(side_effect=Exception("RPC timeout"))
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        with pytest.raises(ToolError, match="Failed to submit answer"):
            asyncio.run(
                happy_agent.answer_single_question(ctx, 0, "Database", ["PostgreSQL"])
            )


# ---------------------------------------------------------------------------
# 16b. confirm_question_answers sends correct RPC
# ---------------------------------------------------------------------------

def test_confirm_question_answers_sends_correct_rpc(happy_agent):
    """confirm_question_answers calls perform_rpc with method='confirmQuestionAnswers'."""
    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="confirmed")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        result = asyncio.run(happy_agent.confirm_question_answers(ctx))
        assert result == "confirmed"

        call_kwargs = mock_local.perform_rpc.call_args.kwargs
        assert call_kwargs["method"] == "confirmQuestionAnswers"
        assert call_kwargs["destination_identity"] == "user-1"


# ---------------------------------------------------------------------------
# 16c. confirm_question_answers raises ToolError on RPC failure
# ---------------------------------------------------------------------------

def test_confirm_question_answers_raises_tool_error_on_rpc_failure(happy_agent):
    """confirm_question_answers raises ToolError when perform_rpc fails."""
    from livekit.agents.llm import ToolError

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(side_effect=Exception("RPC timeout"))
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        with pytest.raises(ToolError, match="Failed to confirm answers"):
            asyncio.run(happy_agent.confirm_question_answers(ctx))


# ---------------------------------------------------------------------------
# 16d. reject_question_answers sends correct RPC
# ---------------------------------------------------------------------------

def test_reject_question_answers_sends_correct_rpc(happy_agent):
    """reject_question_answers calls perform_rpc with method='rejectQuestionAnswers'."""
    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="rejected")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        result = asyncio.run(happy_agent.reject_question_answers(ctx))
        assert result == "rejected"

        call_kwargs = mock_local.perform_rpc.call_args.kwargs
        assert call_kwargs["method"] == "rejectQuestionAnswers"
        assert call_kwargs["destination_identity"] == "user-1"


# ---------------------------------------------------------------------------
# 16e. reject_question_answers raises ToolError on RPC failure
# ---------------------------------------------------------------------------

def test_reject_question_answers_raises_tool_error_on_rpc_failure(happy_agent):
    """reject_question_answers raises ToolError when perform_rpc fails."""
    from livekit.agents.llm import ToolError

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(side_effect=Exception("RPC timeout"))
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        with pytest.raises(ToolError, match="Failed to reject answers"):
            asyncio.run(happy_agent.reject_question_answers(ctx))


# ---------------------------------------------------------------------------
# 17. abort_claude_code tool exists on agent
# ---------------------------------------------------------------------------

def test_abort_claude_code_tool_exists(happy_agent):
    """HappyAgent exposes abort_claude_code as a callable tool."""
    assert hasattr(happy_agent, "abort_claude_code")
    assert callable(happy_agent.abort_claude_code)


# ---------------------------------------------------------------------------
# 18. abort_claude_code sends correct RPC
# ---------------------------------------------------------------------------

def test_abort_claude_code_sends_rpc(happy_agent):
    """abort_claude_code calls perform_rpc with method='abortClaudeCode'."""
    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="interrupted")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        result = asyncio.run(happy_agent.abort_claude_code(ctx))
        assert result == "interrupted"

        call_kwargs = mock_local.perform_rpc.call_args.kwargs
        assert call_kwargs["method"] == "abortClaudeCode"
        assert call_kwargs["destination_identity"] == "user-1"


# ---------------------------------------------------------------------------
# 19. abort_claude_code raises ToolError on RPC failure
# ---------------------------------------------------------------------------

def test_abort_claude_code_raises_tool_error_on_failure(happy_agent):
    """abort_claude_code raises ToolError when perform_rpc fails."""
    from livekit.agents.llm import ToolError

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(side_effect=Exception("timeout"))
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        with pytest.raises(ToolError, match="Failed to abort"):
            asyncio.run(happy_agent.abort_claude_code(ctx))


# ---------------------------------------------------------------------------
# 20. run_slash_command tool exists on agent
# ---------------------------------------------------------------------------

def test_run_slash_command_tool_exists(happy_agent):
    """HappyAgent exposes run_slash_command as a callable tool."""
    assert hasattr(happy_agent, "run_slash_command")
    assert callable(happy_agent.run_slash_command)


# ---------------------------------------------------------------------------
# 21. run_slash_command sends correct RPC with / prefix
# ---------------------------------------------------------------------------

def test_run_slash_command_sends_rpc(happy_agent):
    """run_slash_command calls messageClaudeCode RPC with /<command> message."""
    import json

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="ack")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        result = asyncio.run(happy_agent.run_slash_command(ctx, "commit"))
        assert result == "ack"

        call_kwargs = mock_local.perform_rpc.call_args.kwargs
        assert call_kwargs["method"] == "messageClaudeCode"
        payload = json.loads(call_kwargs["payload"])
        assert payload["message"] == "/commit"


# ---------------------------------------------------------------------------
# 22. run_slash_command strips leading slash from input
# ---------------------------------------------------------------------------

def test_run_slash_command_strips_leading_slash(happy_agent):
    """run_slash_command strips a leading / if the user accidentally includes it."""
    import json

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="ack")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        asyncio.run(happy_agent.run_slash_command(ctx, "/review-pr"))

        call_kwargs = mock_local.perform_rpc.call_args.kwargs
        payload = json.loads(call_kwargs["payload"])
        assert payload["message"] == "/review-pr"


# ---------------------------------------------------------------------------
# 23. run_slash_command validates empty command
# ---------------------------------------------------------------------------

def test_run_slash_command_validates_empty_command(happy_agent):
    """run_slash_command raises ToolError for empty command."""
    from livekit.agents.llm import ToolError

    ctx = MagicMock()

    with pytest.raises(ToolError, match="Command name cannot be empty"):
        asyncio.run(happy_agent.run_slash_command(ctx, ""))

    with pytest.raises(ToolError, match="Command name cannot be empty"):
        asyncio.run(happy_agent.run_slash_command(ctx, "  "))


# ---------------------------------------------------------------------------
# 24. run_slash_command with string args
# ---------------------------------------------------------------------------

def test_run_slash_command_with_string_args(happy_agent):
    """run_slash_command appends string args directly after the command."""
    import json

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="ack")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        result = asyncio.run(happy_agent.run_slash_command(ctx, "commit", "fix login bug"))
        assert result == "ack"

        call_kwargs = mock_local.perform_rpc.call_args.kwargs
        payload = json.loads(call_kwargs["payload"])
        assert payload["message"] == "/commit fix login bug"


# ---------------------------------------------------------------------------
# 25. run_slash_command with list args
# ---------------------------------------------------------------------------

def test_run_slash_command_with_list_args(happy_agent):
    """run_slash_command quotes each list element and joins them."""
    import json

    mock_room = MagicMock()
    mock_room.remote_participants = {"user-1": MagicMock()}
    mock_local = MagicMock()
    mock_local.perform_rpc = AsyncMock(return_value="ack")
    mock_room.local_participant = mock_local

    mock_job_ctx = MagicMock()
    mock_job_ctx.room = mock_room

    ctx = MagicMock()

    with patch("agent.get_job_context", return_value=mock_job_ctx):
        result = asyncio.run(
            happy_agent.run_slash_command(ctx, "commit", ["fix login bug", "update readme"])
        )
        assert result == "ack"

        call_kwargs = mock_local.perform_rpc.call_args.kwargs
        payload = json.loads(call_kwargs["payload"])
        assert payload["message"] == '/commit "fix login bug" "update readme"'
