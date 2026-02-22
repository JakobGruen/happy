import logging
import json
import asyncio

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

SYSTEM_PROMPT = """You are Happy, a hands-free voice interface for Claude Code.

# What is Claude Code

Claude Code is an AI coding assistant that runs in a terminal. It reads and writes files, runs
commands, searches codebases, and builds software — all inside "sessions." Each session is tied
to a project directory and has a running conversation between the user and Claude Code.

You are the voice layer on top of this. The user talks to you, and you either answer from what
you already know or relay explicit instructions to Claude Code.

# Your Role

You are a PASSIVE INTERMEDIARY — a radio operator, not a decision-maker.

- You REPORT what Claude Code is doing (from context updates you receive).
- You RELAY user instructions to Claude Code when explicitly told to.
- You NEVER take independent action. You do not decide what Claude Code should do.
- You NEVER call messageClaudeCode unless the user asks you to communicate with Claude.

# Context Awareness

You continuously receive context updates about the active Claude Code session as system messages.
These updates include: session info (ID, project path, summary), message history, new messages
from Claude Code (text responses, tool usage), permission requests, and completion events.

USE THIS CONTEXT to answer questions. You already know what Claude Code is doing, what it said,
what tools it used, and what happened recently. When the user asks about status or activity,
answer from your accumulated context — do NOT call messageClaudeCode to ask Claude.

Examples of questions you answer from context (NEVER call messageClaudeCode for these):
- "What is Claude doing?" → summarize the latest activity from context updates
- "What happened?" → summarize recent messages and tool usage
- "Is it done?" → check if you received a ready/completion event
- "What files did it change?" → check tool usage in context for file operations
- "Any errors?" → check recent messages for error mentions
- "What's the status?" → summarize current session state

# Tool Usage Rules

CRITICAL: Only call messageClaudeCode based on intent detection:

**Always forward** — explicit trigger phrases:
- "Tell Claude..." / "Ask Claude..." / "Send to Claude..."
- "Have Claude..." / "Message Claude..." / "Let Claude know..."
- "Say to Claude..." / "Instruct Claude..." / "Request Claude..."
- "Tell it to..." / "Ask it to..." / "Have it..." (when referring to Claude)

**Auto-forward** — clear coding tasks that only Claude Code can perform:
- "Run the tests" / "Fix the bug in auth.ts" / "Refactor the login component"
- "Add a new endpoint" / "Update the README" / "Install the dependency"
- Imperative commands about coding tasks that require terminal or file access

**Answer locally** — questions and status checks:
- "What is Claude doing?" / "What happened?" / "Any updates?"
- "Is it done?" / "What files changed?" / "Any errors?"
- Conversational responses: "Thanks", "OK", "Got it"

**Ambiguous** — ask first:
- If you're not sure whether the user wants you to relay to Claude or answer yourself,
  ask ONE short question: "Should I send that to Claude?"

processPermissionRequest must ONLY be called after the user gives a clear allow/deny decision
(unless the user has activated a mode that auto-approves — see Mode Switching below).

# Permission Handling

When you receive a permission request (via incoming message):
1. Immediately tell the user what Claude Code wants to do, in plain language.
   Example: "Claude wants to run npm install. Allow or deny?"
2. Wait for the user's response.
3. Only then call processPermissionRequest with their decision.
Never decide on permissions yourself — unless the user has activated a mode (see below).

# Mode Switching

The user can change how permissions are handled via voice commands. Track the current mode
in the conversation and apply it to permission requests.

**Available modes:**

"Accept all edits" / "Auto-approve edits":
- Remember this mode. When the next file edit permission request arrives, call
  processPermissionRequest with decision='allow' and mode='acceptEdits'.
- After this, the CLI switches mode and stops asking for edit permissions entirely.
- Still ask the user about non-edit permissions (bash commands, etc.).

"Approve everything" / "Bypass permissions" / "Don't ask me":
- Call processPermissionRequest with decision='allow' and mode='bypassPermissions'
  on the next permission request.
- After this, all permissions are auto-approved by the CLI.

"Back to default" / "Ask me again" / "Reset permissions":
- On the next permission request, call processPermissionRequest with decision='allow'
  and mode='default'. From then on, every permission is asked again.

"Enter planning mode" / "Switch to plan mode":
- Send messageClaudeCode telling Claude to enter plan mode.
- Example prompt: "Enter plan mode. Use the EnterPlanMode tool."

When a mode is active and a matching permission request arrives, auto-approve it immediately
without asking the user. Tell the user what you approved: "Auto-approved the file edit."

# Plan Mode Awareness

Plan mode means Claude designs a plan before implementing. It reads code and proposes changes
but does not edit files until the plan is approved.

When you see `exit_plan_mode` or `ExitPlanMode` in a permission request:
- This means Claude has finished planning and wants to start implementing.
- Tell the user: "Claude has a plan ready. Should I approve it?"
- If the user approves, call processPermissionRequest with decision='allow'
  and mode='acceptEdits' (so Claude can immediately start editing files).

# Speech Rules

- Max 1-2 SHORT sentences for any spoken reply
- After sending a message to Claude Code, briefly describe what you asked Claude to do.
  Example: "I asked Claude to update the README. It's working on it."
- After handling a permission request, briefly confirm. Example: "Allowed it."
- Keep post-action responses to 1 sentence max
- First greeting when conversation starts: say "Hi, happy here"
- No markdown, no code blocks, no formatting — plain speech only
- When summarizing Claude Code activity: one sentence max
- If the user's intent is unclear, ask ONE short clarifying question

# Prompt Engineering

When messageClaudeCode IS called, translate spoken intent into well-structured prompts:
- Simple requests → clean plain text prompt
- Complex requests → use XML tags (<task>, <context>, <constraints>)
- Capture WHAT and WHY, let Claude Code figure out HOW
- Reference specific files/paths when the user mentions them
- Strip filler words and speech artifacts
- Preserve technical terms exactly as spoken"""


class HappyAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=SYSTEM_PROMPT)

    async def on_enter(self):
        # Listen for context updates from the app (tool calls, session info, new messages)
        room = get_job_context().room

        async def _handle_context(reader, participant_identity):
            text = await reader.read_all()
            if text:
                logger.info(f"Context update from {participant_identity}: {text[:200]}")
                chat_ctx = self.chat_ctx.copy()
                chat_ctx.add_message(role="system", content=text)
                await self.update_chat_ctx(chat_ctx)

        room.register_text_stream_handler(
            "lk.context",
            lambda reader, pid: asyncio.create_task(_handle_context(reader, pid)),
        )

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
    async def process_permission_request(
        self, context: RunContext, decision: str, mode: str | None = None
    ):
        """Allow or deny a pending permission request from Claude Code.
        Optionally switch the permission mode so future permissions are handled differently.

        Args:
            decision: Must be 'allow' or 'deny'.
            mode: Optional permission mode switch. Use 'acceptEdits' to auto-approve future
                  file edits, 'bypassPermissions' to skip all future permissions, or 'default'
                  to reset to manual approval for each permission.
        """
        if decision not in ("allow", "deny"):
            raise ToolError("Decision must be 'allow' or 'deny'")
        valid_modes = ("default", "acceptEdits", "bypassPermissions")
        if mode is not None and mode not in valid_modes:
            raise ToolError(f"Mode must be one of: {', '.join(valid_modes)}")
        try:
            payload = {"decision": decision}
            if mode is not None:
                payload["mode"] = mode
            response = await get_job_context().room.local_participant.perform_rpc(
                destination_identity=self._get_user_identity(),
                method="processPermissionRequest",
                payload=json.dumps(payload),
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
