/**
 * VoiceMessageButton — tap-to-record voice message button.
 *
 * Follows Telegram Web's pattern (no hold gesture — avoids mobile browser conflicts):
 *   - Tap mic (when no text) → starts recording, button morphs to send
 *   - Tap send → stops recording + sends
 *   - Tap with text → sends text message
 *
 * Size: 52px when input is empty, 32px when typing. Animates with spring.
 */
import * as React from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useVoiceRecording } from './useVoiceRecording';
import { hapticsLight } from '@/components/haptics';
import * as Haptics from 'expo-haptics';

const SIZE_LARGE = 52;
const SIZE_SMALL = 32;
const ICON_LARGE = 22;
const ICON_SMALL = 16;
const MINI_SIZE = 28;
const MINI_GAP = 8;
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

        // Animated size: 52px when empty → 32px when typing
        const isActiveRecording = recordingState === 'recording' || recordingState === 'paused';
        const buttonAnimatedStyle = useAnimatedStyle(() => {
            const size = props.hasContent ? SIZE_SMALL : SIZE_LARGE;
            return {
                width: withSpring(size, SPRING_CONFIG),
                height: withSpring(size, SPRING_CONFIG),
                borderRadius: withSpring(size / 2, SPRING_CONFIG),
                transform: [{
                    scale: isActiveRecording ? withSpring(1.05, SPRING_CONFIG) : withSpring(1, SPRING_CONFIG),
                }],
            };
        });

        const isActive = props.hasContent || voiceEnabled || isActiveRecording;
        const iconSize = props.hasContent ? ICON_SMALL : ICON_LARGE;

        // Determine which icon to show
        const showSpinner = props.isSending || props.isVoiceMessageSending;
        const showSendArrow = props.hasContent || isActiveRecording;
        const showMic = !showSpinner && !showSendArrow && voiceEnabled;

        const handlePauseToggle = React.useCallback(() => {
            if (recordingState === 'recording') {
                pauseRecording();
            } else if (recordingState === 'paused') {
                resumeRecording();
            }
        }, [recordingState, pauseRecording, resumeRecording]);

        const wrapperSize = props.hasContent ? SIZE_SMALL : SIZE_LARGE;

        return (
            <View style={{ position: 'relative', marginLeft: 14, width: wrapperSize, alignItems: 'center' }}>
                {/* Pause button — centered above main button */}
                {isActiveRecording && !props.hasContent && (
                    <Animated.View
                        entering={FadeIn.duration(150)}
                        exiting={FadeOut.duration(150)}
                        style={{
                            position: 'absolute',
                            top: -(MINI_SIZE + MINI_GAP),
                            left: (SIZE_LARGE - MINI_SIZE) / 2,
                            zIndex: 1,
                        }}
                    >
                        <Pressable
                            onPress={handlePauseToggle}
                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                            style={{
                                width: MINI_SIZE,
                                height: MINI_SIZE,
                                borderRadius: MINI_SIZE / 2,
                                backgroundColor: recordingState === 'paused' ? '#FF3B30' : 'rgba(255,255,255,0.15)',
                                justifyContent: 'center',
                                alignItems: 'center',
                                borderWidth: 1,
                                borderColor: recordingState === 'paused' ? '#FF3B30' : 'rgba(255,255,255,0.3)',
                            }}
                        >
                            <Ionicons
                                name={recordingState === 'paused' ? 'play' : 'pause'}
                                size={15}
                                color="#FFFFFF"
                            />
                        </Pressable>
                    </Animated.View>
                )}

                {/* Trash button — far left, roughly where the voice agent button sits */}
                {isActiveRecording && !props.hasContent && (
                    <Animated.View
                        entering={FadeIn.duration(150)}
                        exiting={FadeOut.duration(150)}
                        style={{
                            position: 'absolute',
                            top: -(MINI_SIZE + MINI_GAP),
                            right: SIZE_LARGE + 6,
                            zIndex: 1,
                        }}
                    >
                        <Pressable
                            onPress={cancelRecording}
                            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                            style={{
                                width: MINI_SIZE,
                                height: MINI_SIZE,
                                borderRadius: MINI_SIZE / 2,
                                backgroundColor: 'rgba(255,255,255,0.15)',
                                justifyContent: 'center',
                                alignItems: 'center',
                                borderWidth: 1,
                                borderColor: 'rgba(255,255,255,0.3)',
                            }}
                        >
                            <Octicons name="trash" size={14} color="#FF3B30" />
                        </Pressable>
                    </Animated.View>
                )}

                {/* Main button */}
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
            </View>
        );
    }
));

const styles = StyleSheet.create((theme) => ({
    sendButton: {
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
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
