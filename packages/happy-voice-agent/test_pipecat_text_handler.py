"""Tests for pipecat_text_handler.py — ClientMessageHandler FrameProcessor.

Verifies:
  - Non-RTVI frames pass through unchanged
  - happy.context adds LLM context silently (no speech trigger)
  - happy.chat adds LLM context AND triggers speech
  - happy.trigger dispatches turn_complete and progress_update correctly
  - Edge cases: invalid JSON, empty text, _trigger_speech mechanics
"""

import asyncio
import json
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Mock pipecat modules before importing the handler
# ---------------------------------------------------------------------------

# Create mock frame classes
_mock_Frame = type("Frame", (), {})
_mock_LLMMessagesAppendFrame = type("LLMMessagesAppendFrame", (), {
    "__init__": lambda self, messages=None: setattr(self, "messages", messages),
})
_mock_LLMSetToolsFrame = type("LLMSetToolsFrame", (), {})
_mock_LLMRunFrame = type("LLMRunFrame", (), {
    "__init__": lambda self: None,
})
_mock_LLMFullResponseEndFrame = type("LLMFullResponseEndFrame", (), {})

# Create the mock FrameDirection enum
_mock_FrameDirection = MagicMock()
_mock_FrameDirection.DOWNSTREAM = "downstream"
_mock_FrameDirection.UPSTREAM = "upstream"

# Create the mock FrameProcessor base class
class _MockFrameProcessor:
    def __init__(self, **kwargs):
        pass

    async def process_frame(self, frame, direction):
        pass

# Create the mock RTVIClientMessageFrame
class _MockRTVIClientMessageFrame:
    def __init__(self, type_val="", data=None):
        self.type = type_val
        self.data = data or {}

# Wire up the mock module hierarchy
_frames_mod = MagicMock()
_frames_mod.Frame = _mock_Frame
_frames_mod.LLMMessagesAppendFrame = _mock_LLMMessagesAppendFrame
_frames_mod.LLMSetToolsFrame = _mock_LLMSetToolsFrame
_frames_mod.LLMRunFrame = _mock_LLMRunFrame
_frames_mod.LLMFullResponseEndFrame = _mock_LLMFullResponseEndFrame

_fp_mod = MagicMock()
_fp_mod.FrameDirection = _mock_FrameDirection
_fp_mod.FrameProcessor = _MockFrameProcessor

_rtvi_mod = MagicMock()
_rtvi_mod.RTVIClientMessageFrame = _MockRTVIClientMessageFrame

sys.modules["pipecat"] = MagicMock()
sys.modules["pipecat.frames"] = MagicMock()
sys.modules["pipecat.frames.frames"] = _frames_mod
sys.modules["pipecat.processors"] = MagicMock()
sys.modules["pipecat.processors.frame_processor"] = _fp_mod
sys.modules["pipecat.processors.frameworks"] = MagicMock()
sys.modules["pipecat.processors.frameworks.rtvi"] = _rtvi_mod

from pipecat_text_handler import ClientMessageHandler


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def handler():
    """Create a ClientMessageHandler with mocked push_frame and pipeline task."""
    h = ClientMessageHandler()
    h.push_frame = AsyncMock()
    mock_task = MagicMock()
    mock_task.queue_frames = AsyncMock()
    h.set_pipeline_task(mock_task)
    return h


def _make_rtvi_frame(msg_type: str, data: dict | str) -> _MockRTVIClientMessageFrame:
    """Create a mock RTVIClientMessageFrame with the given type and data."""
    return _MockRTVIClientMessageFrame(type_val=msg_type, data=data)


# ---------------------------------------------------------------------------
# 1. Non-RTVIClientMessageFrame frames pass through unchanged
# ---------------------------------------------------------------------------

def test_non_rtvi_frame_passes_through(handler):
    """Frames that are not RTVIClientMessageFrame are pushed through unchanged."""
    plain_frame = MagicMock(spec=[])  # not an instance of RTVIClientMessageFrame
    direction = _mock_FrameDirection.DOWNSTREAM

    asyncio.run(handler.process_frame(plain_frame, direction))

    handler.push_frame.assert_awaited_once_with(plain_frame, direction)


# ---------------------------------------------------------------------------
# 2. happy.context pushes LLMMessagesAppendFrame, does NOT trigger speech
# ---------------------------------------------------------------------------

