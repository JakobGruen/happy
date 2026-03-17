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
    const normalizedVelocity = -velocityX / screenWidth;
    const projected = currentOffset + normalizedVelocity * 0.15;
    return projected > 0.5 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Component — to be filled in Task 2
// ---------------------------------------------------------------------------

export interface SwipeablePagerProps {
    leftPage: React.ReactNode;
    rightPage: React.ReactNode;
    pageOffset: SharedValue<number>;
    onPageChange: (index: 0 | 1) => void;
}

export const SwipeablePager = React.memo(function SwipeablePager(_props: SwipeablePagerProps) {
    return null; // placeholder — implemented in Task 2
});
