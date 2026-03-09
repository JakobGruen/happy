import React, { Suspense } from 'react';

const PipecatVoiceSession = React.lazy(() =>
    import('./PipecatVoiceSession').then(m => ({ default: m.PipecatVoiceSession }))
);

export const RealtimeProvider = ({ children }: { children: React.ReactNode }) => {
    return (
        <>
            <Suspense fallback={null}>
                <PipecatVoiceSession />
            </Suspense>
            {children}
        </>
    );
};
