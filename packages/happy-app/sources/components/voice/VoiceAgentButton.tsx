import * as React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { useUnistyles } from 'react-native-unistyles';
import { hapticsLight } from '@/components/haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withSpring, FadeIn, FadeOut } from 'react-native-reanimated';
import { Pressable } from 'react-native';

const SIZE_LARGE = 52;
const SIZE_SMALL = 32;
const MINI_SIZE = 28;
const MINI_GAP = 8;
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
}

export const VoiceAgentButton = React.memo(function VoiceAgentButton(props: VoiceAgentButtonProps) {
    const { theme } = useUnistyles();
    const size = props.compact ? SIZE_SMALL : SIZE_LARGE;

    const animatedSize = useAnimatedStyle(() => ({
        width: withSpring(size, SPRING_CONFIG),
        height: withSpring(size, SPRING_CONFIG),
        borderRadius: withSpring(size / 2, SPRING_CONFIG),
    }));

    return (
        <View style={{ position: 'relative', marginLeft: 6, width: size, alignItems: 'center' }}>
            {/* Mini mute button — centered on top of main button */}
            {props.isActive && !props.compact && props.onMutePress && (
                <Animated.View
                    entering={FadeIn.duration(150)}
                    exiting={FadeOut.duration(150)}
                    style={{
                        position: 'absolute',
                        top: -(MINI_SIZE + MINI_GAP),
                        left: (size - MINI_SIZE) / 2,
                        zIndex: 1,
                    }}
                >
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

            {/* Main button */}
            <Pressable
                hitSlop={{ top: 5, bottom: 10, left: 5, right: 5 }}
                onPress={() => {
                    hapticsLight();
                    props.onPress();
                }}
                disabled={props.isConnecting}
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
        </View>
    );
});
