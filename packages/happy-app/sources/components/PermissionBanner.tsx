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

/**
 * Global floating banner that shows pending permission requests from sessions
 * the user is NOT currently viewing. Displays one request at a time with
 * Allow/Deny quick actions. When resolved, the next request animates in.
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
            <View style={styles.banner}>
                <TouchableOpacity
                    style={styles.contentArea}
                    onPress={handleNavigate}
                    activeOpacity={0.7}
                >
                    <Ionicons name="shield-outline" size={20} style={styles.icon} />
                    <View style={styles.textArea}>
                        <Text style={styles.title} numberOfLines={1}>
                            {t('notifications.permissionNeeded', { session: sessionName, tool: current.tool })}
                        </Text>
                        {remaining > 0 && (
                            <Text style={styles.moreCount}>
                                {t('notifications.morePermissions', { count: remaining })}
                            </Text>
                        )}
                    </View>
                </TouchableOpacity>

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
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        shadowOpacity: theme.colors.shadow.opacity,
        elevation: 6,
        borderWidth: 1,
        borderColor: theme.colors.warning + '40',
    },
    contentArea: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 8,
    },
    icon: {
        color: theme.colors.warning,
        marginRight: 8,
    },
    textArea: {
        flex: 1,
    },
    title: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.text,
    },
    moreCount: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 1,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    denyButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.surfaceHighest,
        alignItems: 'center',
        justifyContent: 'center',
    },
    allowButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.success + '20',
        alignItems: 'center',
        justifyContent: 'center',
    },
    denyIcon: {
        color: theme.colors.textSecondary,
    },
    allowIcon: {
        color: theme.colors.success,
    },
}));
