import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
    cancelAnimation,
    FadeIn,
    FadeOut,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrentSessionPermissions } from '@/hooks/useCurrentSessionPermissions';
import { usePermissionActions } from '@/hooks/usePermissionActions';
import { PermissionSheetBar } from './PermissionSheetBar';
import { PermissionSheetExpanded } from './PermissionSheetExpanded';

const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };
const SWIPE_DENY_THRESHOLD = 120;

interface SessionPermissionSheetProps {
    sessionId: string;
}

/**
 * Bottom sheet permission modal for the currently viewed session.
 * Slides up when a Claude permission request is pending.
 *
 * Compact bar at bottom with Allow/Deny buttons.
 * Expand (chevron or swipe up) to see full details + suggestion buttons.
 * Swipe down past threshold = deny.
 */
export const SessionPermissionSheet = React.memo<SessionPermissionSheetProps>(({ sessionId }) => {
    const { firstPermission, queueCount } = useCurrentSessionPermissions(sessionId);
    const safeArea = useSafeAreaInsets();
    const [isExpanded, setIsExpanded] = useState(false);

    const actions = usePermissionActions(
        sessionId,
        firstPermission?.permissionId ?? null,
        firstPermission?.tool ?? '',
        firstPermission?.toolInput,
        firstPermission !== null,
    );

    // Animation state
    const translateY = useSharedValue(0); // 0 = resting, positive = dragging down

    // Reset expanded state when permission changes
    useEffect(() => {
        setIsExpanded(false);
        cancelAnimation(translateY);
        translateY.value = withSpring(0, SPRING_CONFIG);
    }, [firstPermission?.permissionId]);

    const handleToggleExpand = useCallback(() => {
        setIsExpanded(prev => !prev);
    }, []);

    // Use ref for deny callback to keep gesture handler stable
    const handleDenyRef = useRef(actions.handleDeny);
    handleDenyRef.current = actions.handleDeny;

    const handleDenyFromSwipe = useCallback(() => {
        handleDenyRef.current();
    }, []);

    // Memoize pan gesture to avoid re-registering on every render
    const panGesture = useMemo(() => Gesture.Pan()
        .onUpdate((e) => {
            // Only allow dragging downward
            translateY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
            if (e.translationY > SWIPE_DENY_THRESHOLD || e.velocityY > 800) {
                // Swipe past threshold → deny and dismiss
                translateY.value = withTiming(400, { duration: 200 });
                runOnJS(handleDenyFromSwipe)();
            } else {
                // Snap back
                translateY.value = withSpring(0, SPRING_CONFIG);
            }
        }), [handleDenyFromSwipe]);

    const sheetAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    if (!firstPermission) {
        return null;
    }

    return (
        <Animated.View
            key={firstPermission.permissionId}
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={[styles.overlay, { paddingBottom: safeArea.bottom }]}
        >
            <GestureDetector gesture={panGesture}>
                <Animated.View style={[styles.sheet, sheetAnimatedStyle]}>
                    {/* Inner wrapper for border radius clipping (separate from shadow container) */}
                    <View style={styles.sheetInner}>
                        {/* Expanded panel (above bar) */}
                        {isExpanded && (
                            <PermissionSheetExpanded
                                permission={firstPermission}
                                queueCount={queueCount}
                                actions={actions}
                            />
                        )}

                        {/* Compact bar (always visible) */}
                        <PermissionSheetBar
                            permission={firstPermission}
                            actions={actions}
                            queueCount={queueCount}
                            isExpanded={isExpanded}
                            onToggleExpand={handleToggleExpand}
                        />
                    </View>
                </Animated.View>
            </GestureDetector>
        </Animated.View>
    );
});

const styles = StyleSheet.create((theme) => ({
    overlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
    },
    sheet: {
        backgroundColor: theme.colors.surfaceHigh,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: -3 },
        shadowRadius: 12,
        shadowOpacity: theme.dark ? 0.4 : 0.15,
        elevation: 12,
    },
    sheetInner: {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: 'hidden',
    },
}));
