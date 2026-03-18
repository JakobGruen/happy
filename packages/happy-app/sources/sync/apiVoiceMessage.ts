import { Platform } from 'react-native';
import { getServerUrl } from './serverConfig';
import { storage } from './storage';
import type { VoiceMessageContext, VoiceMessageResponse } from '@jakobgruen/happy-wire';

/**
 * Send a voice message to the voice agent for processing.
 *
 * Auth follows the same pattern as the regular voice agent (RealtimeSession.ts):
 * - Direct mode: pipecatUrl + pipecatAuthSecret from localSettings
 * - Server-mediated mode: not yet implemented (requires signed URL)
 *
 * The tool_callback_url always points to happy-server. The voice agent
 * authenticates callbacks using PIPECAT_AUTH_SECRET (shared secret).
 */
export async function sendVoiceMessage(
    audioUri: string,
    context: VoiceMessageContext,
): Promise<VoiceMessageResponse> {
    const directUrl = storage.getState().localSettings.pipecatUrl;
    const serverUrl = getServerUrl();

    // Callback URL always points to happy-server — voice agent authenticates
    // with PIPECAT_AUTH_SECRET when calling back (same shared secret pattern)
    const callbackUrl = `${serverUrl}/v1/voice/tool-callback?sessionId=${encodeURIComponent(context.sessionId)}`;

    let voiceMessageUrl: string;

    if (directUrl) {
        // Direct mode — same pattern as RealtimeSession.ts
        const baseUrl = directUrl.replace(/\/+$/, '');
        const secret = storage.getState().localSettings.pipecatAuthSecret;
        voiceMessageUrl = `${baseUrl}/api/voice-message?session_id=${encodeURIComponent(context.sessionId)}`;
        if (secret) {
            voiceMessageUrl += `&secret=${encodeURIComponent(secret)}`;
        }
    } else {
        // Server-mediated mode — TODO: add POST /v1/voice/voice-message-url
        throw new Error('Server-mediated voice messages not yet implemented');
    }

    return await sendToVoiceAgent(voiceMessageUrl, audioUri, context, callbackUrl);
}

async function sendToVoiceAgent(
    url: string,
    audioUri: string,
    context: VoiceMessageContext,
    callbackUrl: string,
): Promise<VoiceMessageResponse> {
    const formData = new FormData();

    if (Platform.OS === 'web') {
        // On web, audioUri is a blob URL — fetch it and append as File
        const audioBlob = await fetch(audioUri).then(r => r.blob());
        formData.append('audio', new File([audioBlob], 'voice-message.m4a', { type: 'audio/m4a' }));
    } else {
        // On native, React Native FormData accepts { uri, type, name }
        const audioFile = {
            uri: audioUri,
            type: 'audio/m4a',
            name: 'voice-message.m4a',
        } as unknown as Blob;
        formData.append('audio', audioFile);
    }

    // Append context and callback URL
    formData.append('context', JSON.stringify(context));
    formData.append('tool_callback_url', callbackUrl);

    const response = await fetch(url, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type — fetch sets multipart boundary automatically
    });

    if (!response.ok) {
        const error = await response.text().catch(() => 'Unknown error');
        throw new Error(`Voice message failed (${response.status}): ${error}`);
    }

    return await response.json();
}
