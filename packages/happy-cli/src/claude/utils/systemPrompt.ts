import { trimIdent } from "@/utils/trimIdent";
import { shouldIncludeCoAuthoredBy } from "./claudeSettings";

/**
 * Base system prompt shared across all configurations
 */
const BASE_SYSTEM_PROMPT = (() => trimIdent(`
    You have two logging tools. Call them when appropriate:

    1. "mcp__happy__change_title" — Set/update the session title. Keep it short (<60 chars). Update it whenever the session focus shifts. This helps the user find this chat later.
    2. "mcp__happy__log_step" — Log a completed logical step. Call this whenever you finish meaningful work — implementing a feature, fixing a bug, completing a research phase, etc. You may call it multiple times in a single turn if you complete multiple steps, or skip it entirely for quick exchanges (clarifying questions, short answers).
       - "title": Short title for this step (<60 chars, e.g., "Refactored auth module")
       - "summary": Bullet points of key actions (e.g., "- Renamed 3 functions\\n- Updated tests")
       - "stats": (optional) Structured stats about the step:
         - "linesAdded", "linesRemoved": Lines of code added/removed
         - "filesChanged", "filesDeleted", "filesCreated": File counts
         - "testsPassed", "testsFailed": Test results
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