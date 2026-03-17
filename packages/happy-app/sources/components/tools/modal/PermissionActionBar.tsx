import React, { useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator, TextInput, Platform } from 'react-native';
import { Text } from '@/components/StyledText';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { UsePermissionActionsResult } from '@/hooks/usePermissionActions';
import { getSuggestionLabel } from '@/components/tools/permissionUtils';
import { t } from '@/text';

interface PermissionActionBarProps {
    actions: UsePermissionActionsResult;
    queueCount: number;
    suggestions: any[] | null;
    toolName?: string;
    inline?: boolean;
    containerStyle?: any;
}

/**
 * Floating action bar for permission decisions.
 * Renders Allow / Suggestion / Deny buttons with queue badge.
 * Purely presentational — all logic lives in the usePermissionActions hook.
 */
export const PermissionActionBar = React.memo<PermissionActionBarProps>(({
    actions,
    queueCount,
    suggestions,
    toolName,
    inline = false,
    containerStyle,
}) => {
    const { theme } = useUnistyles();
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbackText, setFeedbackText] = useState('');

    const isDisabled = actions.loadingKey !== null;
    const hasSuggestions = Array.isArray(suggestions) && suggestions.length > 0;

    const handleDenyTap = () => {
        if (isDisabled) return;
        if (!showFeedback) {
            setShowFeedback(true);
            return;
        }
        // Empty feedback + second tap = cancel
        if (!feedbackText.trim()) {
            setShowFeedback(false);
            return;
        }
        handleDenySubmit();
    };

    const handleDenySubmit = () => {
        if (isDisabled) return;
        actions.handleDeny(feedbackText.trim() || undefined);
    };

    const inlineStyle = inline ? {
        shadowColor: undefined,
        shadowOffset: undefined,
        shadowOpacity: undefined,
        shadowRadius: undefined,
        elevation: undefined,
        marginHorizontal: 0,
        borderRadius: 0,
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        borderTopWidth: 1,
        borderTopColor: theme.colors.surfaceRipple,
        backgroundColor: theme.colors.surfaceHigh,
    } : undefined;

    return (
        <View style={[styles.container, inlineStyle, containerStyle]}>
            {/* Deny feedback input — shown after first deny tap */}
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
                </View>
            )}

            {/* Action buttons row */}
            <View style={styles.buttonRow}>
                {/* Allow */}
                <TouchableOpacity
                    style={styles.allowButton}
                    onPress={actions.handleAllowOnce}
                    disabled={isDisabled}
                    activeOpacity={0.7}
                >
                    {actions.loadingKey === 'allow-once' ? (
                        <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color={theme.colors.permissionButton.allow.background} />
                    ) : (
                        <>
                            <Ionicons name="checkmark" size={16} color={theme.colors.permissionButton.allow.background} />
                            <Text style={styles.allowButtonText}>{t('common.yes')}</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Suggestion buttons */}
                {hasSuggestions && suggestions!.map((suggestion, index) => (
                    <TouchableOpacity
                        key={`suggestion-${index}`}
                        style={styles.suggestionButton}
                        onPress={() => actions.handleSuggestion(index, suggestion)}
                        disabled={isDisabled}
                        activeOpacity={0.7}
                    >
                        {actions.loadingKey === `suggestion-${index}` ? (
                            <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color={theme.colors.permissionButton.allowAll.background} />
                        ) : (
                            <Text style={styles.suggestionButtonText} numberOfLines={1}>
                                {getSuggestionLabel(suggestion)}
                            </Text>
                        )}
                    </TouchableOpacity>
                ))}

                {/* Legacy fallback buttons — only when no CC suggestions */}
                {!hasSuggestions && (
                    ['Edit', 'Write', 'MultiEdit'].includes(toolName ?? '') ? (
                        <TouchableOpacity
                            style={styles.suggestionButton}
                            onPress={actions.handleApproveAllEdits}
                            disabled={isDisabled}
                            activeOpacity={0.7}
                        >
                            {actions.loadingKey === 'all-edits' ? (
                                <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color={theme.colors.permissionButton.allowAll.background} />
                            ) : (
                                <Text style={styles.suggestionButtonText}>{t('claude.permissions.yesAllowAllEdits')}</Text>
                            )}
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.suggestionButton}
                            onPress={actions.handleApproveForSession}
                            disabled={isDisabled}
                            activeOpacity={0.7}
                        >
                            {actions.loadingKey === 'for-session' ? (
                                <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color={theme.colors.permissionButton.allowAll.background} />
                            ) : (
                                <Text style={styles.suggestionButtonText}>{t('claude.permissions.yesForTool')}</Text>
                            )}
                        </TouchableOpacity>
                    )
                )}

                {/* Deny */}
                <TouchableOpacity
                    style={styles.denyButton}
                    onPress={handleDenyTap}
                    disabled={isDisabled}
                    activeOpacity={0.7}
                >
                    {actions.loadingKey === 'deny' ? (
                        <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color={theme.colors.permissionButton.deny.background} />
                    ) : (
                        <>
                            <Ionicons name="close" size={16} color={theme.colors.permissionButton.deny.background} />
                            <Text style={styles.denyButtonText}>{t('claude.permissions.noTellClaude')}</Text>
                        </>
                    )}
                </TouchableOpacity>

            </View>

            {/* Queue badge — below buttons, excludes the currently displayed permission */}
            {queueCount > 1 && (
                <Text style={styles.queueBadge}>
                    {t('notifications.morePermissions', { count: queueCount - 1 })}
                </Text>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 16,
        marginHorizontal: 12,
        marginTop: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 8,
        shadowOpacity: 0.15,
        elevation: 16,
    },
    buttonRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    allowButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: theme.colors.permissionButton.allow.background,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    suggestionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: theme.colors.permissionButton.allowAll.background,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        flexShrink: 1,
    },
    denyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: theme.colors.permissionButton.deny.background,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    allowButtonText: {
        color: theme.colors.permissionButton.allow.background,
        fontSize: 14,
        fontWeight: '600',
    },
    suggestionButtonText: {
        color: theme.colors.permissionButton.allowAll.background,
        fontSize: 14,
        fontWeight: '600',
    },
    denyButtonText: {
        color: theme.colors.permissionButton.deny.background,
        fontSize: 14,
        fontWeight: '600',
    },
    queueBadge: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginTop: 8,
    },
    feedbackRow: {
        marginBottom: 10,
    },
    feedbackInput: {
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        minHeight: 36,
    },
}));
