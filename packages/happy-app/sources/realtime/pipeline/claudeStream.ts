/**
 * Claude Haiku SSE streaming.
 * - Web: uses global fetch + ReadableStream
 * - Native: uses expo/fetch (see claudeStream.native.ts)
 *
 * Exports pure parsing functions (tested) and the streaming generator.
 */

// --- Types ---

export type StreamEvent =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, any> }
    | { type: 'input_json_delta'; delta: string }
    | { type: 'done' }
    | { type: 'error'; error: string };

// --- Pure parsing functions (tested) ---

/**
 * Parse a raw SSE chunk (potentially multiple events) into StreamEvents.
 */
export function parseSSEChunk(chunk: string): StreamEvent[] {
    const events: StreamEvent[] = [];
    if (!chunk.trim()) return events;

    // Split into individual SSE messages (separated by blank lines)
    const blocks = chunk.split(/\n\n+/);

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        let eventType = '';
        let data = '';

        for (const line of lines) {
            if (line.startsWith('event: ')) {
                eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
                data = line.slice(6);
            }
        }

        if (!data) continue;

        // message_stop -> done
        if (eventType === 'message_stop') {
            events.push({ type: 'done' });
            continue;
        }

        let parsed: any;
        try {
            parsed = JSON.parse(data);
        } catch (e) {
            events.push({ type: 'error', error: `Failed to parse SSE data: ${data}` });
            continue;
        }

        // content_block_start with tool_use
        if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
            events.push({
                type: 'tool_use',
                id: parsed.content_block.id,
                name: parsed.content_block.name,
                input: parsed.content_block.input ?? {},
            });
            continue;
        }

        // content_block_delta
        if (parsed.type === 'content_block_delta') {
            const delta = parsed.delta;
            if (delta?.type === 'text_delta') {
                events.push({ type: 'text', text: delta.text });
            } else if (delta?.type === 'input_json_delta') {
                events.push({ type: 'input_json_delta', delta: delta.partial_json });
            }
        }
    }

    return events;
}

/**
 * Accumulate input_json_delta partials into a complete parsed object.
 */
export function accumulateToolInput(partials: string[]): Record<string, any> {
    if (partials.length === 0) return {};
    const json = partials.join('');
    try {
        return JSON.parse(json);
    } catch {
        return {};
    }
}

// --- Streaming generator ---

export interface StreamClaudeConfig {
    apiKey: string;
    model: string;
    system: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    tools: Array<{ name: string; description: string; input_schema: any }>;
    maxTokens?: number;
    signal?: AbortSignal;
}

/**
 * Stream Claude API responses as an async generator of StreamEvents.
 * Uses fetch + ReadableStream (works on web).
 * For native platforms, Metro resolves claudeStream.native.ts instead.
 */
export async function* streamClaude(config: StreamClaudeConfig): AsyncGenerator<StreamEvent> {
    const { apiKey, model, system, messages, tools, maxTokens = 1024, signal } = config;

    const body: any = {
        model,
        max_tokens: maxTokens,
        system,
        messages,
        stream: true,
    };
    if (tools.length > 0) {
        body.tools = tools;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal,
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error');
        yield { type: 'error', error: `Claude API ${response.status}: ${errorText}` };
        return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
        yield { type: 'error', error: 'No response body reader available' };
        return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE messages (terminated by double newline)
            const parts = buffer.split(/\n\n/);
            // Keep the last part as it might be incomplete
            buffer = parts.pop() ?? '';

            for (const part of parts) {
                if (!part.trim()) continue;
                const events = parseSSEChunk(part + '\n\n');
                for (const event of events) {
                    yield event;
                }
            }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
            const events = parseSSEChunk(buffer);
            for (const event of events) {
                yield event;
            }
        }
    } finally {
        reader.releaseLock();
    }
}
