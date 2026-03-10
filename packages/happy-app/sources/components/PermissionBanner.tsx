import React from 'react';
import { View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from '@/components/StyledText';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';
import { usePendingPermissionQueue } from '@/sync/storage';
import { sessionAllow, sessionDeny } from '@/sync/ops';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { getSessionName } from '@/utils/sessionUtils';
import { t } from '@/text';
import { isNotificationOnlyTool } from '@/utils/web/browserNotifications';

function isPlanTool(tool: string): boolean {
    return tool === 'ExitPlanMode' || tool === 'exit_plan_mode';
}

/**
 * Global floating banner that shows pending permission requests from sessions
 * the user is NOT currently viewing. Displays one request at a time with
 * Allow/Deny quick actions. When resolved, the next request animates in.
 *
 * For AskUserQuestion / ExitPlanMode, shows a navigate-only banner (no
 * allow/deny) since these need in-session interaction.
 *
 * Mounted in _layout.tsx — visible on all screens.
 */
export const PermissionBanner = React.memo(() => {
    const queue = usePendingPermissionQueue();
    const navigateToSession = useNavigateToSession();
    const [loadingAction, setLoadingAction] = React.useState<string | null>(null);

    if (queue.length === 0) return null;

    const current = queue[0];
    const remaining = queue.length - 1;
    const sessionName = getSessionName(current.session);
    const notificationOnly = isNotificationOnlyTool(current.tool);

    const toolLine = notificationOnly
        ? (isPlanTool(current.tool) ? t('notifications.permissionPlanReview') : t('notifications.permissionQuestion'))
        : t('notifications.permissionTool', {
            tool: current.tool,
            description: current.description ?? undefined,
        });

    const handleAllow = async () => {
        if (loadingAction) return;
        setLoadingAction('allow');
        try {
            await sessionAllow(current.sessionId, current.permissionId);
        } catch (error) {
            console.error('Failed to allow permission from banner:', error);
        } finally {
            setLoadingAction(null);
        }
    };

    const handleDeny = async () => {
        if (loadingAction) return;
        setLoadingAction('deny');
        try {
            await sessionDeny(current.sessionId, current.permissionId);
        } catch (error) {
            console.error('Failed to deny permission from banner:', error);
        } finally {
            setLoadingAction(null);
        }
    };

    const handleNavigate = () => {
        navigateToSession(current.sessionId);
    };

    return (
        <Animated.View
            key={current.permissionId}
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.container}
        >
            <View style={notificationOnly ? styles.bannerNotification : styles.banner}>
                <TouchableOpacity
                    style={styles.contentArea}
                    onPress={handleNavigate}
                    activeOpacity={0.7}
                >
                    <View style={notificationOnly ? styles.iconContainerNotification : styles.iconContainer}>
                        <Ionicons
                            name={notificationOnly
                                ? (isPlanTool(current.tool) ? 'document-text-outline' : 'chatbubble-ellipses-outline')
                                : 'shield-outline'
                            }
                            size={18}
                            style={notificationOnly ? styles.iconNotification : styles.icon}
                        />
                    </View>
                    <View style={styles.textArea}>
                        <Text style={styles.sessionName} numberOfLines={1}>
                            {sessionName}
                        </Text>
                        <Text style={notificationOnly ? styles.toolDescriptionNotification : styles.toolDescription} numberOfLines={1}>
                            {toolLine}
                        </Text>
                        {remaining > 0 && (
                            <Text style={styles.moreCount}>
                                {t('notifications.morePermissions', { count: remaining })}
                            </Text>
                        )}
                    </View>
                </TouchableOpacity>

                {notificationOnly ? (
                    <TouchableOpacity
                        style={styles.chevronButton}
                        onPress={handleNavigate}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="chevron-forward" size={20} style={styles.chevronIcon} />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.denyButton}
                            onPress={handleDeny}
                            disabled={loadingAction !== null}
                            activeOpacity={0.7}
                        >
                            {loadingAction === 'deny' ? (
                                <ActivityIndicator size="small" />
                            ) : (
                                <Ionicons name="close" size={18} style={styles.denyIcon} />
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.allowButton}
                            onPress={handleAllow}
                            disabled={loadingAction !== null}
                            activeOpacity={0.7}
                        >
                            {loadingAction === 'allow' ? (
                                <ActivityIndicator size="small" />
                            ) : (
                                <Ionicons name="checkmark" size={18} style={styles.allowIcon} />
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </Animated.View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        paddingHorizontal: 12,
        paddingTop: 8,
    },
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 12,
        shadowOpacity: theme.dark ? 0.4 : 0.15,
        elevation: 8,
        borderWidth: 1,
        borderColor: theme.colors.box.warning.border + '80',
    },
    bannerNotification: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 12,
        shadowOpacity: theme.dark ? 0.4 : 0.15,
        elevation: 8,
        borderWidth: 1,
        borderColor: theme.colors.textLink + '60',
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
    iconContainerNotification: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.textLink + '20',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    icon: {
        color: theme.colors.box.warning.border,
    },
    iconNotification: {
        color: theme.colors.textLink,
    },
    textArea: {
        flex: 1,
    },
    sessionName: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text,
    },
    toolDescription: {
        fontSize: 12,
        color: theme.colors.box.warning.text,
        marginTop: 1,
    },
    toolDescriptionNotification: {
        fontSize: 12,
        color: theme.colors.textLink,
        marginTop: 1,
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
    chevronButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chevronIcon: {
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
}));
