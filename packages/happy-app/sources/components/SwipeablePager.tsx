import React from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    type SharedValue,
} from 'react-native-reanimated';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PAGER_SPRING_CONFIG = {
    mass: 1,
    damping: 20,
    stiffness: 200,
};

// ---------------------------------------------------------------------------
// Utility — exported for tests
// ---------------------------------------------------------------------------

/**
 * Computes the snap target page (0 or 1) after a pan gesture ends.
 * Uses current offset + velocity projection; tie at 0.5 goes to 0 (chat).
 */
export function computeSnapTarget(
    currentOffset: number,
    velocityX: number,
    screenWidth: number,
): 0 | 1 {
    'worklet';
    const normalizedVelocity = -velocityX / screenWidth;
    const projected = currentOffset + normalizedVelocity * 0.15;
    return projected > 0.5 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SwipeablePagerProps {
    leftPage: React.ReactNode;
    rightPage: React.ReactNode;
    pageOffset: SharedValue<number>;
    onPageChange: (index: 0 | 1) => void;
}

export const SwipeablePager = React.memo(function SwipeablePager({
    leftPage,
    rightPage,
    pageOffset,
    onPageChange,
}: SwipeablePagerProps) {
    const { width: screenWidth } = useWindowDimensions();
    const startPage = useSharedValue(0);

    // Stable callback ref — avoids gesture rebuild on onPageChange identity change
    const onPageChangeRef = React.useRef(onPageChange);
    onPageChangeRef.current = onPageChange;

    const triggerPageChange = React.useCallback((index: 0 | 1) => {
        onPageChangeRef.current(index);
    }, []);

    // Pan gesture — horizontal pager
    // Native only: failOffsetY to yield vertical scroll to ChatList's FlatList.
    // Web: touchAction: pan-y on the Animated.View handles this at compositor level.
    const panGesture = React.useMemo(() => {
        const gesture = Gesture.Pan()
            .activeOffsetX([-15, 15]);

        if (Platform.OS !== 'web') {
            gesture.failOffsetY([-10, 10]);
        }

        return gesture
            .onBegin(() => {
                'worklet';
                startPage.value = Math.round(pageOffset.value);
            })
            .onChange((e) => {
                'worklet';
                const next = startPage.value - e.translationX / screenWidth;
                pageOffset.value = Math.max(0, Math.min(1, next));
            })
            .onEnd((e) => {
                'worklet';
                const target = computeSnapTarget(pageOffset.value, e.velocityX, screenWidth);
                pageOffset.value = withSpring(target, PAGER_SPRING_CONFIG);
                runOnJS(triggerPageChange)(target);
            });
    }, [screenWidth, pageOffset, triggerPageChange, startPage]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: -pageOffset.value * screenWidth }],
    }));

    return (
        <GestureDetector gesture={panGesture}>
            <View style={{ flex: 1, overflow: 'hidden' }}>
                <Animated.View
                    style={[
                        { flexDirection: 'row', flex: 1 },
                        // Web: compositor-level scroll discrimination (same pattern as SwipeableRow)
                        Platform.OS === 'web' ? { touchAction: 'pan-y' } as any : undefined,
                        animatedStyle,
                    ]}
                >
                    <View style={{ width: screenWidth, height: '100%' }}>
                        {leftPage}
                    </View>
                    <View style={{ width: screenWidth, height: '100%' }}>
                        {rightPage}
                    </View>
                </Animated.View>
            </View>
        </GestureDetector>
    );
});
