import React, { useEffect, useRef } from 'react';
import { registerGlobals } from '@livekit/react-native';
import { registerVoiceSession } from './RealtimeSession';
import { realtimeClientTools } from './realtimeClientTools';
import { storage } from '@/sync/storage';
import { VOICE_CONFIG } from './voiceConfig';
import type { VoiceSession, VoiceSessionConfig } from './types';

// Polyfill WebRTC APIs (RTCPeerConnection, navigator.mediaDevices) required by SmallWebRTCTransport on React Native
registerGlobals();

// Pipecat client types — dynamically imported to avoid bundling when not used
type PipecatClientType = any;

let pcClient: PipecatClientType | null = null;

// Circuit breaker for send failures (same pattern as LiveKit)
let consecutiveSendFailures = 0;

// Suppress errors fired during intentional disconnect (WebKit throws InvalidStateError
// when closing WebRTC transceivers)
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
    // runSlashCommand is handled via messageClaudeCode on the client side
    runSlashCommand: (params) => realtimeClientTools.messageClaudeCode({
        message: `/${params.arguments.command}${params.arguments.args ? ' ' + params.arguments.args : ''}`
    }),
};

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

async function fetchIceServers(pipecatUrl: string): Promise<RTCIceServer[]> {
    try {
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
    // Dynamic imports to avoid bundling Pipecat when not selected
    const { PipecatClient } = await import('@pipecat-ai/client-js');
    const { SmallWebRTCTransport } = await import('@pipecat-ai/small-webrtc-transport');

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

                // Send initial context after connection
                if (config.initialContext && pcClient) {
                    try {
                        pcClient.sendClientMessage('happy.context', { text: config.initialContext });
                    } catch (err) {
                        console.error('[Pipecat] Failed to send initial context:', err);
                    }
                }
            },
            onDisconnected: () => {
                console.log('[Pipecat] Disconnected');
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
            onError: (error: any) => {
                if (isDisconnecting) return;
                console.warn('[Pipecat] Error:', error);
                storage.getState().setRealtimeStatus('disconnected');
                storage.getState().setRealtimeMode('idle', true);
            },
        },
    });

    // Register all tool handlers
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
        isDisconnecting = false;
        consecutiveSendFailures = 0;
        if (!config.pipecatUrl) {
            console.error('[Pipecat] Missing URL');
            return;
        }

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
        if (pcClient) {
            try {
                await pcClient.disconnect();
            } catch (err) {
                console.error('[Pipecat] Disconnect error:', err);
            }
            pcClient = null;
        }
        consecutiveSendFailures = 0;
        storage.getState().setRealtimeStatus('disconnected');
        storage.getState().setRealtimeMode('idle', true);
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
}

export const PipecatVoiceSession: React.FC = () => {
    const hasRegistered = useRef(false);

    useEffect(() => {
        if (!hasRegistered.current) {
            registerVoiceSession(new PipecatVoiceSessionImpl());
            hasRegistered.current = true;
        }
    }, []);

    // Imperative API — no React tree needed for connection
    return null;
};
