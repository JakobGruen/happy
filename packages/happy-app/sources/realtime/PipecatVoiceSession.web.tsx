import React, { useEffect, useRef } from 'react';
import { registerVoiceSession } from './RealtimeSession';
import { realtimeClientTools } from './realtimeClientTools';
import { LiveKitVoiceClient } from './LiveKitVoiceClient';
import { storage } from '@/sync/storage';
import { VOICE_CONFIG } from './voiceConfig';
import type { VoiceSession, VoiceSessionConfig } from './types';

let client: LiveKitVoiceClient | null = null;
let botAudioElement: HTMLAudioElement | null = null;

// Circuit breaker for send failures
let consecutiveSendFailures = 0;

// Suppress errors fired during intentional disconnect
let isDisconnecting = false;

/**
 * Map of tool handler registrations.
 * Keys are client-side camelCase names matching realtimeClientTools.
 */
const TOOL_HANDLERS: Record<string, (params: any) => Promise<any>> = {
    messageClaudeCode: (params) => realtimeClientTools.messageClaudeCode(params.arguments),
    processPermissionRequest: (params) => realtimeClientTools.processPermissionRequest(params.arguments),
    abortClaudeCode: () => realtimeClientTools.abortClaudeCode(),
    switchMode: (params) => realtimeClientTools.switchMode(params.arguments),
    answerSingleQuestion: (params) => realtimeClientTools.answerSingleQuestion(params.arguments),
    confirmQuestionAnswers: () => realtimeClientTools.confirmQuestionAnswers(),
    rejectQuestionAnswers: () => realtimeClientTools.rejectQuestionAnswers(),
    getToolDetails: (params) => realtimeClientTools.getToolDetails(params.arguments),
    runSlashCommand: (params) => realtimeClientTools.messageClaudeCode({
        message: `/${params.arguments.command}${params.arguments.args ? ' ' + params.arguments.args : ''}`
    }),
};

function cleanupBotAudio(): void {
    if (botAudioElement) {
        try {
            botAudioElement.pause();
        } catch (_) {
            // Safari throws InvalidStateError when pausing a dead MediaStream
        }
        botAudioElement.srcObject = null;
        botAudioElement.remove();
        botAudioElement = null;
    }
}

function createVoiceClient(): LiveKitVoiceClient {
    const voiceClient = new LiveKitVoiceClient({
        onConnected: () => {
            console.log('[LiveKit] Connected');
            storage.getState().setRealtimeStatus('connected');
            storage.getState().setRealtimeMode('idle');
        },
        onBotReady: () => {
            console.log('[LiveKit] Bot ready');
        },
        onDisconnected: () => {
            console.log('[LiveKit] Disconnected');
            try {
                cleanupBotAudio();
            } catch (err) {
                console.warn('[LiveKit] Cleanup error on disconnect:', err);
            }
            storage.getState().setRealtimeStatus('disconnected');
            storage.getState().setRealtimeMode('idle', true);
            storage.getState().clearRealtimeModeDebounce();
        },
        onBotStartedSpeaking: () => {
            storage.getState().setRealtimeMode('speaking');
        },
        onBotStoppedSpeaking: () => {
            storage.getState().setRealtimeMode('idle');
        },
        onBotAudioTrack: (track: MediaStreamTrack) => {
            // Web: attach bot audio to an <audio> element for playback
            if (botAudioElement?.srcObject) {
                const existing = (botAudioElement.srcObject as MediaStream).getTracks();
                if (existing.includes(track)) {
                    console.log('[LiveKit] Same audio track — reusing element');
                    return;
                }
            }
            console.log('[LiveKit] Bot audio track —',
                'state:', track.readyState, 'enabled:', track.enabled);
            cleanupBotAudio();
            botAudioElement = document.createElement('audio');
            botAudioElement.srcObject = new MediaStream([track]);
            botAudioElement.autoplay = true;
            botAudioElement.volume = 1.0;
            botAudioElement.style.display = 'none';
            document.body.appendChild(botAudioElement);
            botAudioElement.play().then(() => {
                console.log('[LiveKit] Audio play() succeeded');
            }).catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('[LiveKit] Audio play failed:', err);
                }
            });
        },
        onError: (error: any) => {
            if (isDisconnecting) return;

            const errorData = error?.data || error;
            const message = errorData?.message || String(error);
            const isFatal = errorData?.fatal ?? true;

            if (isFatal) {
                console.error('[LiveKit] Fatal error:', message);
                cleanupBotAudio();
                storage.getState().setRealtimeStatus('disconnected');
                storage.getState().setRealtimeMode('idle', true);
                storage.getState().clearRealtimeModeDebounce();
            } else {
                console.warn('[LiveKit] Non-fatal error (pipeline continues):', message);
            }
        },
    });

    // Register all tool handlers
    for (const [name, handler] of Object.entries(TOOL_HANDLERS)) {
        voiceClient.registerToolHandler(name, async (params) => {
            try {
                return await handler(params);
            } catch (err) {
                console.error(`[LiveKit] Tool ${name} failed:`, err);
                return `error (${name} failed)`;
            }
        });
    }

    return voiceClient;
}

