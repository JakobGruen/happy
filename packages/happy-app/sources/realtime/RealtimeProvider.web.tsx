import React from 'react';
import { ElevenLabsVoiceSession } from './ElevenLabsVoiceSession';
import { AnthropicVoiceSession } from './AnthropicVoiceSession';
import { useSetting } from '@/sync/storage';

export const RealtimeProvider = ({ children }: { children: React.ReactNode }) => {
    const voiceBackend = useSetting('voiceBackend');

    return (
        <>
            {voiceBackend === 'elevenlabs' ? (
                <ElevenLabsVoiceSession />
            ) : (
                <AnthropicVoiceSession />
            )}
            {children}
        </>
    );
};
