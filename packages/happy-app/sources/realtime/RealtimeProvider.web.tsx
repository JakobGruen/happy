import React from 'react';
import { RealtimeVoiceSession } from './RealtimeVoiceSession';
import { AnthropicVoiceSession } from './AnthropicVoiceSession';
import { useSetting } from '@/sync/storage';

export const RealtimeProvider = ({ children }: { children: React.ReactNode }) => {
    const voiceBackend = useSetting('voiceBackend');

    return (
        <>
            {voiceBackend === 'elevenlabs' ? (
                <RealtimeVoiceSession />
            ) : (
                <AnthropicVoiceSession />
            )}
            {children}
        </>
    );
};
