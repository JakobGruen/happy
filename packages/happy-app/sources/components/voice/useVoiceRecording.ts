/**
 * useVoiceRecording — manages audio recording lifecycle via expo-audio.
 *
 * Uses useAudioRecorder + useAudioRecorderState for recording state,
 * duration, and metering. STT-optimized: mono 16kHz 64kbps.
 *
 * Race-condition fix: `startPromise` ref ensures stop/cancel wait for
 * start() to finish before calling recorder.stop(). Without this,
 * the gesture system's near-simultaneous onStart + onEnd would call
 * stop() on an uninitialised MediaRecorder.
 */
import { useCallback, useRef } from 'react';
import {
    useAudioRecorder,
    useAudioRecorderState,
    AudioModule,
    setAudioModeAsync,
    RecordingPresets,
} from 'expo-audio';

// STT-optimized recording: mono 16kHz for speech recognition
const RECORDING_OPTIONS = {
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
    android: {
        ...RecordingPresets.HIGH_QUALITY.android,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 64000,
    },
    ios: {
        ...RecordingPresets.HIGH_QUALITY.ios,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 64000,
    },
};

export function useVoiceRecording() {
    const recorder = useAudioRecorder(RECORDING_OPTIONS);
    const state = useAudioRecorderState(recorder);
    const startPromise = useRef<Promise<boolean> | null>(null);

    const start = useCallback(async () => {
        const p = (async () => {
            const status = await AudioModule.requestRecordingPermissionsAsync();
            if (!status.granted) return false;

            await setAudioModeAsync({ allowsRecording: true });
            await recorder.prepareToRecordAsync();
            recorder.record();
            return true;
        })();
        startPromise.current = p;
        return await p;
    }, [recorder]);

    const stop = useCallback(async (): Promise<string | null> => {
        // Wait for start() to finish — prevents race when gesture fires
        // onStart and onEnd in quick succession
        const started = await startPromise.current;
        startPromise.current = null;
        if (!started) return null;
        try {
            await recorder.stop();
        } catch (e) {
            console.warn('[VoiceRecording] stop() failed:', e);
        }
        return recorder.uri ?? null;
    }, [recorder]);

    const cancel = useCallback(async () => {
        const started = await startPromise.current;
        startPromise.current = null;
        if (!started) return;
        try {
            await recorder.stop();
        } catch (e) {
            console.warn('[VoiceRecording] cancel() failed:', e);
        }
    }, [recorder]);

    return {
        isRecording: state.isRecording,
        durationMs: state.durationMillis,
        metering: state.metering ?? -160,
        start,
        stop,
        cancel,
    };
}
