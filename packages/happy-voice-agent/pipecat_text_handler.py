"""
Custom FrameProcessor for handling app→agent text channels.
Receives RTVIClientMessageFrame messages on 3 topics:
  - happy.context: Background context (silent, no speech)
  - happy.chat: Immediate messages (triggers proactive speech)
  - happy.trigger: Proactive speech triggers (turn_complete, progress_update)
"""

import json
import logging

from pipecat.frames.frames import Frame, LLMMessagesAppendFrame, LLMSetToolsFrame, STTMuteFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import RTVIClientMessageFrame

logger = logging.getLogger("pipecat-text-handler")


class ClientMessageHandler(FrameProcessor):
    """Processes custom client messages from the app and injects them into the LLM context."""

    def __init__(self, pipeline_task=None, **kwargs):
        super().__init__(**kwargs)
        self._pipeline_task = pipeline_task
        self._initial_context_received = False

    def set_pipeline_task(self, task):
        """Set the pipeline task reference (needed for queueing LLMRunFrame)."""
        self._pipeline_task = task

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if not isinstance(frame, RTVIClientMessageFrame):
            await self.push_frame(frame, direction)
            return

        msg_type = frame.type
        data = frame.data
        text = data.get("text", "") if isinstance(data, dict) else str(data)

        if not text:
            return

        if msg_type == "happy.context":
            # Background context update — add to LLM context silently
            logger.info(f"Context update: {text[:120]}")
            await self.push_frame(
                LLMMessagesAppendFrame(
                    messages=[{"role": "user", "content": text}]
                )
            )
            # First context message = initial session context from app.
            # Trigger the greeting NOW (after context is in the LLM).
            if not self._initial_context_received:
                self._initial_context_received = True
                logger.info("Initial context received — triggering greeting")
                await self._trigger_speech()

        elif msg_type == "happy.chat":
            # Immediate message — add to context AND trigger proactive speech
            logger.info(f"Chat message: {text[:120]}")
            await self.push_frame(
                LLMMessagesAppendFrame(
                    messages=[{"role": "user", "content": text}]
                )
            )
            # Trigger a new LLM generation for proactive speech
            if self._pipeline_task:
                from pipecat.frames.frames import LLMFullResponseEndFrame

                # Push an empty user turn to trigger assistant response
                await self._trigger_speech()

        elif msg_type == "happy.trigger":
            # Proactive speech triggers (turn_complete, progress_update)
            try:
                trigger = json.loads(text)
            except json.JSONDecodeError:
                logger.warning(f"Invalid trigger JSON: {text[:100]}")
                return

            trigger_type = trigger.get("type")
            logger.info(f"Trigger: {trigger_type}")

            if trigger_type == "turn_complete":
                await self.push_frame(
                    LLMMessagesAppendFrame(
                        messages=[
                            {
                                "role": "user",
                                "content": (
                                    "Claude Code just finished working. Based on the context you have, "
                                    "give the user a brief 1-2 sentence summary of what Claude accomplished "
                                    "and ask if they need anything else. Be concise and natural."
                                ),
                            }
                        ]
                    )
                )
                await self._trigger_speech()

            elif trigger_type == "progress_update":
                summary = trigger.get("summary", "Claude is still working.")
                await self.push_frame(
                    LLMMessagesAppendFrame(
                        messages=[
                            {
                                "role": "user",
                                "content": (
                                    f"Claude Code is still working. Recent activity: {summary}. "
                                    "Give the user a very brief 1-sentence progress update. "
                                    "Be concise — just the key point of what's happening now."
                                ),
                            }
                        ]
                    )
                )
                await self._trigger_speech()

        else:
            logger.debug(f"Unknown client message type: {msg_type}")

    async def _trigger_speech(self):
        """Trigger a new LLM generation to produce proactive speech.
        Unmutes STT first so the user can respond after the agent speaks."""
        if self._pipeline_task:
            from pipecat.frames.frames import LLMRunFrame

            await self._pipeline_task.queue_frames([
                STTMuteFrame(mute=False),
                LLMRunFrame(),
            ])
