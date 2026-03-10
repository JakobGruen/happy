import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/ui/logger';

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 80;

/**
 * Build the prompt for summarizing a single permission request.
 */
export function buildPermissionSummaryPrompt(
    tool: string,
    args: Record<string, unknown>,
    description?: string | null,
): string {
    const argsSummary = formatArgs(tool, args);
    const descLine = description ? `\nDescription: ${description}` : '';
    return (
        `Tool: ${tool}\nArguments: ${argsSummary}${descLine}\n\n` +
        `In one short sentence (under 80 chars), describe what this AI coding agent is about to do. ` +
        `Be specific about the file/command/action. No preamble, just the sentence.`
    );
}

/**
 * Build the prompt for summarizing what CC accomplished in a turn.
 */
export function buildTurnSummaryPrompt(
    userMessage: string,
    toolCalls: Array<{ tool: string; description?: string | null }>,
): string {
    const toolLines = toolCalls.length > 0
        ? toolCalls.map(t => `- ${t.tool}${t.description ? ': ' + t.description : ''}`).join('\n')
        : '(no tool calls)';
    return (
        `User asked: "${userMessage.slice(0, 200)}"\n` +
        `Tools used:\n${toolLines}\n\n` +
        `In one short sentence (under 80 chars), summarize what the AI coding agent accomplished. ` +
        `Use past tense. No preamble, just the sentence.`
    );
}

/**
 * Format tool arguments to a short readable string.
 */
function formatArgs(tool: string, args: Record<string, unknown>): string {
    if (tool === 'Bash' && typeof args.command === 'string') {
        return args.command.slice(0, 300);
    }
    if (typeof args.file_path === 'string') {
        return args.file_path;
    }
    if (typeof args.path === 'string') {
        return args.path;
    }
    return JSON.stringify(args).slice(0, 200);
}

/**
 * Call Haiku to generate a permission request summary.
 * Returns null on error (caller falls back to existing description).
 */
export async function generatePermissionSummary(
    tool: string,
    args: Record<string, unknown>,
    description?: string | null,
): Promise<string | null> {
    try {
        const client = new Anthropic();
        const prompt = buildPermissionSummaryPrompt(tool, args, description);
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [{ role: 'user', content: prompt }],
        });
        const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('')
            .trim();
        return text || null;
    } catch (err) {
        logger.debug('[summarizer] generatePermissionSummary failed:', err);
        return null;
    }
}

/**
 * Call Haiku to generate a turn completion summary.
 * Returns null on error (caller skips metadata update).
 */
export async function generateTurnSummary(
    userMessage: string,
    toolCalls: Array<{ tool: string; description?: string | null }>,
): Promise<string | null> {
    try {
        const client = new Anthropic();
        const prompt = buildTurnSummaryPrompt(userMessage, toolCalls);
        const response = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            messages: [{ role: 'user', content: prompt }],
        });
        const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('')
            .trim();
        return text || null;
    } catch (err) {
        logger.debug('[summarizer] generateTurnSummary failed:', err);
        return null;
    }
}
