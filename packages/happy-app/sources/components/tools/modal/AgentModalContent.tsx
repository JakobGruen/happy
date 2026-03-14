import React from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall, Message } from '@/sync/typesMessage';
import { Metadata } from '@/sync/storageTypes';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { ToolView } from '../ToolView';
import { useSetting } from '@/sync/storage';
import { t } from '@/text';

type AgentTab = 'prompt' | 'activity' | 'output';

interface AgentModalContentProps {
    tool: ToolCall;
    metadata: Metadata | null;
    messages: Message[];
}

/**
 * Extracts prompt text, activity messages, and response messages from
 * an agent's sidechain children. Reuses the logic from TaskViewFull.
 */
function useAgentSections(messages: Message[], tool: ToolCall) {
    return React.useMemo(() => {
        let promptText: string | null = null;
        let startIdx = 0;

        // The first agent-text/user-text is the prompt (may be duplicated by sidechain + SDK)
        if (messages.length > 0) {
            const first = messages[0];
            if (first.kind === 'agent-text' || first.kind === 'user-text') {
                promptText = first.text;
                startIdx = 1;
                // Skip duplicate prompt messages
                while (startIdx < messages.length) {
                    const next = messages[startIdx];
                    if ((next.kind === 'agent-text' || next.kind === 'user-text') && next.text === promptText) {
                        startIdx++;
                    } else {
                        break;
                    }
                }
            }
        }

        const remaining = messages.slice(startIdx);

        // Split trailing agent-text (after last tool-call) into response
        let lastToolIdx = -1;
        for (let i = remaining.length - 1; i >= 0; i--) {
            if (remaining[i].kind === 'tool-call') {
                lastToolIdx = i;
                break;
            }
        }

        let activityMessages = remaining;
        let responseMessages: Message[] = [];
        if (lastToolIdx >= 0 && lastToolIdx < remaining.length - 1) {
            const trailing = remaining.slice(lastToolIdx + 1);
            if (trailing.every(m => m.kind === 'agent-text')) {
                activityMessages = remaining.slice(0, lastToolIdx + 1);
                responseMessages = trailing;
            }
        }

        // Response text: prefer tool.result, fall back to extracted child messages
        const responseText = tool.result && typeof tool.result === 'string' && tool.result.length > 0
            ? tool.result
            : responseMessages
                .filter((m): m is Extract<Message, { kind: 'agent-text' }> => m.kind === 'agent-text')
                .map(m => m.text)
                .join('\n\n') || null;

        // Fall back to tool.input.prompt if no prompt found in sidechain messages
        const finalPrompt = promptText
            ?? (tool.input?.prompt && typeof tool.input.prompt === 'string' ? tool.input.prompt : null);

        return { promptText: finalPrompt, activityMessages, responseText };
    }, [messages, tool.result]);
}

