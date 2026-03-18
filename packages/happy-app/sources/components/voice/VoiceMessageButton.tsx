/**
 * VoiceMessageButton — tap-to-record voice message button.
 *
 * Follows Telegram Web's pattern (no hold gesture — avoids mobile browser conflicts):
 *   - Tap mic (when no text) → starts recording, button morphs to send
 *   - Tap send → stops recording + sends
 *   - Tap with text → sends text message
 *
 * Size: 44px when input is empty, 32px when typing. Animates with spring.
 */
import * as React from 'react';
import { ActivityIndicator, Platform, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useVoiceRecording } from './useVoiceRecording';
import { hapticsLight } from '@/components/haptics';
import * as Haptics from 'expo-haptics';

const SIZE_LARGE = 44;
const SIZE_SMALL = 32;
const ICON_LARGE = 20;
const ICON_SMALL = 16;
const SPRING_CONFIG = { damping: 25, stiffness: 200, overshootClamping: true };

export type RecordingState = 'idle' | 'recording' | 'paused' | 'sending';

interface VoiceMessageButtonProps {
    hasContent: boolean;
    isSending?: boolean;
    isVoiceMessageSending?: boolean;
    isVoiceMessageEnabled?: boolean;
    isVoiceAgentActive?: boolean;
    onSend: () => void;
    onVoiceMessageSend?: (audioUri: string) => void;
    isSendDisabled?: boolean;
    onRecordingStateChange?: (state: RecordingState) => void;
}

export interface VoiceMessageButtonHandle {
    recording: {
        isRecording: boolean;
        isPaused: boolean;
        durationMs: number;
        metering: number;
    };
    cancelRecording: () => void;
    pauseRecording: () => void;
    resumeRecording: () => void;
    recordingState: RecordingState;
}

export const VoiceMessageButton = React.memo(React.forwardRef<VoiceMessageButtonHandle, VoiceMessageButtonProps>(
    function VoiceMessageButton(props, ref) {
        const { theme } = useUnistyles();
        const recording = useVoiceRecording();
        const [recordingState, setRecordingState] = React.useState<RecordingState>('idle');

        const voiceEnabled = (props.isVoiceMessageEnabled ?? false)
            && !props.isSending
            && !props.isVoiceMessageSending
            && !(props.isVoiceAgentActive ?? false);

        const updateState = React.useCallback((state: RecordingState) => {
            setRecordingState(state);
            props.onRecordingStateChange?.(state);
        }, [props.onRecordingStateChange]);

        // Tap handler — context-dependent
        const handlePress = React.useCallback(async () => {
            if (props.hasContent) {
                hapticsLight();
                props.onSend();
                return;
            }

            if (recordingState === 'recording' || recordingState === 'paused') {
                // Recording or paused → stop and send
                updateState('sending');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                const uri = await recording.stop();
                if (uri) {
                    props.onVoiceMessageSend?.(uri);
                }
                updateState('idle');
                return;
            }

            if (voiceEnabled && recordingState === 'idle') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                updateState('recording');
                const started = await recording.start();
                if (!started) {
                    updateState('idle');
                }
            }
        }, [props.hasContent, props.onSend, recordingState, voiceEnabled, recording, props.onVoiceMessageSend, updateState]);

        // Cancel — called from parent (overlay cancel/swipe)
        const cancelRecording = React.useCallback(async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await recording.cancel();
            updateState('idle');
        }, [recording, updateState]);

        // Pause — called from overlay pause button
        const pauseRecording = React.useCallback(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            recording.pause();
            updateState('paused');
        }, [recording, updateState]);

        // Resume — called from overlay pause button (toggle)
        const resumeRecording = React.useCallback(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            recording.resume();
            updateState('recording');
        }, [recording, updateState]);

        // Expose to parent via ref
        React.useImperativeHandle(ref, () => ({
            recording: {
                isRecording: recording.isRecording,
                isPaused: recording.isPaused,
                durationMs: recording.durationMs,
                metering: recording.metering,
            },
            cancelRecording,
            pauseRecording,
            resumeRecording,
            recordingState,
        }), [recording.isRecording, recording.isPaused, recording.durationMs, recording.metering, cancelRecording, pauseRecording, resumeRecording, recordingState]);

        // Animated size: 44px when empty → 32px when typing
        const isActiveRecording = recordingState === 'recording' || recordingState === 'paused';
        const buttonAnimatedStyle = useAnimatedStyle(() => {
            const size = props.hasContent ? SIZE_SMALL : SIZE_LARGE;
            return {
                width: withSpring(size, SPRING_CONFIG),
                height: withSpring(size, SPRING_CONFIG),
                borderRadius: withSpring(size / 2, SPRING_CONFIG),
                transform: [{
                    scale: isActiveRecording ? withSpring(1.15, SPRING_CONFIG) : withSpring(1, SPRING_CONFIG),
                }],
            };
        });

        const isActive = props.hasContent || voiceEnabled || isActiveRecording;
        const iconSize = props.hasContent ? ICON_SMALL : ICON_LARGE;

        // Determine which icon to show
        const showSpinner = props.isSending || props.isVoiceMessageSending;
        const showSendArrow = props.hasContent || isActiveRecording;
        const showMic = !showSpinner && !showSendArrow && voiceEnabled;

        return (
            <Pressable
                onPress={handlePress}
                disabled={showSpinner || props.isSendDisabled}
                hitSlop={{ top: 5, bottom: 10, left: 5, right: 5 }}
            >
                <Animated.View
                    style={[
                        styles.sendButton,
                        isActive ? styles.sendButtonActive : styles.sendButtonInactive,
                        isActiveRecording && styles.sendButtonRecording,
                        buttonAnimatedStyle,
                    ]}
                >
                    {showSpinner ? (
                        <ActivityIndicator
                            size="small"
                            color={theme.colors.button.primary.tint}
                        />
                    ) : showSendArrow ? (
                        <Octicons
                            name="arrow-up"
                            size={iconSize}
                            color={theme.colors.button.primary.tint}
                            style={Platform.OS === 'web' ? { marginTop: 2 } : undefined}
                        />
                    ) : showMic ? (
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
                            style={Platform.OS === 'web' ? { marginTop: 2 } : undefined}
                        />
                    )}
                </Animated.View>
            </Pressable>
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
    sendButtonRecording: {
        backgroundColor: '#FF3B30',
    },
}));