function sendClientMessage(topic: string, text: string): void {
    if (!client) {
        console.warn('[LiveKit] Client not ready');
        return;
    }
    if (consecutiveSendFailures >= VOICE_CONFIG.MAX_SEND_FAILURES) return;

    try {
        client.sendClientMessage(topic, { text });
        consecutiveSendFailures = 0;
    } catch (err) {
        consecutiveSendFailures++;
        if (consecutiveSendFailures >= VOICE_CONFIG.MAX_SEND_FAILURES) {
            console.error('[LiveKit] sendClientMessage circuit breaker open after', consecutiveSendFailures, 'failures:', err);
        }
    }
}

class PipecatVoiceSessionImpl implements VoiceSession {
    async startSession(config: VoiceSessionConfig): Promise<void> {
        consecutiveSendFailures = 0;
        if (!config.pipecatUrl) {
            console.error('[LiveKit] Missing URL');
            return;
        }

        // Kick out any existing connection before starting a new one
        if (client) {
            console.log('[LiveKit] Replacing existing connection');
            await this.endSession();
        }

        isDisconnecting = false;
        storage.getState().setRealtimeStatus('connecting');

        // Request microphone permission — stop tracks immediately to avoid
        // holding an orphan mic stream that can interfere with the transport's stream.
        try {
            const permStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            permStream.getTracks().forEach(t => t.stop());
        } catch (error) {
            console.error('[LiveKit] Failed to get microphone permission:', error);
            storage.getState().setRealtimeStatus('error');
            throw error;
        }

        try {
            client = createVoiceClient();
            await client.connect(config.pipecatUrl, {
                ...(config.initialContext && { initialContext: config.initialContext }),
                ...(config.initialState && { initialState: config.initialState }),
                ...(config.voiceAssistantName && { voiceAssistantName: config.voiceAssistantName }),
                ...(config.voiceAssistantBio && { voiceAssistantBio: config.voiceAssistantBio }),
                ...(config.voiceAssistantSetup && { voiceAssistantSetup: config.voiceAssistantSetup }),
            });
        } catch (err) {
            console.error('[LiveKit] Connection failed:', err);
            client = null;
            storage.getState().setRealtimeStatus('disconnected');
            storage.getState().setRealtimeMode('idle', true);
            throw err;
        }
    }

    async endSession(): Promise<void> {
        isDisconnecting = true;
        const c = client;
        client = null;
        if (c) {
            try {
                await c.disconnect();
            } catch (err) {
                console.warn('[LiveKit] Disconnect error (non-fatal):', err);
            }
        }
        try {
            cleanupBotAudio();
        } catch (err) {
            console.warn('[LiveKit] Cleanup error on endSession:', err);
        }
        consecutiveSendFailures = 0;
        storage.getState().setRealtimeStatus('disconnected');
        storage.getState().setRealtimeMode('idle', true);

        // Keep suppressor active briefly for any remaining async teardown
        setTimeout(() => {
            isDisconnecting = false;
        }, 2000);
    }

    sendTextMessage(message: string): void {
        sendClientMessage('happy.chat', message);
    }

    sendContextualUpdate(update: string): void {
        sendClientMessage('happy.context', update);
    }

    sendTrigger(trigger: string): void {
        sendClientMessage('happy.trigger', trigger);
    }

    sendState(state: string): void {
        sendClientMessage('happy.state', state);
    }

    setMicEnabled(enabled: boolean): void {
        if (client) {
            try {
                client.enableMic(enabled);
            } catch (err) {
                console.warn('[LiveKit] Failed to set mic enabled:', err);
            }
        }
    }
}

export const PipecatVoiceSession: React.FC = () => {
    const hasRegistered = useRef(false);

    useEffect(() => {
        if (!hasRegistered.current) {
            registerVoiceSession(new PipecatVoiceSessionImpl());
            hasRegistered.current = true;
        }
    }, []);

    return null;
};