export const AgentModalContent = React.memo<AgentModalContentProps>(
    ({ tool, metadata, messages }) => {
        const { theme } = useUnistyles();
        const experiments = useSetting('experiments');
        const isRunning = tool.state === 'running';

        const { promptText, activityMessages, responseText } = useAgentSections(messages, tool);

        // Default tab: output if completed and available, activity if running, prompt otherwise
        const defaultTab: AgentTab = (tool.state === 'completed' && responseText) ? 'output'
            : isRunning ? 'activity'
            : 'prompt';
        const [activeTab, setActiveTab] = React.useState<AgentTab>(defaultTab);

        // Auto-switch to output when agent completes
        React.useEffect(() => {
            if (tool.state === 'completed' && responseText) {
                setActiveTab('output');
            }
        }, [tool.state, responseText]);

        const agentType = tool.input?.subagent_type;

        return (
            <View style={styles.container}>
                {/* Tab bar */}
                <View style={styles.tabHeader}>
                    <TabButton
                        label={t('tools.agentModal.prompt')}
                        active={activeTab === 'prompt'}
                        onPress={() => setActiveTab('prompt')}
                    />
                    <TabButton
                        label={t('tools.agentModal.activity')}
                        active={activeTab === 'activity'}
                        onPress={() => setActiveTab('activity')}
                        count={activityMessages.filter(m => m.kind === 'tool-call').length}
                    />
                    <TabButton
                        label={t('tools.agentModal.output')}
                        active={activeTab === 'output'}
                        onPress={() => setActiveTab('output')}
                        disabled={!responseText && !isRunning}
                    />
                </View>

                {/* Tab content */}
                <View style={styles.tabContent}>
                    {activeTab === 'prompt' && (
                        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
                            {agentType && (
                                <View style={styles.badgeRow}>
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>{agentType}</Text>
                                    </View>
                                </View>
                            )}
                            {promptText ? (
                                <MarkdownView markdown={promptText} />
                            ) : (
                                <Text style={styles.emptyText}>—</Text>
                            )}
                        </ScrollView>
                    )}

                    {activeTab === 'activity' && (
                        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.activityContent}>
                            {activityMessages.length === 0 && isRunning ? (
                                <View style={styles.emptyContainer}>
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                </View>
                            ) : activityMessages.length === 0 ? (
                                <View style={styles.emptyContainer}>
                                    <Text style={styles.emptyText}>—</Text>
                                </View>
                            ) : (
                                activityMessages.map((msg) => (
                                    <ActivityMessage
                                        key={msg.id}
                                        message={msg}
                                        metadata={metadata}
                                        showThinking={!!experiments}
                                    />
                                ))
                            )}
                        </ScrollView>
                    )}

                    {activeTab === 'output' && (
                        <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.scrollContent}>
                            {responseText ? (
                                <MarkdownView markdown={responseText} />
                            ) : isRunning ? (
                                <View style={styles.emptyContainer}>
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                </View>
                            ) : (
                                <View style={styles.emptyContainer}>
                                    <Text style={styles.emptyText}>—</Text>
                                </View>
                            )}
                        </ScrollView>
                    )}
                </View>
            </View>
        );
    }
);

/** Single tab button in the tab bar */
const TabButton = React.memo<{
    label: string;
    active: boolean;
    onPress: () => void;
    count?: number;
    disabled?: boolean;
}>(({ label, active, onPress, count, disabled }) => (
    <Pressable
        style={[
            styles.tabButton,
            active && styles.tabButtonActive,
            disabled && styles.tabButtonDisabled,
        ]}
        onPress={disabled ? undefined : onPress}
    >
        <Text style={[styles.tabLabel, disabled && styles.tabLabelDisabled]}>
            {label}{typeof count === 'number' && count > 0 ? ` (${count})` : ''}
        </Text>
    </Pressable>
));

/** Renders a single message in the activity feed — mirrors main chat visuals */
const ActivityMessage = React.memo<{
    message: Message;
    metadata: Metadata | null;
    showThinking: boolean;
}>(({ message, metadata, showThinking }) => {
    if (message.kind === 'agent-text') {
        if (message.isThinking && !showThinking) return null;
        return (
            <View style={[styles.agentTextBlock, message.isThinking && { opacity: 0.3 }]}>
                <MarkdownView markdown={message.text} />
            </View>
        );
    }

    if (message.kind === 'tool-call') {
        return (
            <View style={styles.toolBlock}>
                <ToolView
                    tool={message.tool}
                    metadata={metadata}
                    messages={message.children}
                />
            </View>
        );
    }

    if (message.kind === 'user-text') {
        return (
            <View style={styles.agentTextBlock}>
                <MarkdownView markdown={message.text} />
            </View>
        );
    }

    return null;
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surfaceHigh,
    },
    tabHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.surfaceRipple,
        backgroundColor: theme.colors.surfaceHighest,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    tabButtonActive: {
        borderBottomWidth: 2,
        borderBottomColor: theme.colors.textLink,
    },
    tabButtonDisabled: {
        opacity: 0.3,
    },
    tabLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
    },
    tabLabelDisabled: {
        color: theme.colors.textSecondary,
    },
    tabContent: {
        flex: 1,
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 32,
    },
    activityContent: {
        padding: 8,
        paddingBottom: 32,
        gap: 4,
    },
    badgeRow: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    badge: {
        backgroundColor: theme.colors.surfaceHighest,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    badgeText: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.text,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    emptyText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    agentTextBlock: {
        marginHorizontal: 8,
        marginBottom: 8,
    },
    toolBlock: {
        marginHorizontal: 0,
        marginBottom: 4,
    },
}));
