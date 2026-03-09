import React from 'react';
import { Animated, PanResponder, View } from 'react-native';

export interface SwipeableRowRef {
    close: () => void;
}

interface SwipeableRowProps {
    children: React.ReactNode;
    renderRightActions?: () => React.ReactNode;
    renderLeftActions?: () => React.ReactNode;
    overshootRight?: boolean;
    overshootLeft?: boolean;
    enabled?: boolean;
}

/**
 * Web-compatible swipeable row using PanResponder + Animated.
 * On native, SwipeableRow.tsx re-exports react-native-gesture-handler's Swipeable.
 * Discriminates horizontal vs vertical movement to avoid hijacking scroll.
 */
export const SwipeableRow = React.forwardRef<SwipeableRowRef, SwipeableRowProps>(
    ({ children, renderRightActions, renderLeftActions, overshootRight = true, overshootLeft = true, enabled = true }, ref) => {
        const translateX = React.useRef(new Animated.Value(0)).current;
        const rightActionsWidth = React.useRef(112);
        const leftActionsWidth = React.useRef(112);
        const openDirection = React.useRef<'left' | 'right' | null>(null);

        const close = React.useCallback(() => {
            openDirection.current = null;
            Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: false,
                tension: 100,
                friction: 20,
            }).start();
        }, [translateX]);

        React.useImperativeHandle(ref, () => ({ close }));

        const panResponder = React.useMemo(() => {
            if (!enabled) return null;

            let startValue = 0;

            return PanResponder.create({
                onMoveShouldSetPanResponder: (_, gs) => {
                    // Only claim horizontal gestures — let vertical scroll through
                    return Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5;
                },
                onPanResponderGrant: () => {
                    // Start from current open position
                    if (openDirection.current === 'left') {
                        startValue = -rightActionsWidth.current;
                    } else if (openDirection.current === 'right') {
                        startValue = leftActionsWidth.current;
                    } else {
                        startValue = 0;
                    }
                },
                onPanResponderMove: (_, gs) => {
                    let newX = startValue + gs.dx;

                    // Clamp: no movement in directions without actions
                    if (!renderLeftActions) {
                        newX = Math.min(0, newX);
                    }
                    if (!renderRightActions) {
                        newX = Math.max(0, newX);
                    }

                    // Prevent overshooting past action width
                    if (!overshootRight && renderRightActions) {
                        newX = Math.max(-rightActionsWidth.current, newX);
                    }
                    if (!overshootLeft && renderLeftActions) {
                        newX = Math.min(leftActionsWidth.current, newX);
                    }

                    translateX.setValue(newX);
                },
                onPanResponderRelease: (_, gs) => {
                    const currentX = startValue + gs.dx;
                    const threshold = 40;

                    let targetX = 0;
                    let newDirection: 'left' | 'right' | null = null;

                    // Position-based snap
                    if (currentX < -threshold && renderRightActions) {
                        targetX = -rightActionsWidth.current;
                        newDirection = 'left';
                    } else if (currentX > threshold && renderLeftActions) {
                        targetX = leftActionsWidth.current;
                        newDirection = 'right';
                    }

                    // Fast swipe overrides position
                    if (gs.vx < -0.5 && renderRightActions) {
                        targetX = -rightActionsWidth.current;
                        newDirection = 'left';
                    } else if (gs.vx > 0.5 && renderLeftActions) {
                        targetX = leftActionsWidth.current;
                        newDirection = 'right';
                    }

                    openDirection.current = newDirection;
                    Animated.spring(translateX, {
                        toValue: targetX,
                        useNativeDriver: false,
                        tension: 100,
                        friction: 20,
                    }).start();
                },
            });
        }, [enabled, overshootRight, overshootLeft, renderRightActions, renderLeftActions, translateX]);

        return (
            <View style={{ overflow: 'hidden', position: 'relative' }}>
                {/* Left actions — revealed when swiping right */}
                {renderLeftActions && (
                    <View
                        style={{ position: 'absolute', left: 0, top: 0, bottom: 0 }}
                        onLayout={(e) => { leftActionsWidth.current = e.nativeEvent.layout.width; }}
                    >
                        {renderLeftActions()}
                    </View>
                )}
                {/* Right actions — revealed when swiping left */}
                {renderRightActions && (
                    <View
                        style={{ position: 'absolute', right: 0, top: 0, bottom: 0 }}
                        onLayout={(e) => { rightActionsWidth.current = e.nativeEvent.layout.width; }}
                    >
                        {renderRightActions()}
                    </View>
                )}
                {/* Sliding content layer */}
                <Animated.View
                    {...(panResponder?.panHandlers || {})}
                    style={{ transform: [{ translateX }] }}
                >
                    {children}
                </Animated.View>
            </View>
        );
    }
);
