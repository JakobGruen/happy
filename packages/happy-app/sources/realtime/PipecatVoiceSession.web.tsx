import React, { useEffect, useRef } from 'react';
import { registerVoiceSession } from './RealtimeSession';
import { realtimeClientTools } from './realtimeClientTools';
import { storage } from '@/sync/storage';
import { VOICE_CONFIG } from './voiceConfig';
import type { VoiceSession, VoiceSessionConfig } from './types';

// Pipecat client types — dynamically imported to avoid bundling when not used
type PipecatClientType = any;

let pcClient: PipecatClientType | null = null;
let botAudioElement: HTMLAudioElement | null = null;

// Circuit breaker for send failures
let consecutiveSendFailures = 0;

// Suppress errors fired during intentional disconnect (Safari throws InvalidStateError
// when closing WebRTC transceivers / pausing dead audio elements)
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

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

async function fetchIceServers(pipecatUrl: string): Promise<RTCIceServer[]> {
    try {
        // Extract base URL and secret from the offer URL
        const url = new URL(pipecatUrl);
        const secret = url.searchParams.get('secret') || '';
        const configUrl = `${url.origin}/config${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`;
        const res = await fetch(configUrl);
        if (!res.ok) {
            console.warn('[Pipecat] /config returned', res.status, '— using default ICE servers');
            return DEFAULT_ICE_SERVERS;
        }
        const data = await res.json();
        return data.iceServers || DEFAULT_ICE_SERVERS;
    } catch (err) {
        console.warn('[Pipecat] Failed to fetch ICE config, using defaults:', err);
        return DEFAULT_ICE_SERVERS;
    }
}

async function createPipecatClient(config: VoiceSessionConfig): Promise<PipecatClientType> {
    const { PipecatClient } = await import('@pipecat-ai/client-js');
    const { SmallWebRTCTransport } = await import('@pipecat-ai/small-webrtc-transport');

    // Request microphone permission (web) — stop tracks immediately to avoid
    // holding an orphan mic stream that can interfere with the transport's stream.
    try {
        const permStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        permStream.getTracks().forEach(t => t.stop());
    } catch (error) {
        console.error('[Pipecat] Failed to get microphone permission:', error);
        storage.getState().setRealtimeStatus('error');
        throw error;
    }

    const iceServers = config.pipecatUrl
        ? await fetchIceServers(config.pipecatUrl)
        : DEFAULT_ICE_SERVERS;

    const transport = new SmallWebRTCTransport({
        iceServers,
    });
    // Patch: DailyMediaManager._startRecording calls _userAudioCallback without null
    // check (bug in @pipecat-ai/small-webrtc-transport). Set a no-op to prevent
    // TypeError until setUserAudioCallback() is called during connect().
    (transport as any).mediaManager._userAudioCallback = () => {};

    const client = new PipecatClient({
        transport,
        enableCam: false,
        enableMic: true,
        callbacks: {
            onConnected: () => {
                console.log('[Pipecat] Connected');
                storage.getState().setRealtimeStatus('connected');
                storage.getState().setRealtimeMode('idle');
            },
            onBotReady: () => {
                console.log('[Pipecat] Bot ready');
                if (config.initialContext && pcClient) {
                    try {
                        pcClient.sendClientMessage('happy.context', { text: config.initialContext });
                    } catch (err) {
                        console.error('[Pipecat] Failed to send initial context:', err);
                    }
                }

                // Send initial session state after context
                if (config.initialState && pcClient) {
                    try {
                        pcClient.sendClientMessage('happy.state', { text: config.initialState });
                    } catch (err) {
                        console.error('[Pipecat] Failed to send initial state:', err);
                    }
                }
            },
            onDisconnected: () => {
                console.log('[Pipecat] Disconnected');
                try {
                    cleanupBotAudio();
                } catch (err) {
                    console.warn('[Pipecat] Cleanup error on disconnect:', err);
                }
                storage.getState().setRealtimeStatus('disconnected');
                storage.getState().setRealtimeMode('idle', true);
                storage.getState().clearRealtimeModeDebounce();
            },
            onTrackStarted: (track: MediaStreamTrack, participant?: { local?: boolean }) => {
                // Skip local tracks — only handle remote (bot) audio.
                // DailyMediaManager fires onTrackStarted for local mic tracks too
                // (e.g. after setLocalAudio(true) on unmute), which would replace
                // the bot's audio element with the user's own mic → feedback loop.
                if (participant?.local) return;

                if (track.kind === 'audio') {
                    // Skip if we already have an audio element playing this exact track
                    if (botAudioElement?.srcObject) {
                        const existing = (botAudioElement.srcObject as MediaStream).getTracks();
                        if (existing.includes(track)) {
                            console.log('[Pipecat] Same audio track — reusing element');
                            return;
                        }
                    }
                    console.log('[Pipecat] Audio track started —',
                        'state:', track.readyState, 'enabled:', track.enabled, 'muted:', track.muted);
                    cleanupBotAudio();
                    botAudioElement = document.createElement('audio');
                    botAudioElement.srcObject = new MediaStream([track]);
                    botAudioElement.autoplay = true;
                    botAudioElement.volume = 1.0;
                    botAudioElement.style.display = 'none';
                    document.body.appendChild(botAudioElement);
                    botAudioElement.play().then(() => {
                        console.log('[Pipecat] Audio play() succeeded — paused:', botAudioElement?.paused);
                    }).catch(err => {
                        if (err.name !== 'AbortError') {
                            console.error('[Pipecat] Audio play failed:', err);
                        }
                    });
                }
            },
            onBotStartedSpeaking: () => {
                storage.getState().setRealtimeMode('speaking');
            },
            onBotStoppedSpeaking: () => {
                storage.getState().setRealtimeMode('idle');
            },
            onError: (error: any) => {
                if (isDisconnecting) return;

                const errorData = error?.data || error;
                const message = errorData?.message || String(error);
                const isFatal = errorData?.fatal ?? true;

                if (isFatal) {
                    console.error('[Pipecat] Fatal error:', message);
                    cleanupBotAudio();
                    storage.getState().setRealtimeStatus('disconnected');
                    storage.getState().setRealtimeMode('idle', true);
                    storage.getState().clearRealtimeModeDebounce();
                } else {
                    console.warn('[Pipecat] Non-fatal error (pipeline continues):', message);
                }
            },
        },
    });

    for (const [name, handler] of Object.entries(TOOL_HANDLERS)) {
        client.registerFunctionCallHandler(name, async (params: any) => {
            try {
                const result = await handler(params);
                return result;
            } catch (err) {
                console.error(`[Pipecat] Tool ${name} failed:`, err);
                return `error (${name} failed)`;
            }
        });
    }

    return client;
}

