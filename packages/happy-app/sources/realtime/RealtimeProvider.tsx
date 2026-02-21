import React from 'react';
import { ElevenLabsProvider } from '@elevenlabs/react-native';
import { ElevenLabsVoiceSession } from './ElevenLabsVoiceSession';
import { AnthropicVoiceSession } from './AnthropicVoiceSession';
import { useSetting } from '@/sync/storage';

export const RealtimeProvider = ({ children }: { children: React.ReactNode }) => {
    const voiceBackend = useSetting('voiceBackend');

    return (
        <>
            {voiceBackend === 'elevenlabs' ? (
                <ElevenLabsProvider>
                    <ElevenLabsVoiceSession />
                </ElevenLabsProvider>
            ) : (
                <AnthropicVoiceSession />
            )}
            {children}
        </>
    );
};
