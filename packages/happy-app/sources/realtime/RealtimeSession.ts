import type { VoiceSession } from './types';
import { fetchVoiceToken, fetchLiveKitToken, fetchPipecatSession } from '@/sync/apiVoice';
import { storage } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { Modal } from '@/modal';
import { TokenStorage } from '@/auth/tokenStorage';
import { t } from '@/text';
import { config } from '@/config';
import { requestMicrophonePermission, showMicrophonePermissionDeniedAlert } from '@/utils/microphonePermissions';

let voiceSession: VoiceSession | null = null;
let voiceSessionStarted: boolean = false;
let currentSessionId: string | null = null;

export async function startRealtimeSession(sessionId: string, initialContext?: string) {
    if (!voiceSession) {
        console.warn('No voice session registered');
        return;
    }

    // Request microphone permission before starting voice session
    // Critical for iOS/Android - first session will fail without this
    const permissionResult = await requestMicrophonePermission();
    if (!permissionResult.granted) {
        showMicrophonePermissionDeniedAlert(permissionResult.canAskAgain);
        return;
    }

    const voiceBackend = storage.getState().localSettings.voiceBackend;

    if (voiceBackend === 'pipecat') {
        await startPipecatSession(sessionId, initialContext);
    } else if (voiceBackend === 'livekit') {
        await startLiveKitSession(sessionId, initialContext);
    } else {
        await startElevenLabsSession(sessionId, initialContext);
    }
}

async function startPipecatSession(sessionId: string, initialContext?: string) {
    try {
        // Direct URL from local settings bypasses happy-server (useful for local dev / self-hosted)
        const directUrl = storage.getState().localSettings.pipecatUrl;
        let offerUrl: string;

        if (directUrl) {
            const secret = storage.getState().localSettings.pipecatAuthSecret;
            const baseUrl = directUrl.replace(/\/+$/, '');
            offerUrl = `${baseUrl}/api/offer?session_id=${encodeURIComponent(sessionId)}`;
            if (secret) {
                offerUrl += `&secret=${encodeURIComponent(secret)}`;
            }
            console.log('[Voice] Using direct Pipecat URL:', directUrl);
        } else {
            const credentials = await TokenStorage.getCredentials();
            if (!credentials) {
                Modal.alert(t('common.error'), t('errors.authenticationFailed'));
                return;
            }
            const response = await fetchPipecatSession(credentials, sessionId);
            offerUrl = response.url;
            console.log('[Voice] Pipecat session from server:', { url: offerUrl });
        }

        currentSessionId = sessionId;
        voiceSessionStarted = true;
        storage.getState().setRealtimeSessionId(sessionId);

        await voiceSession!.startSession({
            sessionId,
            initialContext,
            pipecatUrl: offerUrl,
        });
    } catch (error) {
        console.error('Failed to start Pipecat session:', error);
        currentSessionId = null;
        voiceSessionStarted = false;
        storage.getState().setRealtimeSessionId(null);
        Modal.alert(t('common.error'), t('errors.voiceServiceUnavailable'));
    }
}

async function startLiveKitSession(sessionId: string, initialContext?: string) {
    try {
        const credentials = await TokenStorage.getCredentials();
        if (!credentials) {
            Modal.alert(t('common.error'), t('errors.authenticationFailed'));
            return;
        }

        const response = await fetchLiveKitToken(credentials, sessionId);
        console.log('[Voice] LiveKit token response:', { url: response.url });

        currentSessionId = sessionId;
        voiceSessionStarted = true;
        storage.getState().setRealtimeSessionId(sessionId);

        await voiceSession!.startSession({
            sessionId,
            initialContext,
            livekitUrl: response.url,
            livekitToken: response.token
        });
    } catch (error) {
        console.error('Failed to start LiveKit session:', error);
        currentSessionId = null;
        voiceSessionStarted = false;
        storage.getState().setRealtimeSessionId(null);
        Modal.alert(t('common.error'), t('errors.voiceServiceUnavailable'));
    }
}

async function startElevenLabsSession(sessionId: string, initialContext?: string) {
    const experimentsEnabled = storage.getState().settings.experiments;
    const agentId = __DEV__ ? config.elevenLabsAgentIdDev : config.elevenLabsAgentIdProd;

    if (!agentId) {
        console.error('Agent ID not configured');
        return;
    }

    try {
        // Simple path: No experiments = no auth needed
        if (!experimentsEnabled) {
            currentSessionId = sessionId;
            voiceSessionStarted = true;
            storage.getState().setRealtimeSessionId(sessionId);
            await voiceSession!.startSession({
                sessionId,
                initialContext,
                agentId  // Use agentId directly, no token
            });
            return;
        }

        // Experiments enabled = full auth flow
        const credentials = await TokenStorage.getCredentials();
        if (!credentials) {
            Modal.alert(t('common.error'), t('errors.authenticationFailed'));
            return;
        }

        const response = await fetchVoiceToken(credentials, sessionId);
        console.log('[Voice] fetchVoiceToken response:', response);

        if (!response.allowed) {
            console.log('[Voice] Not allowed, presenting paywall...');
            const result = await sync.presentPaywall();
            console.log('[Voice] Paywall result:', result);
            if (result.purchased) {
                await startRealtimeSession(sessionId, initialContext);
            }
            return;
        }

        currentSessionId = sessionId;
        voiceSessionStarted = true;
        storage.getState().setRealtimeSessionId(sessionId);

        if (response.token) {
            // Use token from backend
            await voiceSession!.startSession({
                sessionId,
                initialContext,
                token: response.token,
                agentId: response.agentId
            });
        } else {
            // No token (e.g. server not deployed yet) - use agentId directly
            await voiceSession!.startSession({
                sessionId,
                initialContext,
                agentId
            });
        }
    } catch (error) {
        console.error('Failed to start realtime session:', error);
        currentSessionId = null;
        voiceSessionStarted = false;
        storage.getState().setRealtimeSessionId(null);
        Modal.alert(t('common.error'), t('errors.voiceServiceUnavailable'));
    }
}

export async function stopRealtimeSession() {
    if (!voiceSession) {
        return;
    }
    
    try {
        await voiceSession.endSession();
        currentSessionId = null;
        voiceSessionStarted = false;
        storage.getState().setRealtimeSessionId(null);
    } catch (error) {
        console.error('Failed to stop realtime session:', error);
    }
}

export function registerVoiceSession(session: VoiceSession) {
    if (voiceSession) {
        console.warn('Voice session already registered, replacing with new one');
    }
    voiceSession = session;
}

export function isVoiceSessionStarted(): boolean {
    return voiceSessionStarted;
}

export function getVoiceSession(): VoiceSession | null {
    return voiceSession;
}

export function getCurrentRealtimeSessionId(): string | null {
    return currentSessionId;
}