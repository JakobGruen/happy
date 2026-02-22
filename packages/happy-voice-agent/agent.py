import logging
import json

from dotenv import load_dotenv

from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    JobProcess,
    RunContext,
    WorkerOptions,
    WorkerType,
    cli,
    get_job_context,
)
from livekit.agents.llm import function_tool, ToolError
from livekit.plugins import silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

logger = logging.getLogger("happy-voice-agent")
load_dotenv()

SYSTEM_PROMPT = """You are Happy, a voice assistant that controls Claude Code sessions hands-free.

<spoken-output-rules>
- Max 1-2 SHORT sentences for any spoken reply
- After sending a message or handling a tool call, say only "Sent" or "Done"
- First greeting when conversation starts: say "Hi, happy here"
- NEVER repeat back what the user said
- NEVER narrate what you're about to do — just do it
- No markdown, no code blocks, no formatting — plain speech only
- When summarizing Claude Code activity: one sentence max
- If the user's intent is unclear, ask ONE short clarifying question
</spoken-output-rules>

<prompt-engineering-rules>
When using the messageClaudeCode tool, translate spoken intent into well-structured prompts:
- Simple requests -> clean plain text prompt
- Complex requests -> use XML tags (<task>, <context>, <constraints>)
- Capture WHAT and WHY, let Claude Code figure out HOW
- Reference specific files/paths when the user mentions them
- Strip filler words and speech artifacts
- Preserve technical terms exactly as spoken
</prompt-engineering-rules>"""


class HappyAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=SYSTEM_PROMPT)

    async def on_enter(self):
        self.session.generate_reply(allow_interruptions=False)

    def _get_user_identity(self) -> str:
        room = get_job_context().room
        participants = list(room.remote_participants.keys())
        if not participants:
            raise ToolError("No user connected to the room")
        return participants[0]

    @function_tool
    async def message_claude_code(self, context: RunContext, message: str):
        """Send a structured prompt to Claude Code in the active session.
        Transform the user's spoken request into a clean, well-structured prompt — not raw speech.

        Args:
            message: A well-structured prompt for Claude Code. For simple requests use clear
                     plain text. For complex or multi-step requests use XML tags.
                     Capture WHAT and WHY — let Claude Code decide HOW.
        """
        try:
            response = await get_job_context().room.local_participant.perform_rpc(
                destination_identity=self._get_user_identity(),
                method="messageClaudeCode",
                payload=json.dumps({"message": message}),
                response_timeout=10.0,
            )
            return response
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            raise ToolError("Failed to send message to Claude Code")

    @function_tool
    async def process_permission_request(self, context: RunContext, decision: str):
        """Allow or deny a pending permission request from Claude Code.

        Args:
            decision: Whether to allow or deny the permission request. Must be 'allow' or 'deny'.
        """
        if decision not in ("allow", "deny"):
            raise ToolError("Decision must be 'allow' or 'deny'")
        try:
            response = await get_job_context().room.local_participant.perform_rpc(
                destination_identity=self._get_user_identity(),
                method="processPermissionRequest",
                payload=json.dumps({"decision": decision}),
                response_timeout=10.0,
            )
            return response
        except Exception as e:
            logger.error(f"Failed to process permission: {e}")
            raise ToolError(f"Failed to {decision} permission request")


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    session = AgentSession(
        stt="deepgram/nova-3:multi",
        llm="openai/gpt-4.1-mini",
        tts="cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
    )
    await session.start(agent=HappyAgent(), room=ctx.room)


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            worker_type=WorkerType.ROOM,
        )
    )
