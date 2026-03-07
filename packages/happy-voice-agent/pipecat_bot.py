"""
Pipecat voice agent bot pipeline.
STT → Claude LLM → TTS (Cartesia primary, Deepgram fallback), with SmallWebRTCTransport.

STT backend is configurable via STT_SERVICE env var:
  - "deepgram" (default): Deepgram Nova-3 streaming
  - "whisper": Local Whisper via MLX (no API key needed)
"""

import asyncio
import logging
import os

import aiohttp

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.frames.frames import Frame, STTMuteFrame, VADUserStartedSpeakingFrame
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frameworks.rtvi import (
    RTVILLMFunctionCallInProgressMessage,
    RTVILLMFunctionCallInProgressMessageData,
    RTVIProcessor,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.services.anthropic.llm import AnthropicLLMService
from pipecat.services.cartesia.tts import CartesiaHttpTTSService
from pipecat.services.deepgram.tts import DeepgramHttpTTSService
# Deepgram/Whisper STT imported conditionally in run_bot()
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

from fallback_tts import FallbackTTSService
from pipecat_text_handler import ClientMessageHandler
from pipecat_tools import TOOL_NAME_TO_CLIENT, get_tools

logger = logging.getLogger("pipecat-bot")

# Reuse the system prompt from the LiveKit agent verbatim.
# Imported as a constant to keep this file focused on pipeline setup.
from agent import SYSTEM_PROMPT


class STTAutoResumeProcessor(FrameProcessor):
    """Auto-resumes STT when VAD detects speech while STT is idle-muted.

    Sits between transport.input() and the STT service. Tracks mute state
    by observing STTMuteFrame as it flows through. When the user starts
    speaking while muted, injects STTMuteFrame(mute=False) BEFORE the
    speech-start frame so the STT is already unmuted when it arrives.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._stt_muted = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, STTMuteFrame):
            self._stt_muted = frame.mute
            await self.push_frame(frame, direction)
        elif isinstance(frame, VADUserStartedSpeakingFrame) and self._stt_muted:
            logger.info("Auto-resuming STT — user started speaking")
            self._stt_muted = False
            await self.push_frame(STTMuteFrame(mute=False), direction)
            await self.push_frame(frame, direction)
        else:
            await self.push_frame(frame, direction)


async def run_bot(webrtc_connection: SmallWebRTCConnection, session_id: str):
    """Create and run the Pipecat pipeline for a single voice session."""
    logger.info(f"Starting bot for session: {session_id}")

    # --- Transport ---
    transport = SmallWebRTCTransport(
        webrtc_connection=webrtc_connection,
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=SileroVADAnalyzer(),
        ),
    )

    # --- STT service (configurable via STT_SERVICE env var) ---
    stt_service = os.getenv("STT_SERVICE", "deepgram").lower()
    if stt_service == "whisper":
        from pipecat.services.whisper.stt import WhisperSTTServiceMLX, MLXModel
        stt = WhisperSTTServiceMLX(model=MLXModel.TINY)
        logger.info("Using Whisper MLX (local) for STT")
    else:
        from pipecat.services.deepgram.stt import DeepgramSTTService
        stt = DeepgramSTTService(
            api_key=os.environ["DEEPGRAM_API_KEY"],
            model="nova-3",
            language="multi",
        )
        logger.info("Using Deepgram Nova-3 for STT")

    llm = AnthropicLLMService(
        api_key=os.environ["ANTHROPIC_API_KEY"],
        model="claude-sonnet-4-6",
        retry_on_timeout=True,
    )

    # --- TTS with automatic fallback ---
    aiohttp_session = aiohttp.ClientSession()

    primary_tts = CartesiaHttpTTSService(
        api_key=os.environ["CARTESIA_API_KEY"],
        voice_id="f786b574-daa5-4673-aa0c-cbe3e8534c02",
        model="sonic-3",
    )
    fallback_tts = DeepgramHttpTTSService(
        api_key=os.environ["DEEPGRAM_API_KEY"],
        voice="aura-2-thalia-en",
        aiohttp_session=aiohttp_session,
    )
    tts = FallbackTTSService(
        primary=primary_tts,
        fallback=fallback_tts,
        fallback_sticky_duration_s=300.0,
    )

    # --- RTVI processor for client communication ---
    rtvi = RTVIProcessor()

    # --- Client message handler for text channels ---
    message_handler = ClientMessageHandler()

    # --- LLM context with system prompt and tools ---
    tools = get_tools()
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    context = LLMContext(messages, tools)
    context_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            # After 5s of silence, fire on_user_turn_idle → mute STT to save Deepgram costs.
            # STTAutoResumeProcessor auto-unmutes when user speaks again, so false mutes are harmless.
            user_idle_timeout=5.0,
        ),
    )

    # --- Register tool handlers (forward all to client via RTVI) ---
    # Pending tool calls: tool_call_id → Future that resolves with the client result.
    pending_tool_calls: dict[str, asyncio.Future] = {}

    # Patch _handle_function_call_result on the RTVI processor so that when
    # the client sends back an `llm-function-call-result` message, we resolve
    # the matching Future instead of pushing a FunctionCallResultFrame directly
    # (which would bypass result_callback and leave the LLM context broken).
    _original_handle_result = rtvi._handle_function_call_result

    async def _patched_handle_result(data):
        tool_call_id = data.tool_call_id
        future = pending_tool_calls.get(tool_call_id)
        if future and not future.done():
            logger.info(f"Resolved tool call result: {tool_call_id}")
            future.set_result(data.result)
        else:
            # Not one of ours — fall through to default behavior
            await _original_handle_result(data)

    rtvi._handle_function_call_result = _patched_handle_result

    async def forward_to_client(params: FunctionCallParams):
        """Forward tool call to client via RTVI, wait for result, call result_callback."""
        client_name = TOOL_NAME_TO_CLIENT.get(
            params.function_name, params.function_name
        )
        logger.info(
            f"Forwarding tool call to client: {params.function_name} -> {client_name}"
        )

        # Create a Future for the client's response
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        pending_tool_calls[params.tool_call_id] = future

        try:
            # Send function call details to client via RTVI transport message
            msg = RTVILLMFunctionCallInProgressMessage(
                data=RTVILLMFunctionCallInProgressMessageData(
                    tool_call_id=params.tool_call_id,
                    function_name=client_name,
                    arguments=params.arguments,
                )
            )
            await rtvi.push_transport_message(msg, exclude_none=False)

            # Wait for client to execute and respond (30s timeout)
            result = await asyncio.wait_for(future, timeout=30.0)
            await params.result_callback(result)
        except asyncio.TimeoutError:
            logger.error(f"Tool call timed out: {params.function_name}")
            await params.result_callback("Error: tool call timed out waiting for client")
        except Exception as e:
            logger.error(f"Tool call failed: {params.function_name} -> {e}")
            await params.result_callback(f"Error: tool call failed — {e}")
        finally:
            pending_tool_calls.pop(params.tool_call_id, None)

    for tool_def in tools.standard_tools:
        llm.register_function(tool_def.name, forward_to_client)

    # --- Pipeline ---
    # NOTE: RTVIProcessor is NOT in the pipeline list. PipelineTask 0.0.103
    # auto-adds it as a wrapper (before Pipeline). Putting it inside Pipeline
    # causes dual-linkage that blocks StartFrame propagation.
    stt_auto_resume = STTAutoResumeProcessor()

    pipeline = Pipeline(
        [
            transport.input(),
            stt_auto_resume,
            stt,
            message_handler,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
        ),
        rtvi_processor=rtvi,
    )

    # Give the message handler a reference to the task for proactive speech
    message_handler.set_pipeline_task(task)

    # --- STT idle optimization: mute Deepgram when user is silent ---
    @context_aggregator.user().event_handler("on_user_turn_idle")
    async def on_user_turn_idle(aggregator):
        logger.info("STT muted — user idle")
        await task.queue_frames([STTMuteFrame(mute=True)])

    # --- Events ---
    @transport.event_handler("on_client_connected")
    async def on_connected(transport, client):
        logger.info("Client connected — waiting for initial context before greeting")

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport, client):
        logger.info("Client disconnected")

    # --- Run ---
    runner = PipelineRunner()
    await runner.run(task)
    await aiohttp_session.close()
    logger.info(f"Bot finished for session: {session_id}")
