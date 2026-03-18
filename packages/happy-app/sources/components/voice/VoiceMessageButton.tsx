/**
 * VoiceMessageButton — wraps the send button with hold-to-record gesture handling.
 *
 * Tap with text content → sends text (onSend).
 * Long-press without text → starts voice recording.
 * Exposes recording state for parent to show VoiceRecordingOverlay.
 *
 * Size: 44px when input is empty (bigger touch target for hold-to-record),
 * 32px when typing (more room for text). Animates with spring.
 */
import * as React from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withSpring, useAnimatedReaction, runOnJS, type SharedValue } from 'react-native-reanimated';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useVoiceRecording } from './useVoiceRecording';
import { useRecordingGestures, type RecordingState } from './useRecordingGestures';
import { hapticsLight } from '@/components/haptics';

const SIZE_LARGE = 44;
const SIZE_SMALL = 32;
const ICON_LARGE = 20;
const ICON_SMALL = 16;
const SPRING_CONFIG = { damping: 15, stiffness: 200 };

interface VoiceMessageButtonProps {
    hasContent: boolean;
    isSending?: boolean;
    isVoiceMessageSending?: boolean;
    isVoiceMessageEnabled?: boolean;
    isVoiceAgentActive?: boolean;
    onSend: () => void;
    onVoiceMessageSend?: (audioUri: string) => void;
    isSendDisabled?: boolean;
    /** Called when recording state changes — parent can show/hide overlay */
    onRecordingStateChange?: (state: RecordingState) => void;
}

export interface VoiceMessageButtonHandle {
    recording: {
        isRecording: boolean;
        durationMs: number;
        metering: number;
    };
    gestures: {
        sendLocked: () => void;
        cancelLocked: () => void;
        stopLocked: () => void;
        translateX: SharedValue<number>;
    };
    recordingState: RecordingState;
}

export const VoiceMessageButton = React.memo(React.forwardRef<VoiceMessageButtonHandle, VoiceMessageButtonProps>(
    function VoiceMessageButton(props, ref) {
        const { theme } = useUnistyles();
        const recording = useVoiceRecording();
        const [recordingState, setRecordingState] = React.useState<RecordingState>('idle');

        // Don't allow recording while voice agent is active (both use microphone)
        const voiceEnabled = (props.isVoiceMessageEnabled ?? false)
            && !props.isSending
            && !props.isVoiceMessageSending
            && !(props.isVoiceAgentActive ?? false);

        const gestures = useRecordingGestures({
            onRecordStart: recording.start,
            onRecordStop: recording.stop,
            onRecordCancel: recording.cancel,
            onSend: (uri) => props.onVoiceMessageSend?.(uri),
            onTap: () => {
                hapticsLight();
                props.onSend();
            },
            hasContent: props.hasContent,
            enabled: voiceEnabled,
        });

        // Sync shared value state to React state for conditional rendering
        useAnimatedReaction(
            () => gestures.state.value,
            (current) => { runOnJS(setRecordingState)(current); },
            [gestures.state]
        );

        // Notify parent of recording state changes
        React.useEffect(() => {
            props.onRecordingStateChange?.(recordingState);
        }, [recordingState]);

        // Expose recording data to parent via ref
        React.useImperativeHandle(ref, () => ({
            recording: {
                isRecording: recording.isRecording,
                durationMs: recording.durationMs,
                metering: recording.metering,
            },
            gestures: {
                sendLocked: gestures.sendLocked,
                cancelLocked: gestures.cancelLocked,
                stopLocked: gestures.stopLocked,
                translateX: gestures.translateX,
            },
            recordingState,
        }), [recording.isRecording, recording.durationMs, recording.metering, recordingState, gestures]);

        // Animated size: 44px when empty → 32px when typing, plus scale-up during recording
        const buttonAnimatedStyle = useAnimatedStyle(() => {
            const isRecordingHeld = gestures.state.value === 'recording_held';
            const size = props.hasContent ? SIZE_SMALL : SIZE_LARGE;
            return {
                width: withSpring(size, SPRING_CONFIG),
                height: withSpring(size, SPRING_CONFIG),
                borderRadius: withSpring(size / 2, SPRING_CONFIG),
                transform: [{
                    scale: isRecordingHeld ? withSpring(1.3, SPRING_CONFIG) : withSpring(1, SPRING_CONFIG),
                }],
            };
        });

        const isActive = props.hasContent || voiceEnabled;
        const iconSize = props.hasContent ? ICON_SMALL : ICON_LARGE;

        return (
            <GestureDetector gesture={gestures.gesture}>
                <Animated.View
                    style={[
                        styles.sendButton,
                        isActive ? styles.sendButtonActive : styles.sendButtonInactive,
                        buttonAnimatedStyle,
                    ]}
                >
                    {props.isSending || props.isVoiceMessageSending ? (
                        <ActivityIndicator
                            size="small"
                            color={theme.colors.button.primary.tint}
                        />
                    ) : props.hasContent ? (
                        <Octicons
                            name="arrow-up"
                            size={iconSize}
                            color={theme.colors.button.primary.tint}
                            style={{ marginTop: Platform.OS === 'web' ? 2 : 0 }}
                        />
                    ) : voiceEnabled ? (
                        <Ionicons
                            name="mic-outline"
                            size={iconSize + 2}
                            color={theme.colors.button.primary.tint}
                        />
                    ) : (
                        <Octicons
                            name="arrow-up"
                            size={iconSize}
                            color={theme.colors.button.primary.tint}
                            style={{ marginTop: Platform.OS === 'web' ? 2 : 0 }}
                        />
                    )}
                </Animated.View>
            </GestureDetector>
        );
    }
));

const styles = StyleSheet.create((theme) => ({
    sendButton: {
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        marginLeft: 8,
    },
    sendButtonActive: {
        backgroundColor: theme.colors.button.primary.background,
    },
    sendButtonInactive: {
        backgroundColor: theme.colors.button.primary.disabled,
    },
}));
