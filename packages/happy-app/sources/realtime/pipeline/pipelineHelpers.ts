/**
 * Pure helper functions for the voice pipeline (no native dependencies).
 * Separated for testability — VoicePipeline.ts imports these.
 */

export interface SentenceResult {
    sentences: string[];
    remaining: string;
}

/**
 * Extract complete sentences from a text buffer.
 * A sentence ends with [.!?] followed by whitespace (space, newline, etc.).
 */
export function extractSentences(buffer: string): SentenceResult {
    const sentences: string[] = [];
    const regex = /[^.!?]*[.!?](?=\s)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(buffer)) !== null) {
        const sentence = match[0].trim();
        if (sentence) {
            sentences.push(sentence);
        }
        lastIndex = regex.lastIndex;
    }

    const remaining = buffer.slice(lastIndex).trim();
    return { sentences, remaining };
}

export type HistoryMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Trim conversation history to the most recent `max` entries.
 */
export function trimHistory(history: HistoryMessage[], max: number): HistoryMessage[] {
    if (history.length <= max) return history;
    return history.slice(-max);
}
