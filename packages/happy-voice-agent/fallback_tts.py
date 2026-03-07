"""FallbackTTSService: TTS with automatic primary → fallback failover.

When the primary TTS (Cartesia) fails — billing errors, connection issues,
timeouts — automatically retries with a fallback TTS (Deepgram). Uses a
"sticky" fallback: once primary fails, stays on fallback for a configurable
cooldown before retrying primary.

Both inner services must be HTTP-based (synchronous run_tts generators)
so we can detect errors mid-generation and retry.
"""

import time
from typing import AsyncGenerator, Optional

from loguru import logger

from pipecat.frames.frames import (
    CancelFrame,
    EndFrame,
    ErrorFrame,
    Frame,
    StartFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)
from pipecat.services.tts_service import TTSService


class FallbackTTSService(TTSService):
    """TTS wrapper that falls back from primary to secondary on errors.

    Both inner services are used only as TTS engines — their run_tts()
    generators are called directly. They are NOT placed in the pipeline.
    """

    def __init__(
        self,
        *,
        primary: TTSService,
        fallback: TTSService,
        fallback_sticky_duration_s: float = 300.0,
        **kwargs,
    ):
        super().__init__(**kwargs)
        self._primary = primary
        self._fallback = fallback
        self._fallback_sticky_duration_s = fallback_sticky_duration_s
        self._using_fallback = False
        self._fallback_activated_at: Optional[float] = None

    async def start(self, frame: StartFrame):
        await super().start(frame)
        await self._primary.start(frame)
        await self._fallback.start(frame)

    async def stop(self, frame: EndFrame):
        await super().stop(frame)
        await self._primary.stop(frame)
        await self._fallback.stop(frame)

    async def cancel(self, frame: CancelFrame):
        await super().cancel(frame)
        await self._primary.cancel(frame)
        await self._fallback.cancel(frame)

    def _should_retry_primary(self) -> bool:
        if not self._using_fallback or self._fallback_activated_at is None:
            return False
        elapsed = time.monotonic() - self._fallback_activated_at
        return elapsed >= self._fallback_sticky_duration_s

    def _switch_to_fallback(self):
        logger.warning("Switching to fallback TTS")
        self._using_fallback = True
        self._fallback_activated_at = time.monotonic()

    def _switch_to_primary(self):
        logger.info("Retrying primary TTS")
        self._using_fallback = False
        self._fallback_activated_at = None

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame, None]:
        if self._using_fallback and self._should_retry_primary():
            self._switch_to_primary()

        active = self._fallback if self._using_fallback else self._primary

        # Buffer all frames from the active service so we can detect errors
        # before committing any frames to the pipeline.
        frames: list[Frame] = []
        has_error = False

        try:
            async for frame in active.run_tts(text, context_id):
                if frame is None:
                    continue
                if isinstance(frame, ErrorFrame):
                    has_error = True
                    break
                frames.append(frame)
        except Exception as e:
            logger.warning(f"TTS exception from {'fallback' if self._using_fallback else 'primary'}: {e}")
            has_error = True

        if not has_error:
            # Success — yield buffered frames
            if active is self._primary and self._using_fallback:
                # Primary recovered after cooldown retry
                pass
            for frame in frames:
                yield frame
            return

        # If the active service was already the fallback, nothing left to try
        if active is self._fallback:
            logger.error(f"Fallback TTS also failed for: {text[:80]}")
            yield ErrorFrame(error=f"Both TTS services failed for: {text[:80]}")
            return

        # Switch to fallback and retry with the same text
        self._switch_to_fallback()
        logger.info(f"Retrying with fallback TTS: '{text[:80]}'")

        fallback_frames: list[Frame] = []
        fallback_error = False

        try:
            async for frame in self._fallback.run_tts(text, context_id):
                if frame is None:
                    continue
                if isinstance(frame, ErrorFrame):
                    fallback_error = True
                    break
                fallback_frames.append(frame)
        except Exception as e:
            logger.error(f"Fallback TTS exception: {e}")
            fallback_error = True

        if fallback_error:
            logger.error(f"Both TTS services failed for: {text[:80]}")
            yield ErrorFrame(error=f"Both TTS services failed for: {text[:80]}")
            return

        for frame in fallback_frames:
            yield frame
