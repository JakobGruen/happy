import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolation,
    type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

// ---------------------------------------------------------------------------
// Auto-close registry — module-level singleton (like ImageViewerManager)
// ---------------------------------------------------------------------------

const registry = new Set<{ close: () => void }>();

function registerEntry(entry: { close: () => void }): () => void {
    registry.add(entry);
    return () => { registry.delete(entry); };
}

function closeAllExceptEntry(exclude: { close: () => void }): void {
    registry.forEach(entry => {
        if (entry !== exclude) entry.close();
    });
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_WIDTH = 112;

const SPRING_CONFIG = {
    damping: 20,
    stiffness: 200,
    mass: 0.8,
};

const SNAP_BACK_SPRING = {
    damping: 25,
    stiffness: 300,
    mass: 0.5,
    overshootClamping: true,
};

const FULL_SWIPE_RATIO = 0.50;
const OPEN_THRESHOLD = ACTION_WIDTH * 0.35;
const VELOCITY_OPEN = 500;
const VELOCITY_FULL_SWIPE = 1200;
const FULL_SWIPE_DURATION = 200;
const VANISH_DURATION = 250;
// Mild rubber band only at the very edge (past 80% of row width)
const RUBBER_BAND_FACTOR = 0.5;
const RUBBER_BAND_START_RATIO = 0.80;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SwipeableRowRef {
    close: () => void;
    /** Slide content off-screen in a direction and collapse the row height */
    vanish: (direction: 'left' | 'right') => void;
}

export interface SwipeableRowProps {
    children: React.ReactNode;
    renderRightActions?: (progress?: SharedValue<number>) => React.ReactNode;
    renderLeftActions?: (progress?: SharedValue<number>) => React.ReactNode;
    overshootRight?: boolean;
    overshootLeft?: boolean;
    enabled?: boolean;
    /** Called on full-swipe-left (right action triggered) */
    onRightAction?: () => void;
    /** Called on full-swipe-right (left action triggered) */
    onLeftAction?: () => void;
    /** Color for the fill animation on full-swipe-left */
    rightActionColor?: string;
    /** Color for the fill animation on full-swipe-right */
    leftActionColor?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Rubber-band: slows drag past a threshold for natural overshoot feel */
function rubberBand(offset: number, limit: number, factor: number): number {
    if (Math.abs(offset) <= limit) return offset;
    const sign = offset < 0 ? -1 : 1;
    const overshoot = Math.abs(offset) - limit;
    return sign * (limit + overshoot * factor);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SwipeableRow = React.forwardRef<SwipeableRowRef, SwipeableRowProps>(
    ({
        children,
        renderRightActions,
        renderLeftActions,
        overshootRight = true,
        overshootLeft = true,
        enabled = true,
        onRightAction,
        onLeftAction,
        rightActionColor,
        leftActionColor,
    }, ref) => {
        const translateX = useSharedValue(0);
        const rightProgress = useSharedValue(0);
        const leftProgress = useSharedValue(0);
        const rowWidth = useSharedValue(0);
        const rowHeight = useSharedValue<number | undefined>(undefined);
        const vanishProgress = useSharedValue(1); // 1 = visible, 0 = collapsed
        const startX = useSharedValue(0);
        const didHapticOpen = useSharedValue(false);
        const didHapticFull = useSharedValue(false);

        const hasRightFullSwipe = !!onRightAction && !!renderRightActions;
        const hasLeftFullSwipe = !!onLeftAction && !!renderLeftActions;

        // ---------------------------------------------------------------
        // Close handler
        // ---------------------------------------------------------------
        const closeToZero = useCallback(() => {
            translateX.value = withSpring(0, SNAP_BACK_SPRING);
            rightProgress.value = withTiming(0, { duration: 200 });
            leftProgress.value = withTiming(0, { duration: 200 });
        }, [translateX, rightProgress, leftProgress]);

        // ---------------------------------------------------------------
        // Vanish animation: slide off + collapse height
        // ---------------------------------------------------------------
        const vanish = useCallback((direction: 'left' | 'right') => {
            const target = direction === 'left' ? -rowWidth.value : rowWidth.value;
            translateX.value = withTiming(target, { duration: FULL_SWIPE_DURATION });
            vanishProgress.value = withTiming(0, { duration: VANISH_DURATION });
        }, [translateX, rowWidth, vanishProgress]);

        React.useImperativeHandle(ref, () => ({ close: closeToZero, vanish }));

        // ---------------------------------------------------------------
        // Registry (auto-close coordination)
        // ---------------------------------------------------------------
        const registryEntry = useRef({ close: closeToZero });
        registryEntry.current.close = closeToZero;

        useEffect(() => {
            return registerEntry(registryEntry.current);
        }, []);

        const closeOtherRows = useCallback(() => {
            closeAllExceptEntry(registryEntry.current);
        }, []);

        // ---------------------------------------------------------------
        // Callback refs (stable, no gesture rebuilds)
        // ---------------------------------------------------------------
        const onRightActionRef = useRef(onRightAction);
        onRightActionRef.current = onRightAction;
        const onLeftActionRef = useRef(onLeftAction);
        onLeftActionRef.current = onLeftAction;

        const triggerRightAction = useCallback(() => {
            onRightActionRef.current?.();
        }, []);

        const triggerLeftAction = useCallback(() => {
            onLeftActionRef.current?.();
        }, []);

        const fireHapticLight = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, []);
        const fireHapticMedium = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }, []);

        // ---------------------------------------------------------------
        // Full-swipe completion: slide off → collapse → trigger callback
        // ---------------------------------------------------------------
        const completeFullSwipeRight = useCallback(() => {
            translateX.value = withTiming(-rowWidth.value, { duration: FULL_SWIPE_DURATION });
            vanishProgress.value = withTiming(0, { duration: VANISH_DURATION }, (finished) => {
                if (finished) {
                    runOnJS(triggerRightAction)();
                }
            });
        }, [rowWidth, translateX, vanishProgress, triggerRightAction]);

        const completeFullSwipeLeft = useCallback(() => {
            translateX.value = withTiming(rowWidth.value, { duration: FULL_SWIPE_DURATION });
            vanishProgress.value = withTiming(0, { duration: VANISH_DURATION }, (finished) => {
                if (finished) {
                    runOnJS(triggerLeftAction)();
                }
            });
        }, [rowWidth, translateX, vanishProgress, triggerLeftAction]);

        // ---------------------------------------------------------------
        // Pan gesture
        //
        // Scroll discrimination strategy:
        // - Web: `touch-action: pan-y` on content lets browser handle vertical
        //        scroll natively. Only `activeOffsetX` needed — no `failOffsetY`
        //        since the browser never sends vertical-dominant gestures to JS.
        // - Native: `activeOffsetX` + `failOffsetY` race condition — gesture
        //           fails if vertical movement exceeds threshold first.
        // ---------------------------------------------------------------
        const panGesture = useMemo(() => {
            const gesture = Gesture.Pan()
                .enabled(enabled)
                .activeOffsetX([-10, 10]);

            // On native, add vertical fail offset for scroll discrimination.
            // On web, touch-action: pan-y handles this at the compositor level.
            if (Platform.OS !== 'web') {
                gesture.failOffsetY([-5, 5]);
            }

            gesture
                .onBegin(() => {
                    startX.value = translateX.value;
                    didHapticOpen.value = false;
                    didHapticFull.value = false;
                })
                .onStart(() => {
                    runOnJS(closeOtherRows)();
                })
                .onUpdate((e) => {
                    let next = startX.value + e.translationX;

                    // Clamp: no swipe in directions without actions
                    if (!renderLeftActions) {
                        next = Math.min(0, next);
                    }
                    if (!renderRightActions) {
                        next = Math.max(0, next);
                    }

                    // Overshoot handling:
                    // - Full-swipe available: slide freely (like iOS Mail),
                    //   with light rubber band only near row edge
                    // - No full-swipe + overshoot disabled: hard clamp at ACTION_WIDTH
                    // - No full-swipe + overshoot enabled: slide freely
                    if (next < -ACTION_WIDTH) {
                        if (hasRightFullSwipe) {
                            // Free slide, rubber band only near row edge
                            const rubberStart = rowWidth.value * RUBBER_BAND_START_RATIO;
                            if (Math.abs(next) > rubberStart) {
                                next = rubberBand(next, rubberStart, RUBBER_BAND_FACTOR);
                            }
                        } else if (!overshootRight) {
                            next = -ACTION_WIDTH;
                        }
                    }
                    if (next > ACTION_WIDTH) {
                        if (hasLeftFullSwipe) {
                            const rubberStart = rowWidth.value * RUBBER_BAND_START_RATIO;
                            if (Math.abs(next) > rubberStart) {
                                next = rubberBand(next, rubberStart, RUBBER_BAND_FACTOR);
                            }
                        } else if (!overshootLeft) {
                            next = ACTION_WIDTH;
                        }
                    }

                    translateX.value = next;

                    // Progress for action button animations (clamped 0-1)
                    rightProgress.value = interpolate(
                        -next, [0, ACTION_WIDTH], [0, 1],
                        Extrapolation.CLAMP
                    );
                    leftProgress.value = interpolate(
                        next, [0, ACTION_WIDTH], [0, 1],
                        Extrapolation.CLAMP
                    );

                    // Haptic at open threshold
                    if (!didHapticOpen.value && Math.abs(next) > OPEN_THRESHOLD) {
                        didHapticOpen.value = true;
                        runOnJS(fireHapticLight)();
                    }

                    // Haptic at full-swipe threshold
                    const fullThreshold = rowWidth.value * FULL_SWIPE_RATIO;
                    if (!didHapticFull.value && fullThreshold > 0 && Math.abs(next) > fullThreshold) {
                        didHapticFull.value = true;
                        runOnJS(fireHapticMedium)();
                    }
                })
                .onEnd((e) => {
                    const currentX = translateX.value;
                    const vx = e.velocityX;
                    const fullThreshold = rowWidth.value * FULL_SWIPE_RATIO;

                    // --- Right actions (swipe left, negative translateX) ---
                    if (hasRightFullSwipe) {
                        if (currentX < -fullThreshold || vx < -VELOCITY_FULL_SWIPE) {
                            runOnJS(completeFullSwipeRight)();
                            return;
                        }
                    }
                    if (renderRightActions && (currentX < -OPEN_THRESHOLD || vx < -VELOCITY_OPEN)) {
                        translateX.value = withSpring(-ACTION_WIDTH, { ...SPRING_CONFIG, velocity: vx });
                        runOnJS(fireHapticLight)();
                        return;
                    }

                    // --- Left actions (swipe right, positive translateX) ---
                    if (hasLeftFullSwipe) {
                        if (currentX > fullThreshold || vx > VELOCITY_FULL_SWIPE) {
                            runOnJS(completeFullSwipeLeft)();
                            return;
                        }
                    }
                    if (renderLeftActions && (currentX > OPEN_THRESHOLD || vx > VELOCITY_OPEN)) {
                        translateX.value = withSpring(ACTION_WIDTH, { ...SPRING_CONFIG, velocity: vx });
                        runOnJS(fireHapticLight)();
                        return;
                    }

                    // --- Snap back (includes closing from open state) ---
                    translateX.value = withSpring(0, { ...SNAP_BACK_SPRING, velocity: vx });
                    rightProgress.value = withTiming(0, { duration: 200 });
                    leftProgress.value = withTiming(0, { duration: 200 });
                });

            return gesture;
        }, [
            enabled, renderRightActions, renderLeftActions,
            overshootRight, overshootLeft,
            hasRightFullSwipe, hasLeftFullSwipe,
            closeOtherRows, completeFullSwipeRight, completeFullSwipeLeft,
            fireHapticLight, fireHapticMedium,
            translateX, startX, rightProgress, leftProgress, rowWidth,
            didHapticOpen, didHapticFull,
        ]);

        // ---------------------------------------------------------------
        // Animated styles
        // ---------------------------------------------------------------
        const contentAnimStyle = useAnimatedStyle(() => ({
            transform: [{ translateX: translateX.value }],
        }));

        const rightActionsAnimStyle = useAnimatedStyle(() => ({
            width: Math.max(0, -translateX.value),
        }));

        const leftActionsAnimStyle = useAnimatedStyle(() => ({
            width: Math.max(0, translateX.value),
        }));

        const containerAnimStyle = useAnimatedStyle(() => {
            if (vanishProgress.value >= 1) return {};
            const h = rowHeight.value ?? 0;
            return {
                height: h * vanishProgress.value,
                opacity: vanishProgress.value,
                overflow: 'hidden' as const,
            };
        });

        // ---------------------------------------------------------------
        // Render
        // ---------------------------------------------------------------
        return (
            <Animated.View
                style={[{ overflow: 'hidden', position: 'relative' }, containerAnimStyle]}
                onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    rowWidth.value = e.nativeEvent.layout.width;
                    if (rowHeight.value === undefined) {
                        rowHeight.value = h;
                    }
                }}
            >
                {renderLeftActions && (
                    <Animated.View style={[
                        { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden',
                          backgroundColor: leftActionColor ?? 'transparent' },
                        leftActionsAnimStyle,
                    ]}>
                        {renderLeftActions(leftProgress)}
                    </Animated.View>
                )}

                {renderRightActions && (
                    <Animated.View style={[
                        { position: 'absolute', right: 0, top: 0, bottom: 0, overflow: 'hidden',
                          backgroundColor: rightActionColor ?? 'transparent' },
                        rightActionsAnimStyle,
                    ]}>
                        {renderRightActions(rightProgress)}
                    </Animated.View>
                )}

                <GestureDetector gesture={panGesture}>
                    <Animated.View
                        style={[
                            contentAnimStyle,
                            // touch-action: pan-y tells browser to handle vertical scroll natively
                            // while JS handles horizontal. This is the web scroll fix.
                            // @ts-ignore — touchAction is a valid CSS property on web
                            Platform.OS === 'web' ? { touchAction: 'pan-y' } : undefined,
                        ]}
                    >
                        {children}
                    </Animated.View>
                </GestureDetector>
            </Animated.View>
        );
    }
);
