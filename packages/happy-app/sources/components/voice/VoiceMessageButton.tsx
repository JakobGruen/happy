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
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
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
    /** Ref to the enclosing input panel (for dynamic mini-button placement) */
    panelRef?: React.RefObject<View | null>;
    /** Measured height of the input panel */
    panelHeight?: number;
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

        // Smooth hide when voice agent is active (scale+opacity, no overflow clip)
        const isHidden = props.isVoiceAgentActive ?? false;
        const visibleProgress = useSharedValue(isHidden ? 0 : 1);
        React.useEffect(() => {
            visibleProgress.value = withSpring(isHidden ? 0 : 1, SPRING_CONFIG);
        }, [isHidden]);
        const wrapperAnimStyle = useAnimatedStyle(() => ({
            opacity: visibleProgress.value,
            transform: [{ scale: visibleProgress.value }],
            marginLeft: 14 * visibleProgress.value,
        }));

        // Measure button Y offset from panel top for dynamic mini placement
        const wrapperRef = React.useRef<View>(null);
        const [buttonYInPanel, setButtonYInPanel] = React.useState(0);
        const measureButtonPosition = React.useCallback(() => {
            if (!wrapperRef.current || !props.panelRef?.current) return;
            wrapperRef.current.measureLayout(
                props.panelRef.current as any,
                (_x, y) => setButtonYInPanel(y),
                () => {},
            );
        }, [props.panelRef]);

        // Mini-buttons: emerge from behind main button
        const showMinis = isActiveRecording && !props.hasContent;
        const miniProgress = useSharedValue(0);
        React.useEffect(() => {
            miniProgress.value = withSpring(showMinis ? 1 : 0, SPRING_CONFIG);
        }, [showMinis]);

        // Scale factor when compact (main goes 52→32, minis scale proportionally)
        const sizeRatio = wrapperSize / SIZE_LARGE;
        const miniScale = props.hasContent ? sizeRatio : 1;

        // Dynamic mini target: center lands between button top and panel top (biased toward button)
        // 0.6 = 60% down from panel top toward button (visually balanced)
        const MINI_BIAS = 0.6;
        const miniTargetY = buttonYInPanel > 0
            ? buttonYInPanel * (MINI_BIAS - 1) - wrapperSize / 2
            : -(MINI_SIZE + 8); // fallback before measurement

        // Pause — centered behind main, slides up to dynamic target
        const pauseAnimStyle = useAnimatedStyle(() => ({
            position: 'absolute' as const,
            bottom: (wrapperSize - MINI_SIZE * miniScale) / 2,
            left: (wrapperSize - MINI_SIZE * miniScale) / 2,
            opacity: miniProgress.value,
            transform: [
                { scale: miniScale },
                { translateY: miniTargetY * miniProgress.value },
            ],
        }));

        // Trash — centered behind main, slides up + left to dynamic target
        const trashTargetX = -(SIZE_LARGE + 6 - (SIZE_LARGE - MINI_SIZE) / 2);
        const trashAnimStyle = useAnimatedStyle(() => ({
            position: 'absolute' as const,
            bottom: (wrapperSize - MINI_SIZE * miniScale) / 2,
            left: (wrapperSize - MINI_SIZE * miniScale) / 2,
            opacity: miniProgress.value,
            transform: [
                { scale: miniScale },
                { translateY: miniTargetY * miniProgress.value },
                { translateX: trashTargetX * miniProgress.value },
            ],
        }));

        return (
            <Animated.View
                ref={wrapperRef as any}
                onLayout={measureButtonPosition}
                style={[{ position: 'relative', width: wrapperSize, alignItems: 'center' }, wrapperAnimStyle]}
                pointerEvents={isHidden ? 'none' : 'auto'}
            >
                {/* Mini-buttons — only rendered when recording (no laggy exit animation) */}
                {showMinis && (
                    <>
                        {/* Pause — slides up from behind main button */}
                        <Animated.View style={pauseAnimStyle}>
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

                        {/* Trash — slides up+left from behind main button */}
                        <Animated.View style={trashAnimStyle}>
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
                    </>
                )}

                {/* Main button — renders on top (later sibling = higher z) */}
                <Pressable
                    onPress={handlePress}
                    disabled={showSpinner || props.isSendDisabled}
                    hitSlop={{ top: 5, bottom: 10, left: 5, right: 5 }}
                    style={{ zIndex: 1 }}
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
            </Animated.View>
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
