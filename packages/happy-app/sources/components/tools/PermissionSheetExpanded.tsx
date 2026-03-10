import React, { useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator, TextInput, Platform } from 'react-native';
import { Text } from '@/components/StyledText';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { UsePermissionActionsResult } from '@/hooks/usePermissionActions';
import { CurrentSessionPermissionItem } from '@/hooks/useCurrentSessionPermissions';
import { getSuggestionLabel } from './permissionUtils';
import { knownTools } from '@/components/tools/knownTools';
import { t } from '@/text';

interface PermissionSheetExpandedProps {
    permission: CurrentSessionPermissionItem;
    queueCount: number;
    actions: UsePermissionActionsResult;
}

/**
 * Expanded panel for the permission sheet — shows full details,
 * all suggestion buttons, and deny-with-feedback flow.
 */
export const PermissionSheetExpanded = React.memo<PermissionSheetExpandedProps>(({
    permission,
    queueCount,
    actions,
}) => {
    const { theme } = useUnistyles();
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackText, setFeedbackText] = useState('');

    const hasSuggestions = Array.isArray(permission.permissionSuggestions)
        && permission.permissionSuggestions.length > 0;

    const knownTool = knownTools[permission.tool as keyof typeof knownTools] as any;

    // Resolve tool title
    let toolTitle = permission.tool;
    if (knownTool?.title) {
        if (typeof knownTool.title === 'function') {
            toolTitle = knownTool.title({ tool: { name: permission.tool, input: permission.toolInput }, metadata: null });
        } else {
            toolTitle = knownTool.title;
        }
    }

    // Resolve description/subtitle
    let subtitle: string | null = null;
    if (knownTool && typeof knownTool.extractSubtitle === 'function') {
        const extracted = knownTool.extractSubtitle({ tool: { name: permission.tool, input: permission.toolInput }, metadata: null });
        if (typeof extracted === 'string' && extracted) {
            subtitle = extracted;
        }
    }

    const isEditTool = permission.tool === 'Edit' || permission.tool === 'MultiEdit'
        || permission.tool === 'Write' || permission.tool === 'NotebookEdit'
        || permission.tool === 'exit_plan_mode' || permission.tool === 'ExitPlanMode';

    const handleDenyTap = () => {
        if (actions.loadingKey !== null) return;
        if (!showFeedback) {
            setShowFeedback(true);
            return;
        }
        // Second tap submits the deny with current feedback
        handleDenySubmit();
    };

    const handleDenySubmit = () => {
        actions.handleDeny(feedbackText.trim() || undefined);
    };

    return (
        <View style={styles.container}>
            {/* Drag handle */}
            <View style={styles.handleContainer}>
                <View style={styles.handle} />
            </View>

            {/* Tool header */}
            <View style={styles.toolHeader}>
                <View style={styles.toolIconContainer}>
                    <Ionicons name="shield-outline" size={20} style={styles.shieldIcon} />
                </View>
                <View style={styles.toolInfo}>
                    <Text style={styles.toolTitle}>{toolTitle}</Text>
                    {subtitle && (
                        <Text style={styles.toolSubtitle} numberOfLines={2}>
                            {subtitle}
                        </Text>
                    )}
                </View>
            </View>

            {/* LLM Summary / Decision Reason */}
            {(permission.llmSummary || permission.decisionReason) && (
                <Text style={styles.summary} numberOfLines={4}>
                    {permission.llmSummary ?? permission.decisionReason}
                </Text>
            )}

            {/* Action buttons */}
            <View style={styles.buttonContainer}>
                {/* Allow once */}
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={actions.handleAllowOnce}
                    disabled={actions.loadingKey !== null}
                    activeOpacity={0.7}
                >
                    {actions.loadingKey === 'allow-once' ? (
                        <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color={theme.colors.permissionButton.allow.background} />
                    ) : (
                        <Text style={styles.allowText}>{t('common.yes')}</Text>
                    )}
                </TouchableOpacity>

                {/* Dynamic suggestion buttons */}
                {hasSuggestions && permission.permissionSuggestions!.map((suggestion, index) => (
                    <TouchableOpacity
                        key={`suggestion-${index}`}
                        style={styles.actionButton}
                        onPress={() => actions.handleSuggestion(index, suggestion)}
                        disabled={actions.loadingKey !== null}
                        activeOpacity={0.7}
                    >
                        {actions.loadingKey === `suggestion-${index}` ? (
                            <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color={theme.colors.permissionButton.allowAll.background} />
                        ) : (
                            <Text style={styles.suggestionText} numberOfLines={2}>
                                {getSuggestionLabel(suggestion)}
                            </Text>
                        )}
                    </TouchableOpacity>
                ))}

                {/* Legacy fallback buttons (when no CC suggestions) */}
                {!hasSuggestions && isEditTool && (
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={actions.handleApproveAllEdits}
                        disabled={actions.loadingKey !== null}
                        activeOpacity={0.7}
                    >
                        {actions.loadingKey === 'all-edits' ? (
                            <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color={theme.colors.permissionButton.allowAll.background} />
                        ) : (
                            <Text style={styles.suggestionText}>{t('claude.permissions.yesAllowAllEdits')}</Text>
                        )}
                    </TouchableOpacity>
                )}
                {!hasSuggestions && !isEditTool && permission.tool && (
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={actions.handleApproveForSession}
                        disabled={actions.loadingKey !== null}
                        activeOpacity={0.7}
                    >
                        {actions.loadingKey === 'for-session' ? (
                            <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color={theme.colors.permissionButton.allowAll.background} />
                        ) : (
                            <Text style={styles.suggestionText}>{t('claude.permissions.yesForTool')}</Text>
                        )}
                    </TouchableOpacity>
                )}

                {/* Deny */}
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleDenyTap}
                    disabled={actions.loadingKey !== null}
                    activeOpacity={0.7}
                >
                    {actions.loadingKey === 'deny' ? (
                        <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color={theme.colors.permissionButton.deny.background} />
                    ) : (
                        <Text style={styles.denyText}>{t('claude.permissions.noTellClaude')}</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Deny feedback input */}
            {showFeedback && (
                <View style={styles.feedbackRow}>
                    <TextInput
                        style={[styles.feedbackInput, { color: theme.colors.text }]}
                        placeholder={t('claude.permissions.feedbackPlaceholder')}
                        placeholderTextColor={theme.colors.textSecondary}
                        value={feedbackText}
                        onChangeText={setFeedbackText}
                        onSubmitEditing={handleDenySubmit}
                        autoFocus
                        returnKeyType="send"
                    />
                    <TouchableOpacity style={styles.feedbackSend} onPress={handleDenySubmit} disabled={actions.loadingKey !== null}>
                        {actions.loadingKey === 'deny' ? (
                            <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color={theme.colors.permissionButton.deny.background} />
                        ) : (
                            <Text style={styles.feedbackSendText}>{t('claude.permissions.sendFeedback')}</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {/* Queue badge */}
            {queueCount > 1 && (
                <View style={styles.queueBadge}>
                    <Text style={styles.queueText}>
                        {t('notifications.morePermissions', { count: queueCount - 1 })}
                    </Text>
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.surfaceHigh,
        paddingBottom: 8,
    },
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
    toolHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    toolIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: theme.colors.box.warning.border + '20',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    shieldIcon: {
        color: theme.colors.box.warning.border,
    },
    toolInfo: {
        flex: 1,
    },
    toolTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
    },
    toolSubtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    summary: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    buttonContainer: {
        flexDirection: 'column',
        gap: 2,
        paddingHorizontal: 16,
    },
    actionButton: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'flex-start',
        justifyContent: 'center',
        minHeight: 36,
    },
    allowText: {
        fontSize: 15,
        fontWeight: '500',
        color: theme.colors.permissionButton.allow.background,
    },
    suggestionText: {
        fontSize: 15,
        fontWeight: '500',
        color: theme.colors.permissionButton.allowAll.background,
    },
    denyText: {
        fontSize: 15,
        fontWeight: '500',
        color: theme.colors.permissionButton.deny.background,
    },
    feedbackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    feedbackInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        minHeight: 36,
    },
    feedbackSend: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    feedbackSendText: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.permissionButton.deny.background,
    },
    queueBadge: {
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 4,
    },
    queueText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
    },
}));
