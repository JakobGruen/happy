import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { sessionAllow, sessionDeny } from '@/sync/ops';
import { useUnistyles } from 'react-native-unistyles';
import { storage } from '@/sync/storage';
import { t } from '@/text';

interface PermissionFooterProps {
    permission: {
        id: string;
        status: "pending" | "approved" | "denied" | "canceled";
        reason?: string;
        mode?: string;
        allowedTools?: string[];
        decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
        permissionSuggestions?: any[];
        decisionReason?: string;
        description?: string;
        updatedPermissions?: any[];
    };
    sessionId: string;
    toolName: string;
    toolInput?: any;
    metadata?: any;
}

/**
 * Derives a human-readable label from a CC permission suggestion.
 * Inspects the shape of the opaque suggestion object to generate contextual labels.
 */
function getSuggestionLabel(suggestion: any): string {
    const destination = suggestion.destination as string | undefined;
    const destinationLabel = destination === 'session'
        ? t('permissions.forSession')
        : destination === 'projectSettings'
            ? t('permissions.forProject')
            : destination === 'userSettings'
                ? t('permissions.forAllProjects')
                : '';

    if ((suggestion.type === 'addRules' || suggestion.type === 'replaceRules') && Array.isArray(suggestion.rules)) {
        const rule = suggestion.rules[0];
        if (rule) {
            const ruleContent = rule.ruleContent
                ? (rule.ruleContent.length > 40 ? rule.ruleContent.slice(0, 37) + '...' : rule.ruleContent)
                : '';
            const toolLabel = ruleContent
                ? `${rule.toolName || 'tool'}(${ruleContent})`
                : rule.toolName || 'tool';
            if (suggestion.behavior === 'allow') {
                return t('permissions.allowTool', { tool: toolLabel, scope: destinationLabel });
            }
            if (suggestion.behavior === 'deny') {
                return t('permissions.denyTool', { tool: toolLabel, scope: destinationLabel });
            }
        }
    }

    if (suggestion.type === 'setMode') {
        const mode = suggestion.mode as string;
        if (mode === 'acceptEdits') {
            return t('permissions.acceptAllEdits', { scope: destinationLabel });
        }
        if (mode === 'bypassPermissions') {
            return t('permissions.bypassPermissions', { scope: destinationLabel });
        }
        if (mode === 'plan') {
            return t('permissions.planMode', { scope: destinationLabel });
        }
        return t('permissions.setMode', { mode, scope: destinationLabel });
    }

    if (suggestion.type === 'addDirectories') {
        return t('permissions.addDirectories', { scope: destinationLabel });
    }

    // Fallback for unknown suggestion shapes
    return t('permissions.applySuggestion');
}

