import React, { Suspense } from 'react';
import { RealtimeVoiceSession } from './RealtimeVoiceSession';
import { LiveKitVoiceSession } from './LiveKitVoiceSession';
import { useLocalSetting } from '@/sync/storage';

// Lazy-load PipecatVoiceSession so its transitive deps (@daily-co/daily-js ~243KB)
// are only fetched when voiceBackend === 'pipecat', preventing bundle bloat and
// eager initialization that causes _userAudioCallback TypeError on web load.
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
        <>
            <RealtimeVoiceSession />
            {children}
        </>
    );
};
