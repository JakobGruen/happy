/**
 * VoiceRecordingOverlay — shown in the input area while recording a voice message.
 *
 * Telegram mobile-web style: timer + red dot centered in the input area.
 * Pause toggle is a subtle tap on the dot/timer area.
 * Cancel is handled externally (trash button replaces voice-agent button in AgentInput).
 * Swipe left anywhere to cancel as hidden gesture.
 */
import * as React from 'react';
import { Text, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    withRepeat,
    withTiming,
    useSharedValue,
    runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { hapticsLight } from '@/components/haptics';

const CANCEL_THRESHOLD = -120;

function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface VoiceRecordingOverlayProps {
    durationMs: number;
    isPaused: boolean;
    onCancel: () => void;
    onPause: () => void;
    onResume: () => void;
}

export const VoiceRecordingOverlay = React.memo(function VoiceRecordingOverlay(props: VoiceRecordingOverlayProps) {
    const { theme } = useUnistyles();
    const translateX = useSharedValue(0);

    // Pulsing red dot — freezes when paused
    const pulseOpacity = useSharedValue(1);
    React.useEffect(() => {
        if (props.isPaused) {
            pulseOpacity.value = withTiming(0.4, { duration: 200 });
        } else {
            pulseOpacity.value = withRepeat(
                withTiming(0.3, { duration: 800 }),
                -1,
                true
            );
        }
    }, [props.isPaused]);

    const dotStyle = useAnimatedStyle(() => ({
        opacity: pulseOpacity.value,
    }));

    // Swipe-to-cancel gesture (invisible)
    const onCancelJS = React.useCallback(() => {
        hapticsLight();
        props.onCancel();
    }, [props.onCancel]);

    const pan = Gesture.Pan()
        .activeOffsetX(-10)
        .onUpdate((e) => {
            'worklet';
            translateX.value = Math.min(0, e.translationX);
        })
        .onEnd(() => {
            'worklet';
            if (translateX.value < CANCEL_THRESHOLD) {
                runOnJS(onCancelJS)();
            }
            translateX.value = 0;
        });

    const slideStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    return (
        <GestureDetector gesture={pan}>
            <Animated.View style={[styles.container, slideStyle]}>
                {/* Centered: timer + dot + pause toggle */}
                <Pressable
                    onPress={() => {
                        hapticsLight();
                        props.isPaused ? props.onResume() : props.onPause();
                    }}
                    style={styles.centerRow}
                    hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
                >
                    <Text style={[styles.timer, { color: theme.colors.text }]}>
                        {formatDuration(props.durationMs)}
                    </Text>
                    <Animated.View style={[styles.redDot, dotStyle]} />
                    {props.isPaused && (
                        <Ionicons
                            name="play"
                            size={14}
                            color={theme.colors.textSecondary}
                            style={styles.pauseIcon}
                        />
                    )}
                </Pressable>
            </Animated.View>
        </GestureDetector>
    );
});

const styles = StyleSheet.create(() => ({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 10,
    },
    centerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    timer: {
        fontSize: 16,
        fontVariant: ['tabular-nums'],
        ...Typography.default('semiBold'),
    },
    redDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FF3B30',
    },
    pauseIcon: {
        marginLeft: 2,
    },
}));
