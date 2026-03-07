import logging
import json
import asyncio
import os

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
from livekit.plugins import anthropic, silero
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
You have two distinct communication modes:

**To the user** — you speak in natural, conversational language. Short sentences, plain speech,
no formatting. You are a friendly voice assistant.

**To Claude Code** — you are a prompt engineer. You transform the user's spoken words into clean,
well-structured prompts. Strip filler words, preserve technical terms, capture intent precisely.

Core rules:
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

The user can change how permissions are handled via voice commands.
Use switch_mode to change the permission mode directly — no pending permission required.

**Available modes:**

"Accept all edits" / "Auto-approve edits":
- Call switch_mode with mode='acceptEdits'.
- After this, file edit permissions are auto-approved. Still asks about bash commands.

"Approve everything" / "Bypass permissions" / "Don't ask me":
- Call switch_mode with mode='bypassPermissions'.
- After this, all permissions are auto-approved.

"Back to default" / "Ask me again" / "Reset permissions":
- Call switch_mode with mode='default'.
- Returns to asking permission for every tool use.

"Enter planning mode" / "Switch to plan mode":
- Call switch_mode with mode='plan'.
- Claude enters plan-only mode: reads code and proposes changes but doesn't edit.

If the user requests a mode switch AND there is a pending permission request,
handle BOTH: call switch_mode for the mode change, then call
processPermissionRequest to allow/deny the pending request.

When a mode is active and a matching permission request arrives, auto-approve it
immediately without asking the user. Tell the user what you approved.

# Abort / Interrupt

When the user wants to stop what Claude Code is currently doing, call abort_claude_code immediately.
Do NOT ask for confirmation — just do it.

Trigger phrases: "Stop", "Cancel", "Abort", "Hold on", "Never mind", "Wait", "Stop that",
"Cancel that", "Halt", "Enough"

After aborting, briefly confirm: "Stopped." or "Claude has stopped."
The session stays alive — Claude waits for the next instruction.

# Slash Commands

Slash commands are special directives for Claude Code (like /commit, /review-pr, /compact).
The available commands are listed in context updates at session start.

When the user wants to run a slash command, call run_slash_command with the command name.
Map natural language to the right command:
- "Commit the changes" / "Make a commit" → run_slash_command(command="commit")
- "Review the PR" → run_slash_command(command="review-pr")
- "Compact the conversation" → run_slash_command(command="compact")
- "Clear the conversation" → run_slash_command(command="clear")

Only use commands from the available list provided in context.

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

# Prompt Formatting

When calling messageClaudeCode, structure the message for Claude Code:
- Simple requests → clean plain text
- Complex or multi-step requests → use XML tags (<task>, <context>, <constraints>)
- Focus on WHAT and WHY — let Claude Code decide HOW
- Reference specific files/paths when the user mentions them

# Answering Questions from Claude Code

Questions arrive ONE AT A TIME via the sequential voice flow:

1. You receive a single question with lettered options (A, B, C, etc.) and an "Other" option.
2. Read the question and options aloud.
   Example: "Claude is asking: Which database? A, PostgreSQL. B, SQLite. C, MySQL. Or choose Other."
3. Wait for the user's spoken choice.
4. Map their answer to the option label(s). Users might say the letter, the label, or describe it.
   If their answer doesn't match any listed option, use "Other: <their exact words>" as the label.
5. Call answer_single_question with questionIndex, header, and selectedLabels from the message.
6. The response will be either:
   - The NEXT question → read it aloud, repeat from step 2
   - A SUMMARY of all answers → read the summary and ask "Should I submit these answers?"
7. If the user confirms → call confirm_question_answers
8. If the user wants to redo → call reject_question_answers (restarts from question 1)

For multi-select questions, collect all choices before calling answer_single_question.
If the user's answer is ambiguous, ask for clarification: "Did you mean A or B?"

IMPORTANT: Do NOT use processPermissionRequest for AskUserQuestion — use the sequential tools instead.

# Proactive Updates

You will sometimes be triggered to speak proactively — without the user asking first.
This happens in two situations:

**Turn Complete**: Claude Code finished its current task. You receive this as a proactive trigger.
- Summarize what Claude accomplished in 1-2 sentences based on your accumulated context.
- Ask the user what they'd like to do next.
- Examples:
  - "Claude finished updating the login component and the tests pass. What's next?"
  - "Done. Claude added the new API endpoint with tests. Need anything else?"

**Progress Update**: Claude Code is still working but there's been significant activity.
- Give a brief 1-sentence status update based on the recent activity summary you receive.
- Don't repeat what you've already reported.
- Examples:
  - "Claude is now running the test suite."
  - "Still working — Claude is refactoring the auth module."

