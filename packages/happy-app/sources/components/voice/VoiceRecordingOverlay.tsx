import * as React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, {
    useAnimatedStyle,
    withRepeat,
    withTiming,
    useSharedValue,
    interpolate,
    type SharedValue,
} from 'react-native-reanimated';
import { Octicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { hapticsLight } from '@/components/haptics';
import { t } from '@/text';

function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// -- Held-state overlay: red dot + timer + slide-to-cancel + lock icon --

interface VoiceRecordingOverlayProps {
    durationMs: number;
    metering: number;
    translateX: SharedValue<number>;
}

export const VoiceRecordingOverlay = React.memo(function VoiceRecordingOverlay(props: VoiceRecordingOverlayProps) {
    const { theme } = useUnistyles();

    // Pulsing red dot
    const pulseOpacity = useSharedValue(1);
    React.useEffect(() => {
        pulseOpacity.value = withRepeat(
            withTiming(0.3, { duration: 800 }),
            -1,
            true
        );
    }, []);

    const dotStyle = useAnimatedStyle(() => ({
        opacity: pulseOpacity.value,
    }));

    // Slide-to-cancel follows finger
    const slideStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: props.translateX.value * 0.5 }],
        opacity: interpolate(
            props.translateX.value,
            [-120, -60, 0],
            [0.3, 0.7, 1]
        ),
    }));

    return (
        <View style={styles.container}>
            {/* Recording indicator: red dot + timer */}
            <View style={styles.indicatorRow}>
                <Animated.View style={[styles.redDot, dotStyle]} />
                <Text style={[styles.timer, { color: theme.colors.text }]}>
                    {formatDuration(props.durationMs)}
                </Text>
            </View>

            {/* Center: slide-to-cancel hint */}
            <View style={styles.centerArea}>
                <Animated.View style={slideStyle}>
                    <View style={styles.cancelHint}>
                        <Octicons name="chevron-left" size={14} color={theme.colors.textSecondary} />
                        <Text style={[styles.cancelText, { color: theme.colors.textSecondary }]}>
                            {t('voiceMessage.slideToCancel')}
                        </Text>
                    </View>
                </Animated.View>
            </View>

            {/* Lock icon (shown above the send button area) */}
            <View style={styles.lockArea}>
                <Octicons name="lock" size={16} color={theme.colors.textSecondary} />
            </View>
        </View>
    );
});

// -- Locked-state controls: delete / timer / stop / send --

interface LockedRecordingControlsProps {
    onSend: () => void;
    onCancel: () => void;
    onStop: () => void;
    isStopped: boolean;
    durationMs: number;
}

export const LockedRecordingControls = React.memo(function LockedRecordingControls(props: LockedRecordingControlsProps) {
    const { theme } = useUnistyles();

    return (
        <View style={styles.lockedContainer}>
            {/* Delete button */}
            <Pressable
                onPress={() => { hapticsLight(); props.onCancel(); }}
                style={styles.lockedButton}
            >
                <Octicons name="trash" size={18} color={theme.colors.deleteAction} />
            </Pressable>

            {/* Timer in center */}
            <View style={styles.lockedCenter}>
                <Text style={[styles.timer, { color: theme.colors.text }]}>
                    {formatDuration(props.durationMs)}
                </Text>
            </View>

            {/* Stop button (only while still recording) */}
            {!props.isStopped && (
                <Pressable
                    onPress={() => { hapticsLight(); props.onStop(); }}
                    style={[styles.lockedButton, { backgroundColor: theme.colors.deleteAction }]}
                >
                    <Octicons name="square-fill" size={14} color="white" />
                </Pressable>
            )}

            {/* Send button */}
            <Pressable
                onPress={() => { hapticsLight(); props.onSend(); }}
                style={[styles.lockedButton, { backgroundColor: theme.colors.button.primary.background }]}
            >
                <Octicons name="arrow-up" size={16} color={theme.colors.button.primary.tint} />
            </Pressable>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 48,
    },
    indicatorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    redDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF3B30',
    },
    timer: {
        fontSize: 15,
        fontVariant: ['tabular-nums'],
        ...Typography.default('semiBold'),
    },
    centerArea: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    cancelText: {
        fontSize: 13,
        ...Typography.default(),
    },
    lockArea: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    lockedContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 12,
    },
    lockedCenter: {
        flex: 1,
        alignItems: 'center',
    },
    lockedButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));
