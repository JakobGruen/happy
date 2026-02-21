import { describe, it, expect } from 'vitest';
import { extractSentences, trimHistory } from './pipelineHelpers';

describe('extractSentences', () => {
    it('should extract a single complete sentence', () => {
        const result = extractSentences('Hello world. ');
        expect(result.sentences).toEqual(['Hello world.']);
        expect(result.remaining).toBe('');
    });

    it('should extract multiple sentences', () => {
        const result = extractSentences('First sentence. Second sentence! Third? ');
        expect(result.sentences).toEqual(['First sentence.', 'Second sentence!', 'Third?']);
        expect(result.remaining).toBe('');
    });

    it('should keep incomplete sentence as remaining', () => {
        const result = extractSentences('Complete sentence. Incomplete');
        expect(result.sentences).toEqual(['Complete sentence.']);
        expect(result.remaining).toBe('Incomplete');
    });

    it('should return empty sentences for text without sentence endings', () => {
        const result = extractSentences('no sentence ending here');
        expect(result.sentences).toEqual([]);
        expect(result.remaining).toBe('no sentence ending here');
    });

    it('should return empty for empty string', () => {
        const result = extractSentences('');
        expect(result.sentences).toEqual([]);
        expect(result.remaining).toBe('');
    });

    it('should not split on period without trailing whitespace', () => {
        const result = extractSentences('version 3.5 is out');
        expect(result.sentences).toEqual([]);
        expect(result.remaining).toBe('version 3.5 is out');
    });
});

describe('trimHistory', () => {
    it('should return same array if under max', () => {
        const history = [
            { role: 'user' as const, content: 'hello' },
            { role: 'assistant' as const, content: 'hi' },
        ];
        expect(trimHistory(history, 10)).toBe(history);
    });

    it('should trim to most recent entries', () => {
        const history = [
            { role: 'user' as const, content: 'first' },
            { role: 'assistant' as const, content: 'second' },
            { role: 'user' as const, content: 'third' },
        ];
        const result = trimHistory(history, 2);
        expect(result).toHaveLength(2);
        expect(result[0].content).toBe('second');
        expect(result[1].content).toBe('third');
    });

    it('should return same array if exactly at max', () => {
        const history = [
            { role: 'user' as const, content: 'a' },
            { role: 'assistant' as const, content: 'b' },
        ];
        expect(trimHistory(history, 2)).toBe(history);
    });
});
