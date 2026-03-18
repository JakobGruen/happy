/**
 * useVoiceRecording — manages audio recording lifecycle via expo-audio.
 *
 * Uses useAudioRecorder + useAudioRecorderState for recording state,
 * duration, and metering. STT-optimized: mono 16kHz 64kbps.
 *
 * Supports pause/resume via expo-audio's recorder.pause() / recorder.record().
 * On web this uses MediaRecorder.pause()/resume(); on native it pauses the
 * audio unit. Duration keeps accumulating across pause/resume cycles.
 *
 * Race-condition fix: `startPromise` ref ensures stop/cancel wait for
 * start() to finish before calling recorder.stop(). Without this,
 * the tap-to-record flow's quick start→stop would call stop() on an
 * uninitialised MediaRecorder.
 */
import { useCallback, useRef, useState } from 'react';
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
    const [isPaused, setIsPaused] = useState(false);

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
        setIsPaused(false);
        return await p;
    }, [recorder]);

    const pause = useCallback(() => {
        try {
            recorder.pause();
            setIsPaused(true);
        } catch (e) {
            console.warn('[VoiceRecording] pause() failed:', e);
        }
    }, [recorder]);

    const resume = useCallback(() => {
        try {
            recorder.record();
            setIsPaused(false);
        } catch (e) {
            console.warn('[VoiceRecording] resume() failed:', e);
        }
    }, [recorder]);

    const stop = useCallback(async (): Promise<string | null> => {
        const started = await startPromise.current;
        startPromise.current = null;
        if (!started) return null;
        try {
            await recorder.stop();
        } catch (e) {
            console.warn('[VoiceRecording] stop() failed:', e);
        }
        setIsPaused(false);
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
        setIsPaused(false);
    }, [recorder]);

    return {
        isRecording: state.isRecording,
        isPaused,
        durationMs: state.durationMillis,
        metering: state.metering ?? -160,
        start,
        pause,
        resume,
        stop,
        cancel,
    };
}
