import React, { Suspense } from 'react';
import { ElevenLabsProvider } from "@elevenlabs/react-native";
import { RealtimeVoiceSession } from './RealtimeVoiceSession';
import { LiveKitVoiceSession } from './LiveKitVoiceSession';
import { useLocalSetting } from '@/sync/storage';

// Lazy-load PipecatVoiceSession so its transitive deps (@daily-co/daily-js)
// are only fetched when voiceBackend === 'pipecat'.
const PipecatVoiceSession = React.lazy(() =>
    import('./PipecatVoiceSession').then(m => ({ default: m.PipecatVoiceSession }))
);

export const RealtimeProvider = ({ children }: { children: React.ReactNode }) => {
    const voiceBackend = useLocalSetting('voiceBackend');

    if (voiceBackend === 'pipecat') {
        return (
            <>
                <Suspense fallback={null}>
                    <PipecatVoiceSession />
                </Suspense>
                {children}
            </>
        );
    }

    if (voiceBackend === 'livekit') {
        return (
            <>
                <LiveKitVoiceSession />
                {children}
            </>
        );
    }

    return (
        <ElevenLabsProvider>
            <RealtimeVoiceSession />
            {children}
        </ElevenLabsProvider>
    );
};
