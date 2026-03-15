import React, { useState, useCallback, useEffect } from 'react';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';
import { useCurrentSessionPermissions } from '@/hooks/useCurrentSessionPermissions';
import { usePermissionActions } from '@/hooks/usePermissionActions';
import { PermissionSheetContext } from './permissionSheetContext';
import { PermissionSheetBar } from './PermissionSheetBar';

interface PermissionModalOrchestratorProps {
    sessionId: string;
    children: React.ReactNode;
}

/**
 * Orchestrator that replaces SessionPermissionSheet.
 *
 * Responsibilities:
 * 1. Provides PermissionSheetContext (true when any permission is pending)
 *    so PermissionFooter hides its inline UI for Claude sessions.
 * 2. Shows minimized bar when user swipes down on a ToolModal while
 *    a permission is still pending.
 * 3. Resets to non-minimized when a new permission arrives
 *    (ToolView auto-opens its own modal via the auto-open effect).
 *
 * The expanded state is NOT managed here — individual ToolView components
 * handle their own ToolModal open/close via Task 5's auto-open effect.
 */
export const PermissionModalOrchestrator = React.memo<PermissionModalOrchestratorProps>(({
    sessionId,
    children,
}) => {
    const { firstPermission, queueCount } = useCurrentSessionPermissions(sessionId);
    const safeArea = useSafeAreaInsets();
    const [isMinimized, setIsMinimized] = useState(false);

    const actions = usePermissionActions(
        sessionId,
        firstPermission?.permissionId ?? null,
        firstPermission?.tool ?? '',
        firstPermission?.toolInput,
        firstPermission !== null,
    );

    // When a NEW permission arrives (different permissionId), reset to not-minimized.
    // ToolView will auto-open the modal for the new permission.
    useEffect(() => {
        if (firstPermission) {
            setIsMinimized(false);
        }
    }, [firstPermission?.permissionId]);

    const handleToggleExpand = useCallback(() => {
        setIsMinimized(prev => !prev);
    }, []);

    const hasPermission = firstPermission !== null;

    return (
        <PermissionSheetContext.Provider value={hasPermission}>
            {children}

            {/* Minimized bar — shown when user swiped down on the modal
                but a permission is still pending */}
            {hasPermission && isMinimized && (
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
            )}
        </PermissionSheetContext.Provider>
    );
});

const styles = StyleSheet.create((theme) => ({
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
