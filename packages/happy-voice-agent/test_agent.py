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
    """SYSTEM_PROMPT includes spoken-output-rules and prompt-engineering-rules."""
    from agent import SYSTEM_PROMPT

    assert "<spoken-output-rules>" in SYSTEM_PROMPT
    assert "</spoken-output-rules>" in SYSTEM_PROMPT
    assert "<prompt-engineering-rules>" in SYSTEM_PROMPT
    assert "</prompt-engineering-rules>" in SYSTEM_PROMPT


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
