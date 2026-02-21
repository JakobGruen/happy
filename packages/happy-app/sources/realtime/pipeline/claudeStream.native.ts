/**
 * Claude Haiku SSE streaming — native variant.
 * Uses `expo/fetch` which provides ReadableStream support on native
 * platforms (URLSession on iOS, OkHttp on Android).
 *
 * The web variant uses global `fetch` (which already has ReadableStream).
 * Metro resolves this file on native; Vitest resolves the plain `.ts` file.
 */

import { fetch } from 'expo/fetch';

// Re-export pure functions from the shared module
export { parseSSEChunk, accumulateToolInput } from './claudeStream';
export type { StreamEvent, StreamClaudeConfig } from './claudeStream';

import type { StreamEvent, StreamClaudeConfig } from './claudeStream';
import { parseSSEChunk } from './claudeStream';

/**
 * Stream Claude API responses as an async generator of StreamEvents.
 * Native variant using expo/fetch for ReadableStream support.
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
