/**
 * useRecordingGestures — gesture state machine for hold-to-record voice messages.
 *
 * State machine:
 *   IDLE → [long-press ≥200ms] → RECORDING_HELD
 *     RECORDING_HELD → [release] → SENDING (auto-send)
 *     RECORDING_HELD → [pan left > 120px] → CANCELLED → IDLE
 *     RECORDING_HELD → [pan up > 80px] → RECORDING_LOCKED
 *       RECORDING_LOCKED → [tap send] → SENDING
 *       RECORDING_LOCKED → [tap delete] → CANCELLED → IDLE
 *       RECORDING_LOCKED → [tap stop] → STOPPED_LOCKED
 *         STOPPED_LOCKED → [tap send] → SENDING
 *         STOPPED_LOCKED → [tap delete] → CANCELLED → IDLE
 *   IDLE → [tap] → onTap() (text message send)
 *
 * Implementation: Uses a single Pan gesture with activateAfterLongPress(200)
 * instead of Simultaneous(LongPress, Pan). LongPress is a discrete gesture
 * that "completes" after firing, which can kill the Pan in a Simultaneous
 * composition. Pan.activateAfterLongPress gives us both the long-press
 * trigger (onStart) and continuous tracking (onUpdate/onEnd) in one gesture.
 */
import { useCallback, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export type RecordingState =
    | 'idle'
    | 'recording_held'
    | 'recording_locked'
    | 'stopped_locked'
    | 'cancelled'
    | 'sending';

const CANCEL_THRESHOLD = -120; // px left
const LOCK_THRESHOLD = -80;    // px up

interface UseRecordingGesturesOptions {
    onRecordStart: () => void;
    onRecordStop: () => Promise<string | null>;
    onRecordCancel: () => void;
    onSend: (uri: string) => void;
    onTap: () => void;
    hasContent: boolean;
    enabled: boolean;
}

export function useRecordingGestures(options: UseRecordingGesturesOptions) {
    const state = useSharedValue<RecordingState>('idle');
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const isLocked = useSharedValue(false);
    const pendingUriRef = useRef<string | null>(null);

    const handleRecordStart = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        options.onRecordStart();
    }, [options.onRecordStart]);

    const handleCancel = useCallback(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        options.onRecordCancel();
    }, [options.onRecordCancel]);

    const handleLock = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, []);

    const handleReleaseSend = useCallback(async () => {
        const uri = await options.onRecordStop();
        if (uri) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            options.onSend(uri);
        }
        state.value = 'idle';
    }, [options.onRecordStop, options.onSend]);

    // Single Pan gesture with activateAfterLongPress — replaces Simultaneous(LongPress, Pan).
    // onStart fires at 200ms (the long-press trigger), onUpdate tracks movement, onEnd handles release.
    const holdAndPan = Gesture.Pan()
        .enabled(options.enabled && !options.hasContent)
        .activateAfterLongPress(200)
        .onStart(() => {
            'worklet';
            state.value = 'recording_held';
            translateX.value = 0;
            translateY.value = 0;
            isLocked.value = false;
            runOnJS(handleRecordStart)();
        })
        .onUpdate((e) => {
            'worklet';
            if (state.value !== 'recording_held') return;
            translateX.value = Math.min(0, e.translationX);
            translateY.value = Math.min(0, e.translationY);

            // Check lock threshold (swipe up)
            if (e.translationY < LOCK_THRESHOLD && !isLocked.value) {
                isLocked.value = true;
                state.value = 'recording_locked';
                runOnJS(handleLock)();
            }
        })
        .onEnd((e) => {
            'worklet';
            if (state.value === 'recording_held') {
                // Not locked — check cancel or send
                if (e.translationX < CANCEL_THRESHOLD) {
                    state.value = 'cancelled';
                    runOnJS(handleCancel)();
                    state.value = 'idle';
                } else {
                    state.value = 'sending';
                    runOnJS(handleReleaseSend)();
                }
            }
            // If locked, do nothing on pan end — buttons handle it
            translateX.value = 0;
            translateY.value = 0;
        });

    // Tap gesture for text send (when hasContent)
    const tap = Gesture.Tap()
        .enabled(options.hasContent)
        .onEnd(() => {
            'worklet';
            runOnJS(options.onTap)();
        });

    // Compose: tap takes priority when hasContent, otherwise hold-and-pan
    const composed = Gesture.Exclusive(tap, holdAndPan);

    // Actions for locked state (called from UI buttons)
    const sendLocked = useCallback(async () => {
        const uri = pendingUriRef.current ?? await options.onRecordStop();
        if (uri) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            options.onSend(uri);
        }
        pendingUriRef.current = null;
        state.value = 'idle';
    }, [options.onRecordStop, options.onSend]);

    const cancelLocked = useCallback(() => {
        handleCancel();
        pendingUriRef.current = null;
        state.value = 'idle';
    }, [handleCancel]);

    const stopLocked = useCallback(async () => {
        pendingUriRef.current = await options.onRecordStop();
        state.value = 'stopped_locked';
    }, [options.onRecordStop]);

    return {
        gesture: composed,
        state,
        translateX,
        translateY,
        isLocked,
        sendLocked,
        cancelLocked,
        stopLocked,
        pendingUriRef,
    };
}
