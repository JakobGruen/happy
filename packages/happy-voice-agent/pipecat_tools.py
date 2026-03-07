"""
Function tool definitions for the Pipecat voice agent.
All 8 tools forward to the client via RTVI protocol.
"""

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema


def get_tools() -> ToolsSchema:
    """Return tool definitions for the voice agent using Pipecat's universal schema."""
    return ToolsSchema(standard_tools=[
        FunctionSchema(
            name="message_claude_code",
            description=(
                "Send a message to Claude Code in the active session. "
                "The message should be a clean, well-structured prompt — not raw speech. "
                "Use clear plain text for simple requests, XML tags for complex or multi-step requests. "
                "Focus on WHAT and WHY — let Claude Code decide HOW."
            ),
            properties={
                "message": {
                    "type": "string",
                    "description": "The message to send to Claude Code.",
                }
            },
            required=["message"],
        ),
        FunctionSchema(
            name="process_permission_request",
            description=(
                "Allow or deny a pending permission request from Claude Code."
            ),
            properties={
                "decision": {
                    "type": "string",
                    "enum": ["allow", "deny"],
                    "description": "Must be 'allow' or 'deny'.",
                },
                "mode": {
                    "type": "string",
                    "enum": [
                        "default",
                        "acceptEdits",
                        "bypassPermissions",
                        "plan",
                    ],
                    "description": "Optional permission mode to switch to.",
                },
            },
            required=["decision"],
        ),
        FunctionSchema(
            name="abort_claude_code",
            description=(
                "Interrupt whatever Claude Code is currently doing. The session stays alive. "
                "Use when the user says stop, cancel, abort, hold on, never mind, wait, etc. "
                "Call immediately — do not ask for confirmation."
            ),
            properties={},
            required=[],
        ),
        FunctionSchema(
            name="switch_mode",
            description=(
                "Switch the permission mode for Claude Code. This controls how permissions "
                "are handled going forward. "
                "'default' — ask for permission on every tool use. "
                "'acceptEdits' — auto-approve file edits, still ask for bash commands. "
                "'bypassPermissions' — auto-approve everything. "
                "'plan' — enter plan-only mode (read/propose, no edits until approved)."
            ),
            properties={
                "mode": {
                    "type": "string",
                    "enum": [
                        "default",
                        "acceptEdits",
                        "bypassPermissions",
                        "plan",
                    ],
                    "description": "The mode to switch to.",
                }
            },
            required=["mode"],
        ),
        FunctionSchema(
            name="run_slash_command",
            description=(
                "Run a slash command in Claude Code (e.g. commit, review-pr, compact, clear). "
                "Use the available commands from the session context updates."
            ),
            properties={
                "command": {
                    "type": "string",
                    "description": "The command name without the / prefix (e.g. 'commit', 'review-pr').",
                },
                "args": {
                    "type": "string",
                    "description": "Optional arguments for the command.",
                },
            },
            required=["command"],
        ),
        FunctionSchema(
            name="answer_single_question",
            description=(
                "Answer ONE question from Claude Code's multi-choice question set. "
                "The response will contain either the next question or a summary for confirmation."
            ),
            properties={
                "question_index": {
                    "type": "integer",
                    "description": "0-based index of the question.",
                },
                "header": {
                    "type": "string",
                    "description": "The question header/category.",
                },
                "selected_labels": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "The label(s) the user chose. Use 'Other: <text>' for custom answers.",
                },
            },
            required=["question_index", "header", "selected_labels"],
        ),
        FunctionSchema(
            name="confirm_question_answers",
            description=(
                "Confirm and submit all answered questions to Claude Code. "
                "Call this after reading the summary to the user and they confirm."
            ),
            properties={},
            required=[],
        ),
        FunctionSchema(
            name="reject_question_answers",
            description=(
                "Reject all answers and restart from question 1. "
                "Call this when the user wants to redo their choices."
            ),
            properties={},
            required=[],
        ),
    ])


# Mapping from Pipecat tool names (snake_case) to client-side names (camelCase).
# The client's realtimeClientTools uses camelCase names.
TOOL_NAME_TO_CLIENT = {
    "message_claude_code": "messageClaudeCode",
    "process_permission_request": "processPermissionRequest",
    "abort_claude_code": "abortClaudeCode",
    "switch_mode": "switchMode",
    "run_slash_command": "runSlashCommand",
    "answer_single_question": "answerSingleQuestion",
    "confirm_question_answers": "confirmQuestionAnswers",
    "reject_question_answers": "rejectQuestionAnswers",
}

# Reverse mapping for receiving results from client
CLIENT_TO_TOOL_NAME = {v: k for k, v in TOOL_NAME_TO_CLIENT.items()}
