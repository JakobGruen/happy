/**
 * Voice pipeline orchestrator: STT -> Claude Haiku -> TTS
 *
 * Pure helper functions are exported for testing.
 * The VoicePipeline class manages the full conversation lifecycle.
 */

import * as Speech from 'expo-speech';
import { streamClaude, accumulateToolInput, type StreamEvent } from './claudeStream';
import { buildSystemPrompt, VOICE_TOOLS } from './systemPrompt';
import { realtimeClientTools } from '../realtimeClientTools';
import type { VoiceSession, VoiceSessionConfig } from '../types';

import { extractSentences, trimHistory, type HistoryMessage } from './pipelineHelpers';
export { extractSentences, trimHistory, type HistoryMessage, type SentenceResult } from './pipelineHelpers';

// --- Pipeline config ---

export interface PipelineConfig {
    apiKey: string;
    model: string;
    maxHistory: number;
    maxTokens?: number;
    onStateChange?: (state: PipelineState) => void;
}

// --- Pipeline class ---

export type PipelineState = 'idle' | 'listening' | 'processing' | 'speaking';

export class VoicePipeline implements VoiceSession {
    private state: PipelineState = 'idle';
    private history: HistoryMessage[] = [];
    private context: string = '';
    private config: PipelineConfig;
    private abortController: AbortController | null = null;

    constructor(config: PipelineConfig) {
        this.config = config;
    }

    private setState(newState: PipelineState) {
        this.state = newState;
        this.config.onStateChange?.(newState);
    }

    // --- VoiceSession interface ---

    async startSession(sessionConfig: VoiceSessionConfig): Promise<void> {
        this.context = sessionConfig.initialContext || '';
        this.history = [];
        this.setState('idle');
    }

    async endSession(): Promise<void> {
        this.interrupt();
        this.history = [];
        this.context = '';
        this.setState('idle');
    }

    sendTextMessage(message: string): void {
        // Use queueMicrotask to break the synchronous call chain from
        // Sync#applyMessages -> voiceHooks -> here. Without this, Hermes
        // overflows its native stack when creating the async generator.
        queueMicrotask(() => {
            this.interrupt();
            this.processUserInput(message);
        });
    }

    sendContextualUpdate(update: string): void {
        this.context = update;
    }

    // --- Core pipeline ---

    /**
     * Process speech recognition result (called from STT hook).
     */
    handleSpeechResult(text: string): void {
        if (!text.trim()) return;
        // Use queueMicrotask for consistency with sendTextMessage
        queueMicrotask(() => {
            this.interrupt();
            this.processUserInput(text);
        });
    }

    private async processUserInput(text: string): Promise<void> {
        this.setState('processing');
        this.history.push({ role: 'user', content: text });
        this.history = trimHistory(this.history, this.config.maxHistory);

        const abortController = new AbortController();
        this.abortController = abortController;

        try {
            await this.streamAndSpeak(abortController);
        } catch (error: any) {
            if (error.name === 'AbortError') return;
            console.error('Voice pipeline error:', error);
            Speech.speak("I'm having trouble connecting.");
        } finally {
            if (this.abortController === abortController) {
                this.abortController = null;
                this.setState('idle');
            }
        }
    }

    private async streamAndSpeak(abortController: AbortController): Promise<void> {
        const systemPrompt = buildSystemPrompt(this.context);
        let textBuffer = '';
        let fullResponse = '';
        let currentToolName = '';
        let toolInputPartials: string[] = [];

        const stream = streamClaude({
            apiKey: this.config.apiKey,
            model: this.config.model,
            system: systemPrompt,
            messages: [...this.history],
            tools: VOICE_TOOLS,
            maxTokens: this.config.maxTokens,
            signal: abortController.signal,
        });

        for await (const event of stream) {
            if (abortController.signal.aborted) return;

            switch (event.type) {
                case 'text': {
                    textBuffer += event.text;
                    fullResponse += event.text;

                    const { sentences, remaining } = extractSentences(textBuffer);
                    for (const sentence of sentences) {
                        this.setState('speaking');
                        Speech.speak(sentence);
                    }
                    textBuffer = remaining;
                    break;
                }

                case 'tool_use': {
                    if (textBuffer.trim()) {
                        Speech.speak(textBuffer.trim());
                        textBuffer = '';
                    }
                    currentToolName = event.name;
                    toolInputPartials = [];
                    break;
                }

                case 'input_json_delta': {
                    toolInputPartials.push(event.delta);
                    break;
                }

                case 'done': {
                    if (textBuffer.trim()) {
                        this.setState('speaking');
                        Speech.speak(textBuffer.trim());
                        textBuffer = '';
                    }
                    break;
                }

                case 'error': {
                    console.error('Stream error:', event.error);
                    break;
                }
            }
        }

        if (currentToolName) {
            const input = accumulateToolInput(toolInputPartials);
            await this.executeTool(currentToolName, input, abortController);
        }

        if (fullResponse.trim()) {
            this.history.push({ role: 'assistant', content: fullResponse.trim() });
            this.history = trimHistory(this.history, this.config.maxHistory);
        }
    }

    private async executeTool(name: string, input: Record<string, any>, abortController: AbortController): Promise<void> {
        const tool = realtimeClientTools[name as keyof typeof realtimeClientTools];
        if (!tool) {
            console.error('Unknown tool:', name);
            return;
        }

        try {
            const result = await tool(input);
            this.history.push({ role: 'assistant', content: `[Used tool ${name}]` });
            this.history.push({ role: 'user', content: `Tool result: ${result}` });

            if (!abortController.signal.aborted) {
                await this.streamAndSpeak(abortController);
            }
        } catch (error) {
            console.error('Tool execution error:', error);
        }
    }

    /**
     * Speak a greeting immediately on session activation.
     * If the user speaks before it finishes, interrupt() cancels it.
     */
    speakGreeting(onReady?: () => void): void {
        this.setState('speaking');
        Speech.speak('Hi, Happy here', {
            onDone: () => {
                if (this.state === 'speaking') {
                    this.setState('idle');
                }
                onReady?.();
            },
        });
    }

    private interrupt(): void {
        Speech.stop();
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
