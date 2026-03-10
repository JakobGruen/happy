import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
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
import { isNotificationOnlyTool } from '@/utils/web/browserNotifications';
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
 *   Swipe down on drag handle or tap backdrop → minimize to compact bar.
 *   For rich content tools (plan/question), card is taller (near full screen).
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

    // Rich content tools (plan/question/edit) get a larger card with flex layout
    const isRichContent = firstPermission !== null && (
        isNotificationOnlyTool(firstPermission.tool) ||
        ['Edit', 'Write', 'MultiEdit'].includes(firstPermission.tool)
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

    // Pan gesture for swipe-to-minimize (always enabled — attached to
    // either the full card for regular tools, or just the drag handle for rich content)
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

    // Card sizing — rich content extends near to the top of the screen
    const screenHeight = Dimensions.get('window').height;
    const richMaxHeight = screenHeight - safeArea.top - 16;
    const cardMarginBottom = isRichContent
        ? Math.max(safeArea.bottom, 16)
        : Math.max(safeArea.bottom, 16) + 40;

    // --- Expanded: floating card with backdrop ---
    if (isExpanded) {
        // For rich content: pan gesture only on the drag handle (avoids ScrollView conflicts)
        // For regular tools: pan gesture on the whole card
        const cardContent = (
            <Animated.View
                entering={SlideInDown.springify().damping(20).stiffness(200)}
                style={[
                    styles.floatingCard,
                    { marginBottom: cardMarginBottom },
                    isRichContent && { maxHeight: richMaxHeight },
                    cardAnimatedStyle,
                ]}
            >
                <View style={[styles.cardInner, isRichContent && { flex: 1 }]}>
                    {/* Drag handle — for rich content, wrapped in its own GestureDetector */}
                    {isRichContent ? (
                        <GestureDetector gesture={panGesture}>
                            <Animated.View style={styles.handleContainer}>
                                <View style={styles.handle} />
                            </Animated.View>
                        </GestureDetector>
                    ) : null}
                    <PermissionSheetExpanded
                        permission={firstPermission}
                        queueCount={queueCount}
                        actions={actions}
                        sessionId={sessionId}
                        hideHandle={isRichContent}
                        isRichContent={isRichContent}
                    />
                </View>
            </Animated.View>
        );

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

                {/* Card — full-card gesture for regular, handle-only for rich */}
                {isRichContent
                    ? cardContent
                    : <GestureDetector gesture={panGesture}>{cardContent}</GestureDetector>
                }
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
        zIndex: 1100,
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
    // Drag handle — extracted to SessionPermissionSheet for rich content gesture control
    handleContainer: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.textSecondary + '40',
    },
    // Bottom bar overlay for minimized state
    barOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1100,
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
