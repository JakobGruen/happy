/**
 * Parses a user message to detect if it's a skill/command expansion.
 *
 * Command messages from Claude Code contain XML-like tags:
 *   <command-message>feature-dev:feature-dev</command-message>
 *   <command-name>/feature-dev:feature-dev</command-name>
 *   # Feature Development
 *   ... full prompt text ...
 */

interface ParsedCommandMessage {
    /** Display name, e.g. "/feature-dev" */
    commandName: string;
    /** The full prompt body after the tags */
    commandBody: string;
}

const COMMAND_NAME_RE = /<command-name>\s*(.*?)\s*<\/command-name>/;

export function parseCommandMessage(text: string): ParsedCommandMessage | null {
    const match = text.match(COMMAND_NAME_RE);
    if (!match) {
        return null;
    }

    const rawName = match[1].trim();
    // Clean up: "feature-dev:feature-dev" → "/feature-dev", "/feature-dev:feature-dev" → "/feature-dev"
    let commandName = rawName;
    const colonIdx = rawName.indexOf(':');
    if (colonIdx !== -1) {
        // Take the part before the colon, or the part with "/" if present
        const before = rawName.substring(0, colonIdx);
        const after = rawName.substring(colonIdx + 1);
        commandName = before.startsWith('/') ? before : after.startsWith('/') ? after : `/${before}`;
    }
    if (!commandName.startsWith('/')) {
        commandName = `/${commandName}`;
    }

    // Body is everything after the closing </command-name> tag
    const tagEnd = text.indexOf('</command-name>');
    const body = tagEnd !== -1
        ? text.substring(tagEnd + '</command-name>'.length).trim()
        : '';

    return { commandName, commandBody: body };
}
