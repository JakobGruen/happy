import React, { useEffect, useRef, useState } from 'react';
import {
    LiveKitRoom,
    useVoiceAssistant,
    useRoomContext,
    useDataChannel,
} from '@livekit/components-react';
import { DataPublishOptions } from 'livekit-client';
import { registerVoiceSession } from './RealtimeSession';
import { realtimeClientTools } from './realtimeClientTools';
import { storage } from '@/sync/storage';
import type { VoiceSession, VoiceSessionConfig } from './types';

// Connection details set by the VoiceSession impl when startSession() is called
let pendingConnectionDetails: { url: string; token: string } | null = null;
let setConnectionDetailsFn: ((details: { url: string; token: string } | null) => void) | null = null;

// Reference to data channel send function for text/context messages
let dataChannelSend: ((payload: Uint8Array, options: DataPublishOptions) => Promise<void>) | null = null;

class LiveKitVoiceSessionImpl implements VoiceSession {
    async startSession(config: VoiceSessionConfig): Promise<void> {
        if (!config.livekitUrl || !config.livekitToken) {
            console.error('[LiveKit] Missing URL or token');
            return;
        }

        storage.getState().setRealtimeStatus('connecting');

        // Request microphone permission (web)
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            console.error('[LiveKit] Failed to get microphone permission:', error);
            storage.getState().setRealtimeStatus('error');
            return;
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
        dataChannelSend = null;
        storage.getState().setRealtimeStatus('disconnected');
        storage.getState().setRealtimeMode('idle', true);
    }

    sendTextMessage(message: string): void {
        if (!dataChannelSend) {
            console.warn('[LiveKit] Data channel not ready');
            return;
        }

        const payload = new TextEncoder().encode(JSON.stringify({
            type: 'text_message',
            text: message
        }));
        dataChannelSend(payload, { topic: 'chat' });
    }

    sendContextualUpdate(update: string): void {
        if (!dataChannelSend) {
            console.warn('[LiveKit] Data channel not ready');
            return;
        }

        const payload = new TextEncoder().encode(JSON.stringify({
            type: 'context_update',
            context: update
        }));
        dataChannelSend(payload, { topic: 'context' });
    }
}

// Inner component with access to room context
const RoomHandler: React.FC = () => {
    const { state } = useVoiceAssistant();
    const room = useRoomContext();
    const { send } = useDataChannel();

    // Store the send function for the VoiceSession impl
    useEffect(() => {
        dataChannelSend = send;
        return () => {
            dataChannelSend = null;
        };
    }, [send]);

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

        return () => {
            room.unregisterRpcMethod('messageClaudeCode');
            room.unregisterRpcMethod('processPermissionRequest');
        };
    }, [room]);

    // Handle room connection events
    useEffect(() => {
        const handleConnected = () => {
            console.log('[LiveKit] Room connected');
            storage.getState().setRealtimeStatus('connected');
            storage.getState().setRealtimeMode('idle');
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
