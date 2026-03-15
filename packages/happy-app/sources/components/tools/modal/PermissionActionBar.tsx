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
    llmSummary: string | null;
    queueCount: number;
    suggestions: any[] | null;
    toolName?: string;
}

/**
 * Floating action bar for permission decisions.
 * Renders Allow / Suggestion / Deny buttons with optional LLM summary and queue badge.
 * Purely presentational — all logic lives in the usePermissionActions hook.
 */
export const PermissionActionBar = React.memo<PermissionActionBarProps>(({
    actions,
    llmSummary,
    queueCount,
    suggestions,
    toolName,
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
        handleDenySubmit();
    };

    const handleDenySubmit = () => {
        actions.handleDeny(feedbackText.trim() || undefined);
    };

    return (
        <View style={styles.container}>
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

            {/* LLM summary */}
            {llmSummary ? (
                <Text style={styles.summary} numberOfLines={3}>
                    {llmSummary}
                </Text>
            ) : null}

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
                        <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color="#FFFFFF" />
                    ) : (
                        <>
                            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                            <Text style={styles.buttonText}>{t('common.yes')}</Text>
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
                            <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color="#FFFFFF" />
                        ) : (
                            <Text style={styles.buttonText} numberOfLines={1}>
                                {getSuggestionLabel(suggestion)}
                            </Text>
                        )}
                    </TouchableOpacity>
                ))}

                {/* Deny */}
                <TouchableOpacity
                    style={styles.denyButton}
                    onPress={handleDenyTap}
                    disabled={isDisabled}
                    activeOpacity={0.7}
                >
                    {actions.loadingKey === 'deny' ? (
                        <ActivityIndicator size={Platform.OS === 'ios' ? 'small' : 14 as any} color="#FFFFFF" />
                    ) : (
                        <>
                            <Ionicons name="close" size={16} color="#FFFFFF" />
                            <Text style={styles.buttonText}>{t('claude.permissions.noTellClaude')}</Text>
                        </>
                    )}
                </TouchableOpacity>

                {/* Queue badge */}
                {queueCount > 0 && (
                    <Text style={styles.queueBadge}>
                        {t('notifications.morePermissions', { count: queueCount })}
                    </Text>
                )}
            </View>
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
    summary: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        marginBottom: 10,
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
        backgroundColor: theme.colors.permissionButton.allow.background,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    suggestionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: theme.colors.textLink,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        flexShrink: 1,
    },
    denyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: theme.colors.permissionButton.deny.background,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    queueBadge: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginLeft: 'auto',
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
