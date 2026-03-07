"""Tests for fallback_tts.py — FallbackTTSService primary/fallback failover.

Verifies:
  - Primary success yields primary frames
  - Primary error triggers fallback retry
  - Primary exception triggers fallback retry
  - Both services failing yields ErrorFrame
  - Sticky fallback skips primary for subsequent calls
  - Cooldown retry re-tries primary after elapsed duration
  - Primary recovery resets to primary mode
"""

from unittest.mock import AsyncMock

import pytest

from pipecat.frames.frames import (
    ErrorFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)

from fallback_tts import FallbackTTSService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _audio_frame(context_id: str = "ctx-1") -> TTSAudioRawFrame:
    return TTSAudioRawFrame(
        audio=b"\x00" * 320,
        sample_rate=16000,
        num_channels=1,
        context_id=context_id,
    )


async def _successful_generator(text: str, context_id: str):
    """Mimics a healthy HTTP TTS run_tts generator."""
    yield TTSStartedFrame(context_id=context_id)
    yield _audio_frame(context_id)
    yield TTSStoppedFrame(context_id=context_id)


async def _error_generator(text: str, context_id: str):
    """Mimics a failing HTTP TTS run_tts generator (e.g. HTTP 402)."""
    yield TTSStartedFrame(context_id=context_id)
    yield ErrorFrame(error="Cartesia API error: HTTP 402 Payment Required")
    yield TTSStoppedFrame(context_id=context_id)


async def _exception_generator(text: str, context_id: str):
    """Mimics a TTS generator that raises an exception."""
    raise ConnectionError("WebSocket connection refused")
    yield  # pragma: no cover


async def _collect_frames(gen) -> list:
    """Collect all frames from an async generator."""
    frames = []
    async for frame in gen:
        frames.append(frame)
    return frames


class CallTracker:
    """Wraps an async generator function to track call count."""

    def __init__(self, fn):
        self._fn = fn
        self.call_count = 0

    def __call__(self, *args, **kwargs):
        self.call_count += 1
        return self._fn(*args, **kwargs)


def _make_service(
    primary_fn=None,
    fallback_fn=None,
    sticky_duration: float = 300.0,
):
    """Create a FallbackTTSService with mocked inner services.

    Returns (service, primary_mock, fallback_mock).
    run_tts is set directly to the async generator function (not AsyncMock)
    because async generators don't play well with AsyncMock side_effect.
    """
    primary = AsyncMock()
    fallback = AsyncMock()

    primary.run_tts = CallTracker(primary_fn or _successful_generator)
    fallback.run_tts = CallTracker(fallback_fn or _successful_generator)

    svc = FallbackTTSService(
        primary=primary,
        fallback=fallback,
        fallback_sticky_duration_s=sticky_duration,
    )
    return svc, primary, fallback


# ---------------------------------------------------------------------------
# 1. Primary succeeds — yields primary frames
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_primary_success():
    svc, primary, fallback = _make_service()

    frames = await _collect_frames(svc.run_tts("hello", "ctx-1"))

    assert len(frames) == 3
    assert isinstance(frames[0], TTSStartedFrame)
    assert isinstance(frames[1], TTSAudioRawFrame)
    assert isinstance(frames[2], TTSStoppedFrame)
    assert primary.run_tts.call_count == 1
    assert fallback.run_tts.call_count == 0


# ---------------------------------------------------------------------------
# 2. Primary ErrorFrame — fallback succeeds
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_primary_error_triggers_fallback():
    svc, primary, fallback = _make_service(primary_fn=_error_generator)

    frames = await _collect_frames(svc.run_tts("hello", "ctx-1"))

    assert len(frames) == 3
    assert isinstance(frames[0], TTSStartedFrame)
    assert isinstance(frames[1], TTSAudioRawFrame)
    assert isinstance(frames[2], TTSStoppedFrame)
    assert svc._using_fallback is True


# ---------------------------------------------------------------------------
# 3. Primary exception — fallback succeeds
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_primary_exception_triggers_fallback():
    svc, primary, fallback = _make_service(primary_fn=_exception_generator)

    frames = await _collect_frames(svc.run_tts("hello", "ctx-1"))

    assert len(frames) == 3
    assert isinstance(frames[0], TTSStartedFrame)
    assert isinstance(frames[1], TTSAudioRawFrame)
    assert isinstance(frames[2], TTSStoppedFrame)
    assert svc._using_fallback is True


