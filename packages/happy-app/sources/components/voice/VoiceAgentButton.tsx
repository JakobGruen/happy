import * as React from 'react';
import { Image } from 'expo-image';
import { useUnistyles } from 'react-native-unistyles';
import { hapticsLight } from '@/components/haptics';
import { Octicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Pressable } from 'react-native';

const SIZE_LARGE = 44;
const SIZE_SMALL = 32;
const SPRING_CONFIG = { damping: 15, stiffness: 200 };

interface VoiceAgentButtonProps {
    onPress: () => void;
    isActive: boolean;
    isConnecting: boolean;
    /** Shrink to 32px when text input has content */
    compact?: boolean;
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
                            ? theme.colors.button.primary.background
                            : 'transparent',
                    },
                    animatedSize,
                ]}
            >
                {props.isActive ? (
                    <Octicons
                        name="stop"
                        size={props.compact ? 14 : 18}
                        color={theme.colors.button.primary.tint}
                    />
                ) : (
                    <Image
                        source={require('@/assets/images/icon-voice-white.png')}
                        style={{ width: props.compact ? 20 : 24, height: props.compact ? 20 : 24 }}
                        tintColor={theme.colors.button.secondary.tint}
                    />
                )}
            </Animated.View>
        </Pressable>
    );
});
