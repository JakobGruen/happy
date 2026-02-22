import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    LiveKitRoom,
    AudioSession,
    useVoiceAssistant,
    useRoomContext,
    registerGlobals,
} from '@livekit/react-native';
import type { Room } from 'livekit-client';
import { registerVoiceSession } from './RealtimeSession';
import { realtimeClientTools } from './realtimeClientTools';
import { storage } from '@/sync/storage';
import { VOICE_CONFIG } from './voiceConfig';
import type { VoiceSession, VoiceSessionConfig } from './types';

// Polyfill crypto and stream APIs required by livekit-client on Hermes
registerGlobals();

// Connection details set by the VoiceSession impl when startSession() is called
let pendingConnectionDetails: { url: string; token: string } | null = null;
let setConnectionDetailsFn: ((details: { url: string; token: string } | null) => void) | null = null;

// Room reference for sending text streams
let roomRef: Room | null = null;

// Initial context to send when room connects
let pendingInitialContext: string | null = null;

// Circuit breaker for sendText failures
let consecutiveSendFailures = 0;

class LiveKitVoiceSessionImpl implements VoiceSession {
    async startSession(config: VoiceSessionConfig): Promise<void> {
        consecutiveSendFailures = 0;
        if (!config.livekitUrl || !config.livekitToken) {
            console.error('[LiveKit] Missing URL or token');
            return;
        }

        storage.getState().setRealtimeStatus('connecting');

        // Store initial context to send after room connects
        if (config.initialContext) {
            pendingInitialContext = config.initialContext;
        }

        const details = { url: config.livekitUrl, token: config.livekitToken };
        if (setConnectionDetailsFn) {
            setConnectionDetailsFn(details);
        } else {
            pendingConnectionDetails = details;
        }
    }

    async endSession(): Promise<void> {
        if (setConnectionDetailsFn) {
            setConnectionDetailsFn(null);
        }
        roomRef = null;
        pendingInitialContext = null;
        consecutiveSendFailures = 0;
        storage.getState().setRealtimeStatus('disconnected');
        storage.getState().setRealtimeMode('idle', true);
    }

    sendTextMessage(message: string): void {
        if (!roomRef) {
            console.warn('[LiveKit] Room not ready');
            return;
        }
        if (consecutiveSendFailures >= VOICE_CONFIG.MAX_SEND_FAILURES) return;

        roomRef.localParticipant.sendText(message, { topic: 'lk.chat' }).then(() => {
            consecutiveSendFailures = 0;
        }).catch((err) => {
            consecutiveSendFailures++;
            if (consecutiveSendFailures >= VOICE_CONFIG.MAX_SEND_FAILURES) {
                console.error('[LiveKit] sendText circuit breaker open after', consecutiveSendFailures, 'failures:', err);
            }
        });
    }

    sendContextualUpdate(update: string): void {
        if (!roomRef) {
            console.warn('[LiveKit] Room not ready');
            return;
        }
        if (consecutiveSendFailures >= VOICE_CONFIG.MAX_SEND_FAILURES) return;

        roomRef.localParticipant.sendText(update, { topic: 'lk.context' }).then(() => {
            consecutiveSendFailures = 0;
        }).catch((err) => {
            consecutiveSendFailures++;
            if (consecutiveSendFailures >= VOICE_CONFIG.MAX_SEND_FAILURES) {
                console.error('[LiveKit] sendText circuit breaker open after', consecutiveSendFailures, 'failures:', err);
            }
        });
    }
}

// Inner component with access to room context
const RoomHandler: React.FC = () => {
    const { state } = useVoiceAssistant();
    const room = useRoomContext();

    // Store room reference for the VoiceSession impl
    useEffect(() => {
        roomRef = room;
        return () => {
            roomRef = null;
        };
    }, [room]);

    // Map agent state to store
    useEffect(() => {
        switch (state) {
            case 'speaking':
                storage.getState().setRealtimeMode('speaking');
                break;
            case 'listening':
            case 'thinking':
            case 'idle':
            case 'initializing':
                storage.getState().setRealtimeMode('idle');
                break;
        }
    }, [state]);

    // Register RPC handlers for agent tool calls
    useEffect(() => {
        room.registerRpcMethod('messageClaudeCode', async (data) => {
            const payload = JSON.parse(data.payload);
            return await realtimeClientTools.messageClaudeCode(payload);
        });

        room.registerRpcMethod('processPermissionRequest', async (data) => {
            const payload = JSON.parse(data.payload);
            return await realtimeClientTools.processPermissionRequest(payload);
        });

        room.registerRpcMethod('answerUserQuestion', async (data) => {
            const payload = JSON.parse(data.payload);
            return await realtimeClientTools.answerUserQuestion(payload);
        });

        return () => {
            room.unregisterRpcMethod('messageClaudeCode');
            room.unregisterRpcMethod('processPermissionRequest');
            room.unregisterRpcMethod('answerUserQuestion');
        };
    }, [room]);

    // Handle room connection events
    useEffect(() => {
        const handleConnected = () => {
            console.log('[LiveKit] Room connected');
            storage.getState().setRealtimeStatus('connected');
            storage.getState().setRealtimeMode('idle');

            // Send initial context (session history) to agent
            if (pendingInitialContext) {
                room.localParticipant.sendText(pendingInitialContext, { topic: 'lk.context' }).catch((err) => {
                    console.error('[LiveKit] Failed to send initial context:', err);
                });
                pendingInitialContext = null;
            }
        };

        const handleDisconnected = () => {
            console.log('[LiveKit] Room disconnected');
            storage.getState().setRealtimeStatus('disconnected');
            storage.getState().setRealtimeMode('idle', true);
            storage.getState().clearRealtimeModeDebounce();
        };

        room.on('connected', handleConnected);
        room.on('disconnected', handleDisconnected);

        // If already connected
        if (room.state === 'connected') {
            handleConnected();
        }

        return () => {
            room.off('connected', handleConnected);
            room.off('disconnected', handleDisconnected);
        };
    }, [room]);

    return null;
};

export const LiveKitVoiceSession: React.FC = () => {
    const [connectionDetails, setConnectionDetails] = useState<{ url: string; token: string } | null>(null);
    const hasRegistered = useRef(false);

    // Store the setter so the VoiceSession impl can trigger connects
    useEffect(() => {
        setConnectionDetailsFn = setConnectionDetails;

        // Check if a connection was requested before mount
        if (pendingConnectionDetails) {
            setConnectionDetails(pendingConnectionDetails);
            pendingConnectionDetails = null;
        }

        return () => {
            setConnectionDetailsFn = null;
        };
    }, []);

    // Manage native audio session
    useEffect(() => {
        AudioSession.startAudioSession();
        return () => {
            AudioSession.stopAudioSession();
        };
    }, []);

    // Register the voice session once
    useEffect(() => {
        if (!hasRegistered.current) {
            registerVoiceSession(new LiveKitVoiceSessionImpl());
            hasRegistered.current = true;
        }
    }, []);

    if (!connectionDetails) {
        return null;
    }

    return (
        <LiveKitRoom
            serverUrl={connectionDetails.url}
            token={connectionDetails.token}
            connect={true}
            audio={true}
            video={false}
            onError={(error) => {
                console.warn('[LiveKit] Room error:', error);
                storage.getState().setRealtimeStatus('disconnected');
                storage.getState().setRealtimeMode('idle', true);
            }}
        >
            <RoomHandler />
        </LiveKitRoom>
    );
};
