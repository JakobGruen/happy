import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
    cancelAnimation,
    FadeIn,
    FadeOut,
    SlideInDown,
    SlideOutDown,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrentSessionPermissions } from '@/hooks/useCurrentSessionPermissions';
import { usePermissionActions } from '@/hooks/usePermissionActions';
import { PermissionSheetBar } from './PermissionSheetBar';
import { PermissionSheetExpanded } from './PermissionSheetExpanded';

const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };
const SWIPE_MINIMIZE_THRESHOLD = 80;

interface SessionPermissionSheetProps {
    sessionId: string;
}

/**
 * Permission modal for the currently viewed session.
 *
 * Two states:
 * - Expanded (default): Floating card with full context, backdrop overlay.
 *   Swipe down or tap backdrop → minimize to compact bar.
 * - Minimized: Compact bar pinned at bottom with quick Allow/Deny.
 *   Tap or chevron → expand back.
 */
export const SessionPermissionSheet = React.memo<SessionPermissionSheetProps>(({ sessionId }) => {
    const { firstPermission, queueCount } = useCurrentSessionPermissions(sessionId);
    const safeArea = useSafeAreaInsets();
    const [isExpanded, setIsExpanded] = useState(true);

    const actions = usePermissionActions(
        sessionId,
        firstPermission?.permissionId ?? null,
        firstPermission?.tool ?? '',
        firstPermission?.toolInput,
        firstPermission !== null,
    );

    // Animation state for drag gestures
    const translateY = useSharedValue(0);

    // Reset to expanded when a new permission arrives
    useEffect(() => {
        setIsExpanded(true);
        cancelAnimation(translateY);
        translateY.value = withSpring(0, SPRING_CONFIG);
    }, [firstPermission?.permissionId]);

    const handleToggleExpand = useCallback(() => {
        setIsExpanded(prev => !prev);
    }, []);

    const handleMinimize = useCallback(() => {
        setIsExpanded(false);
    }, []);

    // Stable ref for minimize from gesture worklet thread
    const handleMinimizeRef = useRef(handleMinimize);
    handleMinimizeRef.current = handleMinimize;

    const handleMinimizeFromSwipe = useCallback(() => {
        handleMinimizeRef.current();
    }, []);

    // Pan gesture on the expanded card — swipe down to minimize (not deny)
    const panGesture = useMemo(() => Gesture.Pan()
        .onUpdate((e) => {
            translateY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
            if (e.translationY > SWIPE_MINIMIZE_THRESHOLD || e.velocityY > 500) {
                // Swipe past threshold → minimize to bar
                translateY.value = withTiming(400, { duration: 200 });
                runOnJS(handleMinimizeFromSwipe)();
            } else {
                // Snap back
                translateY.value = withSpring(0, SPRING_CONFIG);
            }
        }), [handleMinimizeFromSwipe]);

    const cardAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    // Reset translateY when switching back to expanded
    useEffect(() => {
        if (isExpanded) {
            cancelAnimation(translateY);
            translateY.value = withSpring(0, SPRING_CONFIG);
        }
    }, [isExpanded]);

    if (!firstPermission) {
        return null;
    }

    // --- Expanded: floating card with backdrop ---
    if (isExpanded) {
        return (
            <View style={styles.backdrop}>
                {/* Backdrop fades in */}
                <Animated.View
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(150)}
                    style={styles.backdropOverlay}
                >
                    <Pressable style={styles.backdropTouchable} onPress={handleMinimize} />
                </Animated.View>

                {/* Card slides up from bottom */}
                <GestureDetector gesture={panGesture}>
                    <Animated.View
                        entering={SlideInDown.springify().damping(20).stiffness(200)}
                        style={[styles.floatingCard, { marginBottom: Math.max(safeArea.bottom, 16) + 40 }, cardAnimatedStyle]}
                    >
                        <View style={styles.cardInner}>
                            <PermissionSheetExpanded
                                permission={firstPermission}
                                queueCount={queueCount}
                                actions={actions}
                            />
                        </View>
                    </Animated.View>
                </GestureDetector>
            </View>
        );
    }

    // --- Minimized: compact bar at bottom ---
    return (
        <Animated.View
            key={`bar-${firstPermission.permissionId}`}
            entering={SlideInDown.duration(200)}
            exiting={SlideOutDown.duration(150)}
            style={[styles.barOverlay, { paddingBottom: safeArea.bottom }]}
        >
            <PermissionSheetBar
                permission={firstPermission}
                actions={actions}
                queueCount={queueCount}
                isExpanded={false}
                onToggleExpand={handleToggleExpand}
            />
        </Animated.View>
    );
});

const styles = StyleSheet.create((theme) => ({
    // Full-screen container for expanded state
    backdrop: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        justifyContent: 'flex-end',
    },
    // Semi-transparent overlay that fades in
    backdropOverlay: {
        ...({
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
        } as const),
    },
    backdropTouchable: {
        flex: 1,
    },
    // Floating card — not pinned to bottom, rounded all corners
    floatingCard: {
        marginHorizontal: 12,
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 16,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: -3 },
        shadowRadius: 16,
        shadowOpacity: theme.dark ? 0.5 : 0.2,
        elevation: 16,
    },
    cardInner: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    // Bottom bar overlay for minimized state
    barOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: theme.colors.surfaceHigh,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: -3 },
        shadowRadius: 12,
        shadowOpacity: theme.dark ? 0.4 : 0.15,
        elevation: 12,
    },
}));