function sendClientMessage(topic: string, text: string): void {
    if (!pcClient) {
        console.warn('[Pipecat] Client not ready');
        return;
    }
    if (consecutiveSendFailures >= VOICE_CONFIG.MAX_SEND_FAILURES) return;

    try {
        pcClient.sendClientMessage(topic, { text });
        consecutiveSendFailures = 0;
    } catch (err) {
        consecutiveSendFailures++;
        if (consecutiveSendFailures >= VOICE_CONFIG.MAX_SEND_FAILURES) {
            console.error('[Pipecat] sendClientMessage circuit breaker open after', consecutiveSendFailures, 'failures:', err);
        }
    }
}

class PipecatVoiceSessionImpl implements VoiceSession {
    async startSession(config: VoiceSessionConfig): Promise<void> {
        consecutiveSendFailures = 0;
        if (!config.pipecatUrl) {
            console.error('[Pipecat] Missing URL');
            return;
        }

        // Kick out any existing connection before starting a new one
        if (pcClient) {
            console.log('[Pipecat] Replacing existing connection');
            await this.endSession();
        }

        isDisconnecting = false;
        storage.getState().setRealtimeStatus('connecting');

        try {
            pcClient = await createPipecatClient(config);
            await pcClient.connect({
                webrtcRequestParams: { endpoint: config.pipecatUrl },
            });
        } catch (err) {
            console.error('[Pipecat] Connection failed:', err);
            pcClient = null;
            storage.getState().setRealtimeStatus('disconnected');
            storage.getState().setRealtimeMode('idle', true);
            throw err;
        }
    }

    async endSession(): Promise<void> {
        isDisconnecting = true;

        // Suppress InvalidStateError thrown asynchronously by the Pipecat SDK
        // during WebRTC teardown (pipecat-client-web-transports#63).
        // The SDK's keepAlive interval calls dc.send() after dc.close(), and
        // closePeerConnection() calls transceiver.stop() without try-catch.
        const suppress = (e: Event) => {
            const err = (e as ErrorEvent).error ?? (e as PromiseRejectionEvent).reason;
            if (err?.name === 'InvalidStateError' || err?.message?.includes?.('invalid state')) {
                e.preventDefault();
            }
        };
        window.addEventListener('error', suppress);
        window.addEventListener('unhandledrejection', suppress);

        const client = pcClient;
        pcClient = null; // Prevent double-disconnect
        if (client) {
            // Pre-clean SDK internals before disconnect to avoid the keepAlive race
            // condition (pipecat-client-web-transports#63): the SDK's dc "close" event
            // handler clears the interval async, but the interval can fire first.
            try {
                const transport = (client as any)._transport;
                if (transport?.keepAliveInterval) {
                    clearInterval(transport.keepAliveInterval);
                    transport.keepAliveInterval = null;
                }
            } catch (_) {
                // Transport internals may not be accessible — fall through to disconnect()
            }

            try {
                await client.disconnect();
            } catch (err) {
                // WebRTC throws InvalidStateError if peer connection already closed
                console.warn('[Pipecat] Disconnect error (non-fatal):', err);
            }
        }
        try {
            cleanupBotAudio();
        } catch (err) {
            console.warn('[Pipecat] Cleanup error on endSession:', err);
        }
        consecutiveSendFailures = 0;
        storage.getState().setRealtimeStatus('disconnected');
        storage.getState().setRealtimeMode('idle', true);

        // Keep suppressors active briefly for any remaining async teardown events
        // (ICE state change handlers, late interval ticks) then remove
        setTimeout(() => {
            window.removeEventListener('error', suppress);
            window.removeEventListener('unhandledrejection', suppress);
            isDisconnecting = false;
        }, 5000);
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
        if (pcClient) {
            try {
                pcClient.enableMic(enabled);
            } catch (err) {
                console.warn('[Pipecat] Failed to set mic enabled:', err);
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
