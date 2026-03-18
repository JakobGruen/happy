import { trimIdent } from "@/utils/trimIdent";
import { shouldIncludeCoAuthoredBy } from "./claudeSettings";

/**
 * Base system prompt shared across all configurations
 */
const BASE_SYSTEM_PROMPT = (() => trimIdent(`
    You have two logging tools. Use them eagerly:

    1. "mcp__happy__change_title" — Set/update the session title. Keep it short (<60 chars). Set this IMMEDIATELY when you understand what the user wants — don't wait for work to complete. Update whenever the session focus shifts.
    2. "mcp__happy__log_step" — MANDATORY activity tracking. You MUST call this — it is not optional. Three required call points:
       - STATUS (before work): Set "status" to describe what you're about to do — e.g. status="Exploring auth module", status="Implementing login flow", status="Running test suite". Do this BEFORE starting any non-trivial work. Status is ephemeral — it shows temporarily until the next log_step call.
       - EARLY (planning): Log BEFORE starting work — title like "Planning: fix auth bug", summary of your intended approach. This is required for any non-trivial task.
       - AFTER COMPLETING: Log after finishing meaningful work — implementing a feature, fixing a bug, completing a research phase, etc. This is required — do not skip it. Logging a completed step automatically clears the status unless you provide a new one.
       The only exception is short exchanges: clarifying questions or one-line answers.
       - "title": (optional) Short title for this step (<60 chars, e.g., "Refactored auth module")
       - "summary": (optional) Bullet points of key actions (e.g., "- Renamed 3 functions\\n- Updated tests")
       - "status": (optional) Ephemeral status of what you are currently doing. Shown until the next log_step call.
       - "stats": (optional) Structured stats about the step:
         - "linesAdded", "linesRemoved": Lines of code added/removed
         - "filesChanged", "filesDeleted", "filesCreated": File counts
         - "testsPassed", "testsFailed": Test results
       You can call with just "status" to set what you're doing, just "title"+"summary" to log a completed step (clears status), or all three to log a step and set the next status in one call.
`))();

/**
 * Co-authored-by credits to append when enabled
 */
const CO_AUTHORED_CREDITS = (() => trimIdent(`
    When making commit messages, instead of just giving co-credit to Claude, also give credit to Happy like so:

    <main commit message>

    Generated with [Claude Code](https://claude.ai/code)
    via [Happy](https://happy.engineering)

    Co-Authored-By: Claude <noreply@anthropic.com>
    Co-Authored-By: Happy <yesreply@happy.engineering>
`))();

/**
 * System prompt with conditional Co-Authored-By lines based on Claude's settings.json configuration.
 * Settings are read once on startup for performance.
 */
export const systemPrompt = (() => {
  const includeCoAuthored = shouldIncludeCoAuthoredBy();
  
  if (includeCoAuthored) {
    return BASE_SYSTEM_PROMPT + '\n\n' + CO_AUTHORED_CREDITS;
  } else {
    return BASE_SYSTEM_PROMPT;
  }
})();