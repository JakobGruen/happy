import type { VoiceSession } from './types';
import { fetchPipecatSession } from '@/sync/apiVoice';
import { storage } from '@/sync/storage';
import { Modal } from '@/modal';
import { TokenStorage } from '@/auth/tokenStorage';
import { t } from '@/text';
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

        await voiceSession.startSession({
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