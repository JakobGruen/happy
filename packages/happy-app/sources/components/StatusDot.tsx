import * as React from 'react';
import { ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation, Easing, ReduceMotion } from 'react-native-reanimated';

export interface StatusDotProps {
    color: string;
    isPulsing?: boolean;
    size?: number;
    style?: ViewStyle;
}

export const StatusDot = React.memo(({ color, isPulsing, size = 6, style }: StatusDotProps) => {
    const opacity = useSharedValue(1);

    React.useEffect(() => {
        if (isPulsing) {
            opacity.value = withRepeat(
                withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
                -1, // infinite
                true, // reverse
                undefined,
                ReduceMotion.Never, // force animation even with reduced motion
            );
        } else {
            cancelAnimation(opacity);
            opacity.value = withTiming(1, { duration: 200 });
        }
    }, [isPulsing, opacity]);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
        };
    });

    const baseStyle: ViewStyle = {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
    };

    return (
        <Animated.View
            style={[
                baseStyle,
                animatedStyle,
                style
            ]}
        />
    );
});