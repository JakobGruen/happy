/**
 * Message to Event Parser
 *
 * This module provides functionality to parse certain messages and convert them
 * to events. Messages that match specific patterns can be transformed into events
 * which will skip normal message processing phases and be handled as events instead.
 */

import { NormalizedMessage } from "../typesRaw";
import { AgentEvent } from "../typesRaw";

interface TodoItem {
    content: string;
    status: string;
    id?: string;
}

export interface TodoEventContext {
    prevTodos?: TodoItem[];
}

const STATUS_ICONS: Record<string, string> = {
    pending: '☐',
    in_progress: '🔄',
    completed: '✅',
};

function formatTodoDelta(currentTodos: TodoItem[], prevTodos?: TodoItem[]): string | null {
    if (currentTodos.length === 0) return null;

    if (!prevTodos || prevTodos.length === 0) {
        const lines = currentTodos.map(t => `${STATUS_ICONS[t.status] || '☐'} ${t.content}`);
        return `📋 Todo created:\n${lines.join('\n')}`;
    }

    const prevById = new Map<string, TodoItem>();
    const prevByContent = new Map<string, TodoItem>();
    for (const t of prevTodos) {
        if (t.id) prevById.set(t.id, t);
        prevByContent.set(t.content, t);
    }

    const changes: string[] = [];
    const matchedPrevIds = new Set<string>();
    const matchedPrevContents = new Set<string>();

    for (const curr of currentTodos) {
        const prev = (curr.id ? prevById.get(curr.id) : undefined) || prevByContent.get(curr.content);
        if (prev) {
            if (prev.id) matchedPrevIds.add(prev.id);
            matchedPrevContents.add(prev.content);

            if (curr.status !== prev.status && curr.content !== prev.content) {
                changes.push(`${STATUS_ICONS[curr.status] || '☐'} ${curr.content}`);
            } else if (curr.status !== prev.status) {
                if (curr.status === 'completed') {
                    changes.push(`✅ ${curr.content}`);
                } else if (curr.status === 'in_progress') {
                    changes.push(`🔄 ${curr.content}`);
                } else {
                    changes.push(`${STATUS_ICONS[curr.status] || '☐'} ${curr.content}`);
                }
            } else if (curr.content !== prev.content) {
                changes.push(`📝 Updated: "${curr.content}"`);
            }
        } else {
            changes.push(`📋 Added: "${curr.content}"`);
        }
    }

    for (const prev of prevTodos) {
        const wasMatched = (prev.id && matchedPrevIds.has(prev.id)) || matchedPrevContents.has(prev.content);
        if (!wasMatched) {
            changes.push(`❌ Removed: "${prev.content}"`);
        }
    }

    if (changes.length === 0) return null;

    if (changes.length === 1) {
        const change = changes[0];
        if (change.startsWith('✅ ') && !change.includes('"')) {
            const content = change.slice('✅ '.length);
            return `✅ Completed: "${content}"`;
        }
        if (change.startsWith('🔄 ') && !change.includes('"')) {
            const content = change.slice('🔄 '.length);
            return `🔄 Started: "${content}"`;
        }
        return change;
    }

    return `📋 Todo updated:\n${changes.join('\n')}`;
}

/**
 * Parses a normalized message to determine if it should be converted to an event.
 *
 * @param msg - The normalized message to parse
 * @param context - Optional context for TodoWrite diff computation
 * @returns An AgentEvent if the message should be converted, null otherwise
 *
 * Examples of messages that could be converted to events:
 * - User messages with special commands (e.g., "/switch mode")
 * - Agent messages with specific tool results
 * - Messages with certain metadata flags
 */
export function parseMessageAsEvent(msg: NormalizedMessage, context?: TodoEventContext): AgentEvent | null {
    // Skip sidechain messages
    if (msg.isSidechain) {
        return null;
    }

    // Check for agent messages that should become events
    if (msg.role === 'agent') {
        for (const content of msg.content) {
            // Check for Claude AI usage limit messages
            if (content.type === 'text') {
                const limitMatch = content.text.match(/^Claude AI usage limit reached\|(\d+)$/);
                if (limitMatch) {
                    const timestamp = parseInt(limitMatch[1], 10);
                    if (!isNaN(timestamp)) {
                        return {
                            type: 'limit-reached',
                            endsAt: timestamp
                        } as AgentEvent;
                    }
                }

            }

            // Check for mcp__happy__change_title tool calls
            if (content.type === 'tool-call' && content.name === 'mcp__happy__change_title') {
                const title = content.input?.title;
                if (typeof title === 'string') {
                    return {
                        type: 'message',
                        message: `✏️ Title changed: "${title}"`,
                    } as AgentEvent;
                }
            }

            // Check for mcp__happy__log_step tool calls
            if (content.type === 'tool-call' && content.name === 'mcp__happy__log_step') {
                const title = content.input?.title;
                if (typeof title === 'string') {
                    return {
                        type: 'message',
                        message: `📋 Step logged: "${title}"`,
                    } as AgentEvent;
                }
            }

            // Check for TodoWrite tool calls — convert to inline diff note
            if (content.type === 'tool-call' && content.name === 'TodoWrite') {
                const todos = content.input?.todos;
                if (Array.isArray(todos)) {
                    const formatted = formatTodoDelta(todos, context?.prevTodos);
                    if (formatted) {
                        return {
                            type: 'message',
                            message: formatted,
                        } as AgentEvent;
                    }
                }
                // Empty todos or no-change: return empty event to suppress the tool bubble
                return {
                    type: 'message',
                    message: '',
                } as AgentEvent;
            }
        }
    }

    // Additional parsing logic can be added here
    // For example, checking specific metadata patterns or other message types

    // No event conversion needed
    return null;
}
