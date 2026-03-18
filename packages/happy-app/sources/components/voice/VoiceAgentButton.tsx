import * as React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useUnistyles } from 'react-native-unistyles';
import { hapticsLight } from '@/components/haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Pressable } from 'react-native';

const SIZE_LARGE = 52;
const SIZE_SMALL = 32;
const MINI_SIZE = 28;
const SPRING_CONFIG = { damping: 25, stiffness: 200, overshootClamping: true };

interface VoiceAgentButtonProps {
    onPress: () => void;
    isActive: boolean;
    isConnecting: boolean;
    /** Shrink to 32px when text input has content */
    compact?: boolean;
    /** Microphone is muted */
    isMuted?: boolean;
    /** Toggle mute */
    onMutePress?: () => void;
    /** Smoothly hide (e.g. during voice message recording) */
    hidden?: boolean;
    /** Ref to the enclosing input panel (for dynamic mini-button placement) */
    panelRef?: React.RefObject<View | null>;
    /** Measured height of the input panel */
    panelHeight?: number;
}

export const VoiceAgentButton = React.memo(function VoiceAgentButton(props: VoiceAgentButtonProps) {
    const { theme } = useUnistyles();
    const size = props.compact ? SIZE_SMALL : SIZE_LARGE;

    const animatedSize = useAnimatedStyle(() => ({
        width: withSpring(size, SPRING_CONFIG),
        height: withSpring(size, SPRING_CONFIG),
        borderRadius: withSpring(size / 2, SPRING_CONFIG),
    }));

    // Smooth hide/show (scale + opacity, no overflow clip)
    const visibleProgress = useSharedValue(props.hidden ? 0 : 1);
    React.useEffect(() => {
        visibleProgress.value = withSpring(props.hidden ? 0 : 1, SPRING_CONFIG);
    }, [props.hidden]);

    const wrapperAnimStyle = useAnimatedStyle(() => ({
        opacity: visibleProgress.value,
        transform: [{ scale: visibleProgress.value }],
        marginLeft: 6 * visibleProgress.value,
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

    // Mute mini-button — sits behind main, slides up when active
    const showMute = props.isActive && !props.compact && !!props.onMutePress;
    const muteProgress = useSharedValue(0);
    React.useEffect(() => {
        muteProgress.value = withSpring(showMute ? 1 : 0, SPRING_CONFIG);
    }, [showMute]);

    // Scale minis proportionally when compact
    const sizeRatio = size / SIZE_LARGE;
    const miniScale = props.compact ? sizeRatio : 1;

    // Dynamic mini target: center lands between button top and panel top (biased toward button)
    const MINI_BIAS = 0.6;
    const miniTargetY = buttonYInPanel > 0
        ? buttonYInPanel * (MINI_BIAS - 1) - size / 2
        : -(MINI_SIZE + 8); // fallback before measurement

    const muteAnimStyle = useAnimatedStyle(() => ({
        position: 'absolute' as const,
        bottom: (size - MINI_SIZE * miniScale) / 2,
        left: (size - MINI_SIZE * miniScale) / 2,
        opacity: muteProgress.value,
        transform: [
            { scale: miniScale },
            { translateY: miniTargetY * muteProgress.value },
        ],
    }));

    return (
        <Animated.View
            ref={wrapperRef as any}
            onLayout={measureButtonPosition}
            style={[{ position: 'relative', width: size, alignItems: 'center' }, wrapperAnimStyle]}
            pointerEvents={props.hidden ? 'none' : 'auto'}
        >
            {/* Mute mini — only rendered when active (no laggy exit animation) */}
            {showMute && (
                <Animated.View style={muteAnimStyle}>
                    <Pressable
                        onPress={() => {
                            hapticsLight();
                            props.onMutePress?.();
                        }}
                        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        style={{
                            width: MINI_SIZE,
                            height: MINI_SIZE,
                            borderRadius: MINI_SIZE / 2,
                            backgroundColor: props.isMuted ? '#FF3B30' : 'rgba(255,255,255,0.15)',
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderWidth: 1,
                            borderColor: props.isMuted ? '#FF3B30' : 'rgba(255,255,255,0.3)',
                        }}
                    >
                        <Ionicons
                            name={props.isMuted ? 'mic-off' : 'mic'}
                            size={15}
                            color="#FFFFFF"
                        />
                    </Pressable>
                </Animated.View>
            )}

            {/* Main button — later sibling renders on top */}
            <Pressable
                hitSlop={{ top: 5, bottom: 10, left: 5, right: 5 }}
                onPress={() => {
                    hapticsLight();
                    props.onPress();
                }}
                disabled={props.isConnecting}
                style={{ zIndex: 1 }}
            >
                <Animated.View
                    style={[
                        {
                            justifyContent: 'center',
                            alignItems: 'center',
                            backgroundColor: props.isActive
                                ? '#FF3B30'
                                : '#000000',
                        },
                        animatedSize,
                    ]}
                >
                    <Image
                        source={require('@/assets/images/icon-voice-white.png')}
                        style={{ width: props.compact ? 20 : 26, height: props.compact ? 20 : 26 }}
                        tintColor="#FFFFFF"
                    />
                </Animated.View>
            </Pressable>
        </Animated.View>
    );
});