def test_happy_context_pushes_message_no_speech(handler):
    """happy.context adds context to LLM silently — no speech triggered."""
    frame = _make_rtvi_frame("happy.context", {"text": "Session started with project foo"})
    direction = _mock_FrameDirection.DOWNSTREAM

    asyncio.run(handler.process_frame(frame, direction))

    # Should push exactly one frame (the LLMMessagesAppendFrame)
    assert handler.push_frame.await_count == 1
    pushed_frame = handler.push_frame.call_args_list[0][0][0]
    assert isinstance(pushed_frame, _mock_LLMMessagesAppendFrame)
    assert pushed_frame.messages[0]["role"] == "user"
    assert "Session started with project foo" in pushed_frame.messages[0]["content"]

    # Pipeline task should NOT have queue_frames called (no speech trigger)
    handler._pipeline_task.queue_frames.assert_not_awaited()


# ---------------------------------------------------------------------------
# 3. happy.chat pushes LLMMessagesAppendFrame AND triggers speech
# ---------------------------------------------------------------------------

def test_happy_chat_pushes_message_and_triggers_speech(handler):
    """happy.chat adds context AND triggers proactive speech via _trigger_speech."""
    frame = _make_rtvi_frame("happy.chat", {"text": "Tell me about the build errors"})
    direction = _mock_FrameDirection.DOWNSTREAM

    asyncio.run(handler.process_frame(frame, direction))

    # Should push the LLMMessagesAppendFrame
    assert handler.push_frame.await_count >= 1
    pushed_frame = handler.push_frame.call_args_list[0][0][0]
    assert isinstance(pushed_frame, _mock_LLMMessagesAppendFrame)
    assert "Tell me about the build errors" in pushed_frame.messages[0]["content"]

    # Pipeline task should have queue_frames called (speech triggered)
    handler._pipeline_task.queue_frames.assert_awaited_once()
    queued = handler._pipeline_task.queue_frames.call_args[0][0]
    assert len(queued) == 1
    assert isinstance(queued[0], _mock_LLMRunFrame)


# ---------------------------------------------------------------------------
# 4. happy.trigger turn_complete pushes summary message AND triggers speech
# ---------------------------------------------------------------------------

def test_happy_trigger_turn_complete(handler):
    """happy.trigger with type=turn_complete pushes a summary prompt and triggers speech."""
    trigger_data = json.dumps({"type": "turn_complete"})
    frame = _make_rtvi_frame("happy.trigger", {"text": trigger_data})
    direction = _mock_FrameDirection.DOWNSTREAM

    asyncio.run(handler.process_frame(frame, direction))

    # Should push one LLMMessagesAppendFrame with the turn_complete prompt
    assert handler.push_frame.await_count >= 1
    pushed_frame = handler.push_frame.call_args_list[0][0][0]
    assert isinstance(pushed_frame, _mock_LLMMessagesAppendFrame)
    assert "Claude Code just finished" in pushed_frame.messages[0]["content"]

    # Speech should be triggered
    handler._pipeline_task.queue_frames.assert_awaited_once()


# ---------------------------------------------------------------------------
# 5. happy.trigger progress_update includes summary AND triggers speech
# ---------------------------------------------------------------------------

def test_happy_trigger_progress_update(handler):
    """happy.trigger with type=progress_update includes the summary text and triggers speech."""
    trigger_data = json.dumps({"type": "progress_update", "summary": "Running tests"})
    frame = _make_rtvi_frame("happy.trigger", {"text": trigger_data})
    direction = _mock_FrameDirection.DOWNSTREAM

    asyncio.run(handler.process_frame(frame, direction))

    # Should push one LLMMessagesAppendFrame with the progress update
    assert handler.push_frame.await_count >= 1
    pushed_frame = handler.push_frame.call_args_list[0][0][0]
    assert isinstance(pushed_frame, _mock_LLMMessagesAppendFrame)
    content = pushed_frame.messages[0]["content"]
    assert "Running tests" in content

    # Speech should be triggered
    handler._pipeline_task.queue_frames.assert_awaited_once()


# ---------------------------------------------------------------------------
# 6. happy.trigger with invalid JSON is handled gracefully
# ---------------------------------------------------------------------------

