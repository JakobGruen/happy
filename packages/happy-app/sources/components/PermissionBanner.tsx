import React from 'react';
import { View, TouchableOpacity, ActivityIndicator, Dimensions, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';
import { usePendingPermissionQueue } from '@/sync/storage';
import { sessionAllow, sessionDeny } from '@/sync/ops';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { getSessionName } from '@/utils/sessionUtils';
import { t } from '@/text';
import { isNotificationOnlyTool } from '@/utils/web/browserNotifications';
import { PlanSheetContent } from '@/components/tools/PlanSheetContent';
import { QuestionSheetContent } from '@/components/tools/QuestionSheetContent';
import { usePermissionActions } from '@/hooks/usePermissionActions';
import { getSuggestionLabel } from '@/components/tools/permissionUtils';
import { CurrentSessionPermissionItem } from '@/hooks/useCurrentSessionPermissions';

function isPlanTool(tool: string): boolean {
    return tool === 'ExitPlanMode' || tool === 'exit_plan_mode';
}

/**
 * Global floating banner that shows pending permission requests from sessions
 * the user is NOT currently viewing. Displays one request at a time with
 * Allow/Deny quick actions. When resolved, the next request animates in.
 *
 * For AskUserQuestion / ExitPlanMode, shows a navigate-only banner (no
 * allow/deny) since these need in-session interaction. Tapping expands
 * a near-full-screen card with plan/question content for direct interaction.
 *
 * Mounted in _layout.tsx — visible on all screens.
 */
export const PermissionBanner = React.memo(() => {
    const queue = usePendingPermissionQueue();
    const navigateToSession = useNavigateToSession();
    const [loadingAction, setLoadingAction] = React.useState<string | null>(null);
    const [isExpanded, setIsExpanded] = React.useState(false);

    // Reset expansion when the current permission changes
    const currentPermId = queue.length > 0 ? queue[0].permissionId : null;
    React.useEffect(() => {
        setIsExpanded(false);
    }, [currentPermId]);

    if (queue.length === 0) return null;

    const current = queue[0];
    const remaining = queue.length - 1;
    const sessionName = getSessionName(current.session);
    const notificationOnly = isNotificationOnlyTool(current.tool);

    const toolLine = notificationOnly
        ? (isPlanTool(current.tool) ? t('notifications.permissionPlanReview') : t('notifications.permissionQuestion'))
        : (current.llmSummary
            ? current.llmSummary
            : t('notifications.permissionTool', {
                tool: current.tool,
                description: current.description ?? undefined,
            }));

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

    const handleBannerPress = () => {
        if (notificationOnly) {
            setIsExpanded(true);
        } else {
            handleNavigate();
        }
    };

    return (
        <>
            {/* Expanded overlay for rich content (plan/question) */}
            {isExpanded && notificationOnly && (
                <ExpandedBannerOverlay
                    current={current}
                    onDismiss={() => setIsExpanded(false)}
                    onNavigate={handleNavigate}
                />
            )}

            <Animated.View
                key={current.permissionId}
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
                style={styles.container}
            >
                <View style={notificationOnly ? styles.bannerNotification : styles.banner}>
                    <TouchableOpacity
                        style={styles.contentArea}
                        onPress={handleBannerPress}
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
                            onPress={handleBannerPress}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="chevron-down" size={20} style={styles.chevronIcon} />
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
        </>
    );
});

/**
 * Near-full-screen overlay card for plan/question content.
 * Shows rich content directly in the banner context without navigating.
 */
const ExpandedBannerOverlay = React.memo<{
    current: ReturnType<typeof usePendingPermissionQueue>[number];
    onDismiss: () => void;
    onNavigate: () => void;
}>(({ current, onDismiss, onNavigate }) => {
    const screenHeight = Dimensions.get('window').height;
    const isPlan = isPlanTool(current.tool);
    const isQuestion = current.tool === 'AskUserQuestion';
    const contentMaxHeight = screenHeight * 0.85 - 150; // header (~56px) + actions (~94px)

    // Map PendingPermissionItem to CurrentSessionPermissionItem shape
    const permissionItem: CurrentSessionPermissionItem = React.useMemo(() => ({
        permissionId: current.permissionId,
        tool: current.tool,
        toolInput: current.toolInput,
        description: current.description ?? null,
        llmSummary: current.llmSummary ?? null,
        permissionSuggestions: current.permissionSuggestions ?? null,
        decisionReason: null,
        createdAt: current.createdAt ?? null,
    }), [current.permissionId, current.tool, current.toolInput, current.description, current.llmSummary, current.permissionSuggestions, current.createdAt]);

    const actions = usePermissionActions(
        current.sessionId,
        current.permissionId,
        current.tool,
        current.toolInput,
        true,
    );

    const suggestions = current.permissionSuggestions;

    return (
        <>
            {/* Backdrop */}
            <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
                style={expandedStyles.backdrop}
            >
                <Pressable style={expandedStyles.backdropPress} onPress={onDismiss} />
            </Animated.View>

            {/* Card */}
            <Animated.View
                entering={SlideInDown.springify().damping(20).stiffness(200)}
                exiting={SlideOutDown.duration(200)}
                style={[expandedStyles.card, { maxHeight: screenHeight * 0.85 }]}
            >
                {/* Header */}
                <View style={expandedStyles.header}>
                    <View style={expandedStyles.headerLeft}>
                        <View style={expandedStyles.iconContainerRich}>
                            <Ionicons
                                name={isPlan ? 'document-text-outline' : 'chatbubble-ellipses-outline'}
                                size={18}
                                style={expandedStyles.headerIcon}
                            />
                        </View>
                        <View style={expandedStyles.headerTextArea}>
                            <Text style={expandedStyles.headerTitle} numberOfLines={1}>
                                {isPlan ? t('notifications.permissionPlanReview') : t('notifications.permissionQuestion')}
                            </Text>
                            <Text style={expandedStyles.headerSession} numberOfLines={1}>
                                {getSessionName(current.session)}
                            </Text>
                        </View>
                    </View>
                    <View style={expandedStyles.headerActions}>
                        <TouchableOpacity
                            style={expandedStyles.navigateButton}
                            onPress={onNavigate}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="open-outline" size={18} style={expandedStyles.navigateIcon} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={expandedStyles.dismissButton}
                            onPress={onDismiss}
                            activeOpacity={0.7}
                            hitSlop={8}
                        >
                            <Ionicons name="chevron-down" size={20} style={expandedStyles.dismissIcon} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Rich content — wrapped with explicit maxHeight for flex layout */}
                <View style={{ maxHeight: contentMaxHeight }}>
                    {isPlan && <PlanSheetContent permission={permissionItem} />}
                    {isQuestion && (
                        <QuestionSheetContent
                            permission={permissionItem}
                            sessionId={current.sessionId}
                        />
                    )}
                </View>

                {/* Plan action buttons (questions have their own submit/cancel) */}
                {isPlan && (
                    <View style={expandedStyles.planActions}>
                        {/* Allow once */}
                        <TouchableOpacity
                            style={expandedStyles.allowButton}
                            onPress={() => actions.handleAllowOnce()}
                            disabled={actions.loadingKey !== null}
                            activeOpacity={0.7}
                        >
                            {actions.loadingKey === 'allow-once' ? (
                                <ActivityIndicator size="small" />
                            ) : (
                                <Text style={expandedStyles.allowText}>{t('common.yes')}</Text>
                            )}
                        </TouchableOpacity>

                        {/* CC suggestion buttons */}
                        {suggestions && suggestions.length > 0 && suggestions.map((suggestion: any, idx: number) => (
                            <TouchableOpacity
                                key={idx}
                                style={expandedStyles.suggestionButton}
                                onPress={() => actions.handleSuggestion(idx, suggestion)}
                                disabled={actions.loadingKey !== null}
                                activeOpacity={0.7}
                            >
                                {actions.loadingKey === `suggestion-${idx}` ? (
                                    <ActivityIndicator size="small" />
                                ) : (
                                    <Text style={expandedStyles.suggestionText} numberOfLines={2}>
                                        {getSuggestionLabel(suggestion)}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        ))}

                        {/* Fallback: approve for session when no CC suggestions */}
                        {(!suggestions || suggestions.length === 0) && (
                            <TouchableOpacity
                                style={expandedStyles.suggestionButton}
                                onPress={() => actions.handleApproveForSession()}
                                disabled={actions.loadingKey !== null}
                                activeOpacity={0.7}
                            >
                                {actions.loadingKey === 'for-session' ? (
                                    <ActivityIndicator size="small" />
                                ) : (
                                    <Text style={expandedStyles.suggestionText}>
                                        {t('claude.permissions.yesForTool')}
                                    </Text>
                                )}
                            </TouchableOpacity>
                        )}

                        {/* Deny */}
                        <TouchableOpacity
                            style={expandedStyles.denyButton}
                            onPress={() => actions.handleDeny()}
                            disabled={actions.loadingKey !== null}
                            activeOpacity={0.7}
                        >
                            {actions.loadingKey === 'deny' ? (
                                <ActivityIndicator size="small" />
                            ) : (
                                <Text style={expandedStyles.denyText}>{t('common.deny')}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </Animated.View>
        </>
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

const expandedStyles = StyleSheet.create((theme) => ({
    backdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 199,
    },
    backdropPress: {
        flex: 1,
    },
    card: {
        position: 'absolute',
        bottom: 16,
        left: 12,
        right: 12,
        zIndex: 200,
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 16,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: -4 },
        shadowRadius: 20,
        shadowOpacity: theme.dark ? 0.5 : 0.2,
        elevation: 16,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    headerLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 8,
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
    headerIcon: {
        color: theme.colors.textLink,
    },
    headerTextArea: {
        flex: 1,
    },
    headerTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text,
    },
    headerSession: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 1,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    navigateButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    navigateIcon: {
        color: theme.colors.textSecondary,
    },
    dismissButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dismissIcon: {
        color: theme.colors.textSecondary,
    },
    planActions: {
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
    },
    allowButton: {
        backgroundColor: theme.colors.permissionButton.allow.background,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 40,
    },
    allowText: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.permissionButton.allow.text,
    },
    suggestionButton: {
        backgroundColor: theme.colors.surfaceHighest,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 40,
    },
    suggestionText: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.text,
        textAlign: 'center',
    },
    denyButton: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 40,
    },
    denyText: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.permissionButton.deny.background,
    },
}));
