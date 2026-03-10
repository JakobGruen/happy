import React from 'react';
import { View, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Text } from '@/components/StyledText';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native-unistyles';
import { UsePermissionActionsResult } from '@/hooks/usePermissionActions';
import { CurrentSessionPermissionItem } from '@/hooks/useCurrentSessionPermissions';
import { isNotificationOnlyTool } from '@/utils/web/browserNotifications';
import { t } from '@/text';

interface PermissionSheetBarProps {
    permission: CurrentSessionPermissionItem;
    actions: UsePermissionActionsResult;
    queueCount: number;
    isExpanded: boolean;
    onToggleExpand: () => void;
}

/**
 * Compact bar for the permission sheet — always visible when a permission is pending.
 * Shows tool icon, name/summary, Allow/Deny buttons, and expand chevron.
 *
 * For rich content tools (plan/question), shows "Tap to expand" instead of buttons.
 */
export const PermissionSheetBar = React.memo<PermissionSheetBarProps>(({
    permission,
    actions,
    queueCount,
    isExpanded,
    onToggleExpand,
}) => {
    const isRichTool = isNotificationOnlyTool(permission.tool);

    // Resolve display text — prefer llmSummary, fall back to description or tool name
    const displayText = permission.llmSummary
        ?? permission.description
        ?? permission.tool;

    const remaining = queueCount - 1;

    return (
        <View style={styles.bar}>
            <TouchableOpacity
                style={styles.contentArea}
                onPress={onToggleExpand}
                activeOpacity={0.7}
            >
                <View style={isRichTool ? styles.iconContainerRich : styles.iconContainer}>
                    <Ionicons
                        name={isRichTool ? 'chatbubble-ellipses-outline' : 'shield-outline'}
                        size={18}
                        style={isRichTool ? styles.richIcon : styles.shieldIcon}
                    />
                </View>
                <View style={styles.textArea}>
                    <Text style={styles.toolName} numberOfLines={1}>
                        {displayText}
                    </Text>
                    {remaining > 0 && (
                        <Text style={styles.moreCount}>
                            {t('notifications.morePermissions', { count: remaining })}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>

            {isRichTool ? (
                /* Rich content tools: show "Tap to expand" instead of allow/deny */
                <TouchableOpacity
                    style={styles.tapToExpandButton}
                    onPress={onToggleExpand}
                    activeOpacity={0.7}
                >
                    <Text style={styles.tapToExpandText}>{t('permissions.tapToExpand')}</Text>
                    <Ionicons name="chevron-up" size={16} style={styles.tapToExpandIcon} />
                </TouchableOpacity>
            ) : (
                <View style={styles.actions}>
                    {/* Deny button */}
                    <TouchableOpacity
                        style={styles.denyButton}
                        onPress={() => actions.handleDeny()}
                        disabled={actions.loadingKey !== null}
                        activeOpacity={0.7}
                    >
                        {actions.loadingKey === 'deny' ? (
                            <ActivityIndicator size="small" />
                        ) : (
                            <Ionicons name="close" size={18} style={styles.denyIcon} />
                        )}
                    </TouchableOpacity>

                    {/* Allow button */}
                    <TouchableOpacity
                        style={styles.allowButton}
                        onPress={actions.handleAllowOnce}
                        disabled={actions.loadingKey !== null}
                        activeOpacity={0.7}
                    >
                        {actions.loadingKey === 'allow-once' ? (
                            <ActivityIndicator size="small" />
                        ) : (
                            <Ionicons name="checkmark" size={18} style={styles.allowIcon} />
                        )}
                    </TouchableOpacity>

                    {/* Expand/collapse chevron */}
                    <TouchableOpacity
                        style={styles.expandButton}
                        onPress={onToggleExpand}
                        activeOpacity={0.7}
                        hitSlop={8}
                    >
                        <Ionicons
                            name={isExpanded ? 'chevron-down' : 'chevron-up'}
                            size={18}
                            style={styles.expandIcon}
                        />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: theme.colors.surfaceHigh,
        borderTopWidth: 1,
        borderTopColor: theme.colors.box.warning.border + '80',
    },
    contentArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 8,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.box.warning.border + '20',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    iconContainerRich: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.textLink + '20',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    shieldIcon: {
        color: theme.colors.box.warning.border,
    },
    richIcon: {
        color: theme.colors.textLink,
    },
    textArea: {
        flex: 1,
    },
    toolName: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text,
    },
    moreCount: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    tapToExpandButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    tapToExpandText: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.textLink,
    },
    tapToExpandIcon: {
        color: theme.colors.textLink,
    },
    denyButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: theme.colors.permissionButton.deny.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    allowButton: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: theme.colors.permissionButton.allow.background,
        alignItems: 'center',
        justifyContent: 'center',
    },
    denyIcon: {
        color: theme.colors.permissionButton.deny.text,
    },
    allowIcon: {
        color: theme.colors.permissionButton.allow.text,
    },
    expandButton: {
        width: 28,
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    expandIcon: {
        color: theme.colors.textSecondary,
    },
}));
