import { describe, it, expect } from 'vitest';
import { parseSSEChunk, accumulateToolInput } from './claudeStream';

describe('parseSSEChunk', () => {
    it('should parse a text_delta event into a text StreamEvent', () => {
        const chunk = [
            'event: content_block_delta',
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
            '',
        ].join('\n');

        const events = parseSSEChunk(chunk);
        expect(events).toEqual([{ type: 'text', text: 'Hello' }]);
    });

    it('should parse multiple text_delta events in one chunk', () => {
        const chunk = [
            'event: content_block_delta',
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
            '',
            'event: content_block_delta',
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}',
            '',
        ].join('\n');

        const events = parseSSEChunk(chunk);
        expect(events).toHaveLength(2);
        expect(events[0]).toEqual({ type: 'text', text: 'Hello' });
        expect(events[1]).toEqual({ type: 'text', text: ' world' });
    });

    it('should parse message_stop as done event', () => {
        const chunk = [
            'event: message_stop',
            'data: {"type":"message_stop"}',
            '',
        ].join('\n');

        const events = parseSSEChunk(chunk);
        expect(events).toEqual([{ type: 'done' }]);
    });

    it('should return empty array for empty string', () => {
        expect(parseSSEChunk('')).toEqual([]);
    });

    it('should return empty array for whitespace-only chunk', () => {
        expect(parseSSEChunk('   \n\n  ')).toEqual([]);
    });

    it('should return error event for malformed JSON in data line', () => {
        const chunk = [
            'event: content_block_delta',
            'data: {not valid json}',
            '',
        ].join('\n');

        const events = parseSSEChunk(chunk);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe('error');
        expect((events[0] as { type: 'error'; error: string }).error).toBeTruthy();
    });

    it('should recognize content_block_start with tool_use type', () => {
        const chunk = [
            'event: content_block_start',
            'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_123","name":"messageClaudeCode","input":{}}}',
            '',
        ].join('\n');

        const events = parseSSEChunk(chunk);
        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
            type: 'tool_use',
            id: 'toolu_123',
            name: 'messageClaudeCode',
            input: {},
        });
    });
});

describe('accumulateToolInput', () => {
    it('should parse a single complete JSON string', () => {
        const result = accumulateToolInput(['{"message": "hello"}']);
        expect(result).toEqual({ message: 'hello' });
    });

    it('should concatenate multiple partial JSON strings into a complete object', () => {
        const result = accumulateToolInput(['{"message":', ' "hello"}']);
        expect(result).toEqual({ message: 'hello' });
    });

    it('should return empty object for empty partials array', () => {
        const result = accumulateToolInput([]);
        expect(result).toEqual({});
    });
});
