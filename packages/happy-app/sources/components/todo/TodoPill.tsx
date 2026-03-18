import * as React from 'react';
import { Pressable, Text } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    withDelay,
} from 'react-native-reanimated';
import { Typography } from '@/constants/Typography';
import type { PillPhase } from './useTodoPillState';

interface TodoPillProps {
    completed: number;
    total: number;
    phase: PillPhase;
    onPress: () => void;
}

export const TodoPill = React.memo<TodoPillProps>(({ completed, total, phase, onPress }) => {
    const opacity = useSharedValue(0);
    const prevPhaseRef = React.useRef<PillPhase>('hidden');

    React.useEffect(() => {
        const prev = prevPhaseRef.current;
        prevPhaseRef.current = phase;

        switch (phase) {
            case 'hidden':
                opacity.value = withTiming(0, { duration: 200 });
                break;
            case 'active':
                if (prev === 'hidden') {
                    opacity.value = withTiming(1, { duration: 200 });
                } else {
                    opacity.value = 1;
                }
                break;
            case 'allComplete':
                opacity.value = 1;
                // Hold for 3s, then fade out over 500ms
                opacity.value = withDelay(3000, withTiming(0, { duration: 500 }));
                break;
            case 'fadingOut':
                // Quick completion — fade out directly
                opacity.value = withTiming(0, { duration: 500 });
                break;
        }
    }, [phase, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
    }));

    const isComplete = phase === 'allComplete';
    const pillColor = isComplete ? 'rgba(76, 217, 100, 0.12)' : 'rgba(0, 122, 255, 0.12)';
    const textColor = isComplete ? '#4cd964' : '#007AFF';

    return (
        <Animated.View style={animatedStyle}>
            <Pressable
                onPress={onPress}
                accessibilityLabel={`${completed} of ${total} tasks completed, tap to view`}
                accessibilityRole="button"
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                    backgroundColor: pillColor,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderRadius: 6,
                }}
            >
                <Text style={{ fontSize: 10, color: textColor, ...Typography.default() }}>
                    ☑ {completed}/{total}{isComplete ? ' ✓' : ''}
                </Text>
            </Pressable>
        </Animated.View>
    );
});