# ---------------------------------------------------------------------------
# 4. Both fail — yields ErrorFrame
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_both_fail():
    svc, _, _ = _make_service(
        primary_fn=_error_generator,
        fallback_fn=_error_generator,
    )

    frames = await _collect_frames(svc.run_tts("hello", "ctx-1"))

    assert len(frames) == 1
    assert isinstance(frames[0], ErrorFrame)


# ---------------------------------------------------------------------------
# 5. Sticky fallback — second call skips primary
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_sticky_fallback():
    svc, primary, fallback = _make_service(primary_fn=_error_generator)

    # First call: primary fails, switches to fallback
    await _collect_frames(svc.run_tts("first", "ctx-1"))
    assert svc._using_fallback is True
    assert primary.run_tts.call_count == 1
    assert fallback.run_tts.call_count == 1

    # Second call: should go directly to fallback (skip primary)
    await _collect_frames(svc.run_tts("second", "ctx-2"))

    # Primary was only called once (for the first request)
    assert primary.run_tts.call_count == 1
    assert fallback.run_tts.call_count == 2


# ---------------------------------------------------------------------------
# 6. Cooldown retry — retries primary after duration
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cooldown_retries_primary():
    svc, primary, fallback = _make_service(
        primary_fn=_error_generator,
        sticky_duration=0.0,  # immediate cooldown
    )

    # First call: fails, switches to fallback
    await _collect_frames(svc.run_tts("first", "ctx-1"))
    assert svc._using_fallback is True

    # Replace primary with a succeeding generator
    svc._primary.run_tts = CallTracker(_successful_generator)

    # Second call: cooldown elapsed (0s), retries primary
    frames = await _collect_frames(svc.run_tts("second", "ctx-2"))
    assert svc._using_fallback is False
    assert svc._primary.run_tts.call_count == 1
    assert len(frames) == 3


# ---------------------------------------------------------------------------
# 7. Cooldown NOT elapsed — stays on fallback
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_cooldown_not_elapsed_stays_on_fallback():
    svc, primary, fallback = _make_service(
        primary_fn=_error_generator,
        sticky_duration=9999.0,  # very long cooldown
    )

    # First call: fails, switches to fallback
    await _collect_frames(svc.run_tts("first", "ctx-1"))
    assert svc._using_fallback is True

    # Second call: cooldown NOT elapsed, stays on fallback
    frames = await _collect_frames(svc.run_tts("second", "ctx-2"))

    assert svc._using_fallback is True
    assert len(frames) == 3
    assert isinstance(frames[1], TTSAudioRawFrame)
    # Primary was only called once (first request), not for second
    assert primary.run_tts.call_count == 1


# ---------------------------------------------------------------------------
# 8. None frames from inner service are filtered
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_none_frames_filtered():
    async def generator_with_nones(text, context_id):
        yield TTSStartedFrame(context_id=context_id)
        yield None
        yield _audio_frame(context_id)
        yield None
        yield TTSStoppedFrame(context_id=context_id)

    svc, _, _ = _make_service(primary_fn=generator_with_nones)

    frames = await _collect_frames(svc.run_tts("hello", "ctx-1"))

    assert len(frames) == 3
    assert not any(f is None for f in frames)


# ---------------------------------------------------------------------------
# 9. Lifecycle methods delegate to both services
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_start_delegates_to_both():
    svc, primary, fallback = _make_service()
    frame = AsyncMock()
    frame.audio_out_sample_rate = 16000

    await svc.start(frame)

    primary.start.assert_called_once_with(frame)
    fallback.start.assert_called_once_with(frame)


@pytest.mark.asyncio
async def test_stop_delegates_to_both():
    svc, primary, fallback = _make_service()
    frame = AsyncMock()

    await svc.stop(frame)

    primary.stop.assert_called_once_with(frame)
    fallback.stop.assert_called_once_with(frame)


@pytest.mark.asyncio
async def test_cancel_delegates_to_both():
    svc, primary, fallback = _make_service()
    frame = AsyncMock()

    await svc.cancel(frame)

    primary.cancel.assert_called_once_with(frame)
    fallback.cancel.assert_called_once_with(frame)