export const PermissionFooter: React.FC<PermissionFooterProps> = ({ permission, sessionId, toolName, toolInput, metadata }) => {
    const { theme } = useUnistyles();
    // Loading state: 'allow-once', 'deny', or 'suggestion-{index}' for dynamic suggestions
    const [loadingKey, setLoadingKey] = useState<string | null>(null);

    // Check if this is a Codex session
    const isCodex = metadata?.flavor === 'codex' || toolName.startsWith('Codex');

    // Whether CC sent dynamic permission suggestions
    const hasSuggestions = !isCodex
        && Array.isArray(permission.permissionSuggestions)
        && permission.permissionSuggestions.length > 0;

    const isPending = permission.status === 'pending';
    const isApproved = permission.status === 'approved';
    const isDenied = permission.status === 'denied';
    const isAnyLoading = loadingKey !== null;

    // --- Handlers ---

    const handleAllowOnce = async () => {
        if (!isPending || isAnyLoading) return;
        setLoadingKey('allow-once');
        try {
            const isExitPlan = toolName === 'exit_plan_mode' || toolName === 'ExitPlanMode';
            await sessionAllow(sessionId, permission.id, isExitPlan ? 'default' : undefined);
            if (isExitPlan) {
                storage.getState().updateSessionPermissionMode(sessionId, 'default');
            }
        } catch (error) {
            console.error('Failed to approve permission:', error);
        } finally {
            setLoadingKey(null);
        }
    };

    const handleSuggestion = async (index: number, suggestion: any) => {
        if (!isPending || isAnyLoading) return;
        setLoadingKey(`suggestion-${index}`);
        try {
            // Extract mode from setMode suggestions to pass to CLI
            const mode = suggestion.type === 'setMode' ? suggestion.mode : undefined;
            if (suggestion.type === 'setMode' && mode) {
                storage.getState().updateSessionPermissionMode(sessionId, mode);
            }
            await sessionAllow(sessionId, permission.id, mode, undefined, undefined, undefined, [suggestion]);
        } catch (error) {
            console.error('Failed to approve with suggestion:', error);
        } finally {
            setLoadingKey(null);
        }
    };

    const handleDeny = async () => {
        if (!isPending || isAnyLoading) return;
        setLoadingKey('deny');
        try {
            await sessionDeny(sessionId, permission.id);
        } catch (error) {
            console.error('Failed to deny permission:', error);
        } finally {
            setLoadingKey(null);
        }
    };

    // --- Legacy hardcoded handlers (fallback mode) ---

    const handleApproveAllEdits = async () => {
        if (!isPending || isAnyLoading) return;
        setLoadingKey('all-edits');
        try {
            await sessionAllow(sessionId, permission.id, 'acceptEdits');
            storage.getState().updateSessionPermissionMode(sessionId, 'acceptEdits');
        } catch (error) {
            console.error('Failed to approve all edits:', error);
        } finally {
            setLoadingKey(null);
        }
    };

    const handleApproveForSession = async () => {
        if (!isPending || isAnyLoading) return;
        setLoadingKey('for-session');
        try {
            let toolIdentifier = toolName;
            if (toolName === 'Bash' && toolInput?.command) {
                toolIdentifier = `Bash(${toolInput.command})`;
            }
            await sessionAllow(sessionId, permission.id, undefined, [toolIdentifier]);
        } catch (error) {
            console.error('Failed to approve for session:', error);
        } finally {
            setLoadingKey(null);
        }
    };

    // --- Codex handlers ---

    const handleCodexApprove = async () => {
        if (!isPending || isAnyLoading) return;
        setLoadingKey('allow-once');
        try {
            await sessionAllow(sessionId, permission.id, undefined, undefined, 'approved');
        } catch (error) {
            console.error('Failed to approve permission:', error);
        } finally {
            setLoadingKey(null);
        }
    };

    const handleCodexApproveForSession = async () => {
        if (!isPending || isAnyLoading) return;
        setLoadingKey('for-session');
        try {
            await sessionAllow(sessionId, permission.id, undefined, undefined, 'approved_for_session');
        } catch (error) {
            console.error('Failed to approve for session:', error);
        } finally {
            setLoadingKey(null);
        }
    };

    const handleCodexAbort = async () => {
        if (!isPending || isAnyLoading) return;
        setLoadingKey('abort');
        try {
            await sessionDeny(sessionId, permission.id, undefined, undefined, 'abort');
        } catch (error) {
            console.error('Failed to abort permission:', error);
        } finally {
            setLoadingKey(null);
        }
    };

    // --- Status detection for completed states ---

    const isToolAllowed = (name: string, input: any, allowedTools: string[] | undefined): boolean => {
        if (!allowedTools) return false;
        if (allowedTools.includes(name)) return true;
        if (name === 'Bash' && input?.command) {
            return allowedTools.includes(`Bash(${input.command})`);
        }
        return false;
    };

    // Claude status detection
    const isApprovedViaAllow = isApproved && permission.mode !== 'acceptEdits' && !isToolAllowed(toolName, toolInput, permission.allowedTools);
    const isApprovedViaAllEdits = isApproved && permission.mode === 'acceptEdits';
    const isApprovedForSession = isApproved && isToolAllowed(toolName, toolInput, permission.allowedTools);

    // Codex status detection
    const isCodexApproved = isCodex && isApproved && (permission.decision === 'approved' || !permission.decision);
    const isCodexApprovedForSession = isCodex && isApproved && permission.decision === 'approved_for_session';
    const isCodexAborted = isCodex && isDenied && permission.decision === 'abort';

    const styles = StyleSheet.create({
        container: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            justifyContent: 'center',
        },
        buttonContainer: {
            flexDirection: 'column',
            gap: 4,
            alignItems: 'flex-start',
        },
        button: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 1,
            backgroundColor: 'transparent',
            alignItems: 'flex-start',
            justifyContent: 'center',
            minHeight: 32,
            borderLeftWidth: 3,
            borderLeftColor: 'transparent',
            alignSelf: 'stretch',
        },
        buttonAllow: {
            backgroundColor: 'transparent',
        },
        buttonDeny: {
            backgroundColor: 'transparent',
        },
        buttonAllowAll: {
            backgroundColor: 'transparent',
        },
        buttonSelected: {
            backgroundColor: 'transparent',
            borderLeftColor: theme.colors.text,
        },
        buttonInactive: {
            opacity: 0.3,
        },
        buttonContent: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            minHeight: 20,
        },
        buttonText: {
            fontSize: 14,
            fontWeight: '400',
            color: theme.colors.textSecondary,
        },
        buttonTextAllow: {
            color: theme.colors.permissionButton.allow.background,
            fontWeight: '500',
        },
        buttonTextDeny: {
            color: theme.colors.permissionButton.deny.background,
            fontWeight: '500',
        },
        buttonTextAllowAll: {
            color: theme.colors.permissionButton.allowAll.background,
            fontWeight: '500',
        },
        buttonTextSelected: {
            color: theme.colors.text,
            fontWeight: '500',
        },
        buttonForSession: {
            backgroundColor: 'transparent',
        },
        buttonTextForSession: {
            color: theme.colors.permissionButton.allowAll.background,
            fontWeight: '500',
        },
        contextText: {
            fontSize: 12,
            color: theme.colors.textSecondary,
            paddingHorizontal: 12,
            paddingBottom: 4,
            fontStyle: 'italic',
        },
    });

    const renderButton = (
        key: string,
        label: string,
        onPress: () => void,
        colorStyle: any,
        isSelected: boolean,
        isOtherSelected: boolean,
    ) => (
        <TouchableOpacity
            key={key}
            style={[
                styles.button,
                isPending && styles.buttonAllow,
                isSelected && styles.buttonSelected,
                isOtherSelected && styles.buttonInactive,
            ]}
            onPress={onPress}
            disabled={!isPending || isAnyLoading}
            activeOpacity={isPending ? 0.7 : 1}
        >
            {loadingKey === key && isPending ? (
                <View style={[styles.buttonContent, { width: 40, height: 20, justifyContent: 'center' }]}>
                    <ActivityIndicator
                        size={Platform.OS === 'ios' ? 'small' : 14 as any}
                        color={colorStyle.color}
                    />
                </View>
            ) : (
                <View style={styles.buttonContent}>
                    <Text
                        style={[
                            styles.buttonText,
                            isPending && colorStyle,
                            isSelected && styles.buttonTextSelected,
                        ]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                    >
                        {label}
                    </Text>
                </View>
            )}
        </TouchableOpacity>
    );

    // --- Codex rendering (unchanged) ---
    if (isCodex) {
        return (
            <View style={styles.container}>
                <View style={styles.buttonContainer}>
                    {renderButton(
                        'allow-once',
                        t('common.yes'),
                        handleCodexApprove,
                        styles.buttonTextAllow,
                        isCodexApproved,
                        isCodexAborted || isCodexApprovedForSession,
                    )}
                    {renderButton(
                        'for-session',
                        t('codex.permissions.yesForSession'),
                        handleCodexApproveForSession,
                        styles.buttonTextForSession,
                        isCodexApprovedForSession,
                        isCodexAborted || isCodexApproved,
                    )}
                    {renderButton(
                        'abort',
                        t('codex.permissions.stopAndExplain'),
                        handleCodexAbort,
                        styles.buttonTextDeny,
                        isCodexAborted,
                        isCodexApproved || isCodexApprovedForSession,
                    )}
                </View>
            </View>
        );
    }

    // --- Dynamic Claude rendering (when CC sends permission_suggestions) ---
    if (hasSuggestions) {
        const suggestions = permission.permissionSuggestions!;

        // Determine which suggestion was selected (if any)
        const wasSuggestionApproved = isApproved && Array.isArray(permission.updatedPermissions) && permission.updatedPermissions.length > 0;
        const matchSuggestion = (suggestion: any, index: number): boolean => {
            if (!wasSuggestionApproved) return false;
            const applied = permission.updatedPermissions![0];
            // Match by type + key fields (JSON comparison as fallback)
            return applied?.type === suggestion.type && JSON.stringify(applied) === JSON.stringify(suggestion);
        };
        const isYesSelected = isApproved && !wasSuggestionApproved;

        return (
            <View style={styles.container}>
                {/* Show decision reason as context when available */}
                {permission.decisionReason && isPending && (
                    <Text style={styles.contextText} numberOfLines={2}>
                        {permission.decisionReason}
                    </Text>
                )}
                <View style={styles.buttonContainer}>
                    {/* Allow once */}
                    {renderButton(
                        'allow-once',
                        t('common.yes'),
                        handleAllowOnce,
                        styles.buttonTextAllow,
                        isYesSelected,
                        isDenied || (isApproved && !isYesSelected),
                    )}
                    {/* Dynamic suggestion buttons */}
                    {suggestions.map((suggestion, index) => {
                        const isSuggestionSelected = matchSuggestion(suggestion, index);
                        return renderButton(
                            `suggestion-${index}`,
                            getSuggestionLabel(suggestion),
                            () => handleSuggestion(index, suggestion),
                            styles.buttonTextAllowAll,
                            isSuggestionSelected,
                            isDenied || (isApproved && !isSuggestionSelected),
                        );
                    })}
                    {/* Deny */}
                    {renderButton(
                        'deny',
                        t('claude.permissions.noTellClaude'),
                        handleDeny,
                        styles.buttonTextDeny,
                        isDenied,
                        isApproved,
                    )}
                </View>
            </View>
        );
    }

    // --- Fallback Claude rendering (no suggestions — backward compat) ---
    const isEditTool = toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'Write' || toolName === 'NotebookEdit' || toolName === 'exit_plan_mode' || toolName === 'ExitPlanMode';

    return (
        <View style={styles.container}>
            <View style={styles.buttonContainer}>
                {renderButton(
                    'allow-once',
                    t('common.yes'),
                    handleAllowOnce,
                    styles.buttonTextAllow,
                    isApprovedViaAllow,
                    isDenied || isApprovedViaAllEdits || isApprovedForSession,
                )}
                {isEditTool && renderButton(
                    'all-edits',
                    t('claude.permissions.yesAllowAllEdits'),
                    handleApproveAllEdits,
                    styles.buttonTextAllowAll,
                    isApprovedViaAllEdits,
                    isDenied || isApprovedViaAllow || isApprovedForSession,
                )}
                {!isEditTool && toolName && renderButton(
                    'for-session',
                    t('claude.permissions.yesForTool'),
                    handleApproveForSession,
                    styles.buttonTextForSession,
                    isApprovedForSession,
                    isDenied || isApprovedViaAllow || isApprovedViaAllEdits,
                )}
                {renderButton(
                    'deny',
                    t('claude.permissions.noTellClaude'),
                    handleDeny,
                    styles.buttonTextDeny,
                    isDenied,
                    isApproved,
                )}
            </View>
        </View>
    );
};
