import { Session } from "@/sync/storageTypes";
import { Message } from "@/sync/typesMessage";
import { trimIdent } from "@/utils/trimIdent";
import { VOICE_CONFIG } from "../voiceConfig";

interface LogStep {
    title: string;
    summary: string;
    stats?: {
        linesAdded?: number;
        linesRemoved?: number;
        filesChanged?: number;
        filesCreated?: number;
        filesDeleted?: number;
        testsPassed?: number;
        testsFailed?: number;
    };
    createdAt: number;
}

export function formatLogSteps(logSteps: Record<string, LogStep> | undefined): string {
    if (!logSteps || Object.keys(logSteps).length === 0) {
        return 'No activity logged yet.';
    }
    const sorted = Object.entries(logSteps)
        .sort(([a], [b]) => Number(a) - Number(b));

    const lines: string[] = [];
    for (const [key, step] of sorted) {
        let line = `[Step ${key}] ${step.title}`;
        if (step.summary) {
            const bullets = step.summary
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean)
                .map(l => `  ${l}`)
                .join('\n');
            line += '\n' + bullets;
        }
        if (step.stats) {
            const parts: string[] = [];
            if (step.stats.linesAdded) parts.push(`+${step.stats.linesAdded}`);
            if (step.stats.linesRemoved) parts.push(`-${step.stats.linesRemoved}`);
            if (step.stats.filesChanged) parts.push(`${step.stats.filesChanged} files`);
            if (step.stats.testsPassed) parts.push(`${step.stats.testsPassed} tests passed`);
            if (step.stats.testsFailed) parts.push(`${step.stats.testsFailed} tests failed`);
            if (parts.length > 0) line += `\n  (${parts.join(', ')})`;
        }
        lines.push(line);
    }
    return lines.join('\n\n');
}

export function formatNewLogSteps(
    sessionId: string,
    newSteps: Record<string, LogStep>
): string {
    const formatted = formatLogSteps(newSteps);
    return `New activity in session ${sessionId}:\n\n${formatted}`;
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '…[truncated]';
}

interface SessionMetadata {
    summary?: { text?: string };
    path?: string;
    machineId?: string;
    homeDir?: string;
    [key: string]: any;
}


/**
 * Format a permission request for natural language context
 */
export function formatPermissionRequest(
    sessionId: string,
    requestId: string,
    toolName: string,
    toolArgs: any
): string {
    const argsStr = truncate(JSON.stringify(toolArgs), VOICE_CONFIG.MAX_PERMISSION_ARGS_LENGTH);
    return trimIdent(`
        Claude Code is requesting permission to use ${toolName} (session ${sessionId}):
        <request_id>${requestId}</request_id>
        <tool_name>${toolName}</tool_name>
        <tool_args>${argsStr}</tool_args>
    `);
}

//
// Message formatting
//

export function formatMessage(message: Message): string | null {

    // Lines
    const maxLen = VOICE_CONFIG.MAX_TOOL_TEXT_LENGTH;
    let lines: string[] = [];
    if (message.kind === 'agent-text') {
        lines.push(`Claude Code: \n<text>${message.text}</text>`);
    } else if (message.kind === 'user-text') {
        lines.push(`User sent message: \n<text>${message.text}</text>`);
    } else if (message.kind === 'tool-call' && !VOICE_CONFIG.DISABLE_TOOL_CALLS) {
        const toolDescription = message.tool.description
            ? ` - ${truncate(message.tool.description, maxLen)}`
            : '';
        if (VOICE_CONFIG.LIMITED_TOOL_CALLS) {
            if (message.tool.description) {
                lines.push(`Claude Code is using ${message.tool.name}${toolDescription}`);
            }
        } else {
            const argsStr = truncate(JSON.stringify(message.tool.input), maxLen);
            lines.push(`Claude Code is using ${message.tool.name}${toolDescription} with arguments: <arguments>${argsStr}</arguments>`);
        }
    }
    if (lines.length === 0) {
        return null;
    }
    return lines.join('\n\n');
}

export function formatNewSingleMessage(sessionId: string, message: Message): string | null {
    let formatted = formatMessage(message);
    if (!formatted) {
        return null;
    }
    return 'New message in session: ' + sessionId + '\n\n' + formatted;
}

export function formatNewMessages(sessionId: string, messages: Message[]): string | null {
    let formatted = [...messages].sort((a, b) => a.createdAt - b.createdAt).map(formatMessage).filter(Boolean);
    if (formatted.length === 0) {
        return null;
    }
    return 'New messages in session: ' + sessionId + '\n\n' + formatted.join('\n\n');
}

export function formatHistory(sessionId: string, messages: Message[]): string {
    let messagesToFormat = VOICE_CONFIG.MAX_HISTORY_MESSAGES > 0
        ? messages.slice(0, VOICE_CONFIG.MAX_HISTORY_MESSAGES)
        : messages;
    let formatted = messagesToFormat.map(formatMessage).filter(Boolean);
    return 'History of messages in session: ' + sessionId + '\n\n' + formatted.join('\n\n');
}

//
// Session states
//

export function formatSessionFull(session: Session, _messages: Message[]): string {
    const sessionName = session.metadata?.summary?.text;
    const sessionPath = session.metadata?.path;
    const logSteps = session.metadata?.logSteps;
    const hasLogSteps = logSteps && Object.keys(logSteps).length > 0;
    const lines: string[] = [];

    lines.push(`# Session: ${session.id}`);
    lines.push(`Project path: ${sessionPath}`);
    if (sessionName) {
        lines.push(`Session title: ${sessionName}`);
    }

    lines.push('## Session History');
    if (hasLogSteps) {
        lines.push('This is the COMPLETE activity history for this session. You do not receive full messages — only these log steps. Use them to understand what has happened so far.');
        lines.push(formatLogSteps(logSteps));
    } else {
        lines.push('This is a fresh session with no prior activity.');
    }

    return lines.join('\n\n');
}

export function formatSessionOffline(sessionId: string, metadata?: SessionMetadata): string {
    return `Session went offline: ${sessionId}`;
}

export function formatSessionOnline(sessionId: string, metadata?: SessionMetadata): string {
    return `Session came online: ${sessionId}`;
}

export function formatSessionFocus(sessionId: string, metadata?: SessionMetadata): string {
    return `Session became focused: ${sessionId}`;
}

export function formatReadyEvent(sessionId: string): string {
    return `Claude Code done working in session: ${sessionId}. The previous message(s) are the summary of the work done. Report this to the human immediately.`;
}