Keep proactive speech short, natural, and conversational. The user can always interrupt you."""


class HappyAgent(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=SYSTEM_PROMPT)
        self._stt_paused = False

    def _pause_stt(self):
        """Disable audio input to stop Deepgram STT billing during idle."""
        if self._stt_paused:
            return
        self._stt_paused = True
        self.session.input.set_audio_enabled(False)
        logger.info("STT paused — user idle")

    def _resume_stt(self):
        """Re-enable audio input to resume STT transcription."""
        if not self._stt_paused:
            return
        self._stt_paused = False
        self.session.input.set_audio_enabled(True)
        logger.info("STT resumed")

    def _on_user_state_changed(self, ev):
        """Pause STT when user goes idle, resume when they come back."""
        if ev.new_state == "away" and not self._stt_paused:
            self._pause_stt()
        elif ev.old_state == "away" and self._stt_paused:
            self._resume_stt()

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
            "happy.context",
            lambda reader, pid: asyncio.create_task(_handle_context(reader, pid)),
        )

        # Listen for immediate updates (permission requests, questions)
        # These require the agent to speak proactively — generate_reply triggers speech
        async def _handle_chat(reader, participant_identity):
            text = await reader.read_all()
            if text:
                logger.info(f"Chat update from {participant_identity}: {text[:200]}")
                # Resume STT before speaking — user will need to respond
                self._resume_stt()
                chat_ctx = self.chat_ctx.copy()
                chat_ctx.add_message(role="system", content=text)
                await self.update_chat_ctx(chat_ctx)
                # Trigger proactive speech for chat messages (permissions, questions)
                self.session.generate_reply()

        room.register_text_stream_handler(
            "happy.chat",
            lambda reader, pid: asyncio.create_task(_handle_chat(reader, pid)),
        )

        # Listen for proactive speech triggers (turn complete, progress updates)
        # These are NOT added to chat context — just trigger ephemeral speech via instructions
        async def _handle_trigger(reader, participant_identity):
            text = await reader.read_all()
            if not text:
                return
            logger.info(f"Trigger from {participant_identity}: {text[:200]}")
            try:
                trigger = json.loads(text)
            except json.JSONDecodeError:
                logger.warning(f"Invalid trigger JSON: {text[:100]}")
                return

            trigger_type = trigger.get("type")

            # Resume STT before speaking — user may want to respond
            self._resume_stt()

            if trigger_type == "turn_complete":
                self.session.generate_reply(
                    instructions=(
                        "Claude Code just finished working. Based on the context you have, "
                        "give the user a brief 1-2 sentence summary of what Claude accomplished "
                        "and ask if they need anything else. Be concise and natural."
                    ),
                    allow_interruptions=True,
                )
            elif trigger_type == "progress_update":
                summary = trigger.get("summary", "Claude is still working.")
                self.session.generate_reply(
                    instructions=(
                        f"Claude Code is still working. Recent activity: {summary}. "
                        "Give the user a very brief 1-sentence progress update. "
                        "Be concise — just the key point of what's happening now."
                    ),
                    allow_interruptions=True,
                )

        room.register_text_stream_handler(
            "happy.trigger",
            lambda reader, pid: asyncio.create_task(_handle_trigger(reader, pid)),
        )

        # Pause STT when user goes idle to save Deepgram transcription costs
        self.session.on("user_state_changed", self._on_user_state_changed)

        self.session.generate_reply(allow_interruptions=False)

    def _get_user_identity(self) -> str:
        room = get_job_context().room
        participants = list(room.remote_participants.keys())
        if not participants:
            raise ToolError("No user connected to the room")
        return participants[0]

    @function_tool
    async def message_claude_code(self, context: RunContext, message: str):
        """Send a message to Claude Code in the active session.
        The message should be a clean, well-structured prompt — not raw speech.

        Args:
            message: The message to send. Use clear plain text for simple requests,
                     XML tags for complex or multi-step requests.
                     Focus on WHAT and WHY — let Claude Code decide HOW.
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

        Args:
            decision: Must be 'allow' or 'deny'.
        """
        if decision not in ("allow", "deny"):
            raise ToolError("Decision must be 'allow' or 'deny'")
        valid_modes = ("default", "acceptEdits", "bypassPermissions", "plan")
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

    @function_tool
    async def abort_claude_code(self, context: RunContext):
        """Interrupt whatever Claude Code is currently doing. The session stays alive.
        Use when the user says stop, cancel, abort, hold on, never mind, wait, etc.
        Call immediately — do not ask for confirmation.
        """
        try:
            response = await get_job_context().room.local_participant.perform_rpc(
                destination_identity=self._get_user_identity(),
                method="abortClaudeCode",
                payload="{}",
                response_timeout=10.0,
            )
            return response
        except Exception as e:
            logger.error(f"Failed to abort: {e}")
            raise ToolError("Failed to abort Claude Code")

    @function_tool
    async def switch_mode(self, context: RunContext, mode: str):
        """Switch the permission mode for Claude Code. This controls how permissions
        are handled going forward.

        Args:
            mode: The mode to switch to:
                  'default' — ask for permission on every tool use
                  'acceptEdits' — auto-approve file edits, still ask for bash commands
                  'bypassPermissions' — auto-approve everything
                  'plan' — enter plan-only mode (read/propose, no edits until approved)
        """
        valid_modes = ('default', 'acceptEdits', 'bypassPermissions', 'plan')
        if mode not in valid_modes:
            raise ToolError(f"Mode must be one of: {', '.join(valid_modes)}")
        try:
            response = await get_job_context().room.local_participant.perform_rpc(
                destination_identity=self._get_user_identity(),
                method="switchMode",
                payload=json.dumps({"mode": mode}),
                response_timeout=10.0,
            )
            return response
        except Exception as e:
            logger.error(f"Failed to switch mode: {e}")
            raise ToolError(f"Failed to switch to {mode} mode")

    @function_tool
    async def run_slash_command(
        self, context: RunContext, command: str, args: str | list[str] | None = None
    ):
        """Run a slash command in Claude Code (e.g. commit, review-pr, compact, clear).
        Use the available commands from the session context updates.

        Args:
            command: The command name without the / prefix (e.g. "commit", "review-pr").
            args: Optional arguments for the command. A string is appended directly,
                  a list of strings is quoted and joined (e.g. ["arg1", "arg2"] becomes
                  "arg1" "arg2").
        """
        if not command or not command.strip():
            raise ToolError("Command name cannot be empty")
        clean_command = command.strip().lstrip("/")
        message = f"/{clean_command}"
        if args is not None:
            if isinstance(args, list):
                quoted = " ".join(f'"{a}"' for a in args)
                message = f"{message} {quoted}"
            else:
                message = f"{message} {args}"
        try:
            response = await get_job_context().room.local_participant.perform_rpc(
                destination_identity=self._get_user_identity(),
                method="messageClaudeCode",
                payload=json.dumps({"message": message}),
                response_timeout=10.0,
            )
            return response
        except Exception as e:
            logger.error(f"Failed to run slash command /{clean_command}: {e}")
            raise ToolError(f"Failed to run /{clean_command}")

    @function_tool
    async def answer_single_question(
        self,
        context: RunContext,
        question_index: int,
        header: str,
        selected_labels: list[str],
    ):
        """Answer ONE question from Claude Code's multi-choice question set.
        The response will contain either the next question or a summary for confirmation.

        Args:
            question_index: 0-based index of the question (provided in the question text).
            header: The question header/category (e.g. "Database", "Focus area").
            selected_labels: The label(s) the user chose. Use "Other: <text>" for custom answers.
        """
        if not selected_labels or not isinstance(selected_labels, list):
            raise ToolError("selected_labels must be a non-empty list")
        if not header:
            raise ToolError("header is required")
        try:
            response = await get_job_context().room.local_participant.perform_rpc(
                destination_identity=self._get_user_identity(),
                method="answerSingleQuestion",
                payload=json.dumps({
                    "questionIndex": question_index,
                    "header": header,
                    "selectedLabels": selected_labels,
                }),
                response_timeout=10.0,
            )
            return response
        except Exception as e:
            logger.error(f"Failed to submit single answer: {e}")
            raise ToolError("Failed to submit answer")

    @function_tool
    async def confirm_question_answers(self, context: RunContext):
        """Confirm and submit all answered questions to Claude Code.
        Call this after reading the summary to the user and they confirm.
        """
        try:
            response = await get_job_context().room.local_participant.perform_rpc(
                destination_identity=self._get_user_identity(),
                method="confirmQuestionAnswers",
                payload="{}",
                response_timeout=10.0,
            )
            return response
        except Exception as e:
            logger.error(f"Failed to confirm answers: {e}")
            raise ToolError("Failed to confirm answers")

    @function_tool
    async def reject_question_answers(self, context: RunContext):
        """Reject all answers and restart from question 1.
        Call this when the user wants to redo their choices.
        """
        try:
            response = await get_job_context().room.local_participant.perform_rpc(
                destination_identity=self._get_user_identity(),
                method="rejectQuestionAnswers",
                payload="{}",
                response_timeout=10.0,
            )
            return response
        except Exception as e:
            logger.error(f"Failed to reject answers: {e}")
            raise ToolError("Failed to reject answers")


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    session = AgentSession(
        stt="deepgram/nova-3:multi",
        llm=anthropic.LLM(
            model=os.environ.get("VOICE_AGENT_MODEL", "claude-haiku-4-5-20251001"),
            caching="ephemeral",
        ),
        tts="cartesia/sonic-3:f786b574-daa5-4673-aa0c-cbe3e8534c02",
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        # After this timeout of mutual silence, user state → "away" and STT pauses
        user_away_timeout=15.0,
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