def test_happy_trigger_invalid_json_no_crash(handler):
    """happy.trigger with non-JSON text does not crash — logs warning and returns."""
    frame = _make_rtvi_frame("happy.trigger", {"text": "not valid json {{"})
    direction = _mock_FrameDirection.DOWNSTREAM

    # Should not raise
    asyncio.run(handler.process_frame(frame, direction))

    # No frames should be pushed (trigger was invalid)
    handler.push_frame.assert_not_awaited()
    # No speech triggered
    handler._pipeline_task.queue_frames.assert_not_awaited()


# ---------------------------------------------------------------------------
# 7. Empty text in message is ignored (no frames pushed)
# ---------------------------------------------------------------------------

def test_empty_text_is_ignored(handler):
    """Messages with empty text are silently dropped."""
    frame = _make_rtvi_frame("happy.context", {"text": ""})
    direction = _mock_FrameDirection.DOWNSTREAM

    asyncio.run(handler.process_frame(frame, direction))

    handler.push_frame.assert_not_awaited()
    handler._pipeline_task.queue_frames.assert_not_awaited()


def test_missing_text_key_is_ignored(handler):
    """Messages with no 'text' key are silently dropped."""
    frame = _make_rtvi_frame("happy.chat", {})
    direction = _mock_FrameDirection.DOWNSTREAM

    asyncio.run(handler.process_frame(frame, direction))

    handler.push_frame.assert_not_awaited()
    handler._pipeline_task.queue_frames.assert_not_awaited()


# ---------------------------------------------------------------------------
# 8. _trigger_speech queues LLMRunFrame on the pipeline task
# ---------------------------------------------------------------------------

def test_trigger_speech_queues_llm_run_frame(handler):
    """_trigger_speech queues a single LLMRunFrame via pipeline_task.queue_frames."""
    asyncio.run(handler._trigger_speech())

    handler._pipeline_task.queue_frames.assert_awaited_once()
    queued = handler._pipeline_task.queue_frames.call_args[0][0]
    assert len(queued) == 1
    assert isinstance(queued[0], _mock_LLMRunFrame)


def test_trigger_speech_no_pipeline_task():
    """_trigger_speech is a no-op when pipeline_task is not set."""
    h = ClientMessageHandler()
    h.push_frame = AsyncMock()
    # Do not set pipeline task

    # Should not raise
    asyncio.run(h._trigger_speech())


# ---------------------------------------------------------------------------
# 9. set_pipeline_task stores the reference
# ---------------------------------------------------------------------------

def test_set_pipeline_task_stores_reference():
    """set_pipeline_task stores the task reference for later use."""
    h = ClientMessageHandler()
    task = MagicMock()
    h.set_pipeline_task(task)
    assert h._pipeline_task is task


# ---------------------------------------------------------------------------
# 10. Unknown message types are silently dropped
# ---------------------------------------------------------------------------

def test_unknown_message_type_dropped(handler):
    """An unknown message type does not push any frames or trigger speech."""
    frame = _make_rtvi_frame("happy.unknown", {"text": "something"})
    direction = _mock_FrameDirection.DOWNSTREAM

    asyncio.run(handler.process_frame(frame, direction))

    handler.push_frame.assert_not_awaited()
    handler._pipeline_task.queue_frames.assert_not_awaited()


# ---------------------------------------------------------------------------
# 11. happy.trigger with unknown trigger type does nothing
# ---------------------------------------------------------------------------

def test_happy_trigger_unknown_type(handler):
    """happy.trigger with an unrecognized trigger type does not push or trigger."""
    trigger_data = json.dumps({"type": "some_future_trigger"})
    frame = _make_rtvi_frame("happy.trigger", {"text": trigger_data})
    direction = _mock_FrameDirection.DOWNSTREAM

    asyncio.run(handler.process_frame(frame, direction))

    handler.push_frame.assert_not_awaited()
    handler._pipeline_task.queue_frames.assert_not_awaited()


# ---------------------------------------------------------------------------
# 12. Data as string (non-dict) is coerced to text via str()
# ---------------------------------------------------------------------------

def test_data_as_string_coerced(handler):
    """When frame.data is a plain string, it is coerced via str() and used as text."""
    frame = _make_rtvi_frame("happy.context", "Some plain string data")
    direction = _mock_FrameDirection.DOWNSTREAM

    asyncio.run(handler.process_frame(frame, direction))

    assert handler.push_frame.await_count == 1
    pushed_frame = handler.push_frame.call_args_list[0][0][0]
    assert isinstance(pushed_frame, _mock_LLMMessagesAppendFrame)
    assert "Some plain string data" in pushed_frame.messages[0]["content"]
