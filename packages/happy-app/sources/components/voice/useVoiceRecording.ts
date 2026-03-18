/**
 * useVoiceRecording — manages audio recording lifecycle via expo-audio.
 *
 * Uses useAudioRecorder + useAudioRecorderState for recording state,
 * duration, and metering. STT-optimized: mono 16kHz 64kbps.
 */
import { useCallback } from 'react';
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

    const start = useCallback(async () => {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) return false;

        await setAudioModeAsync({ allowsRecording: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        return true;
    }, [recorder]);

    const stop = useCallback(async (): Promise<string | null> => {
        await recorder.stop();
        return recorder.uri ?? null;
    }, [recorder]);

    const cancel = useCallback(async () => {
        await recorder.stop();
        // URI is discarded — caller should not use it
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
