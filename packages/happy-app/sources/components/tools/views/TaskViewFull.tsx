import * as React from 'react';
import { Text, View, ScrollView, Platform, Pressable, ActivityIndicator } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { ToolViewProps } from './_all';
import { Message } from '@/sync/typesMessage';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { ToolView } from '../ToolView';
import { layout } from '@/components/layout';
import { useSetting } from '@/sync/storage';
import { t } from '@/text';

/**
 * Full detail view for the Task (agent) tool.
 * Three collapsible sections: Prompt, Activity, Response.
 */
export const TaskViewFull = React.memo<ToolViewProps>(({ tool, metadata, messages, sessionId }) => {
    const { theme } = useUnistyles();
    const experiments = useSetting('experiments');

    const agentType = tool.input?.subagent_type;
    const isRunning = tool.state === 'running';

    // Split children into prompt, activity, and response.
    // The CLI emits the prompt as agent-text (sometimes twice — sidechain root + SDK echo).
    // Trailing agent-text after the last tool-call is the subagent's answer (response).
    const { promptText, activityMessages, childResponseMessages } = React.useMemo(() => {
        // Detect prompt text: the first agent-text/user-text message(s) that share
        // the same text content are the prompt (duplicated by sidechain + SDK).
        let promptText: string | null = null;
        let startIdx = 0;

        if (messages.length > 0) {
            const first = messages[0];
            if (first.kind === 'agent-text' || first.kind === 'user-text') {
                promptText = first.text;
                startIdx = 1;

                // Skip any subsequent messages with the same text (the duplicate)
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
        let childResponseMessages: Message[] = [];
        if (lastToolIdx >= 0 && lastToolIdx < remaining.length - 1) {
            const trailing = remaining.slice(lastToolIdx + 1);
            if (trailing.every(m => m.kind === 'agent-text')) {
                activityMessages = remaining.slice(0, lastToolIdx + 1);
                childResponseMessages = trailing;
            }
        }

        return { promptText, activityMessages, childResponseMessages };
    }, [messages]);

    // Response: prefer tool.result (wire protocol), fall back to extracted child messages
    const responseText = tool.result && typeof tool.result === 'string' && tool.result.length > 0
        ? tool.result
        : null;

    // Section collapse state
    const [promptOpen, setPromptOpen] = React.useState(true);
    const [activityOpen, setActivityOpen] = React.useState(isRunning);
    const [responseOpen, setResponseOpen] = React.useState(true);

    // Auto-expand activity while running, collapse when done
    React.useEffect(() => {
        if (isRunning) {
            setActivityOpen(true);
        }
    }, [isRunning]);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
            <View style={styles.contentWrapper}>
                {/* Prompt */}
                {promptText && (
                    <CollapsibleSection
                        icon={<Octicons name="rocket" size={20} color={theme.colors.textLink} />}
                        title={t('tools.taskViewFull.agentPrompt')}
                        isOpen={promptOpen}
                        onToggle={() => setPromptOpen(v => !v)}
                        badge={agentType}
                    >
                        <View style={styles.childMessage}>
                            <MarkdownView markdown={promptText} />
                        </View>
                    </CollapsibleSection>
                )}

                {/* Activity */}
                {activityMessages.length > 0 && (
                    <CollapsibleSection
                        icon={<Ionicons name="list" size={20} color={theme.colors.textLink} />}
                        title={t('tools.taskViewFull.activity')}
                        isOpen={activityOpen}
                        onToggle={() => setActivityOpen(v => !v)}
                        count={activityMessages.filter(m => m.kind === 'tool-call').length}
                    >
                        <View style={styles.activityList}>
                            {activityMessages.map((msg) => (
                                <ChildMessage
                                    key={msg.id}
                                    message={msg}
                                    metadata={metadata}
                                    sessionId={sessionId}
                                    showThinking={!!experiments}
                                />
                            ))}
                        </View>
                    </CollapsibleSection>
                )}

                {/* Response — tool.result or trailing agent-text (always visible) */}
                <CollapsibleSection
                    icon={<Ionicons name="chatbubble-ellipses" size={20} color={theme.colors.textLink} />}
                    title={t('tools.taskViewFull.response')}
                    isOpen={responseOpen}
                    onToggle={() => setResponseOpen(v => !v)}
                >
                    {responseText ? (
                        <View style={styles.childMessage}>
                            <MarkdownView markdown={responseText} />
                        </View>
                    ) : childResponseMessages.length > 0 ? (
                        <View>
                            {childResponseMessages.map((msg) => (
                                msg.kind === 'agent-text' ? (
                                    <View key={msg.id} style={styles.childMessage}>
                                        <MarkdownView markdown={msg.text} />
                                    </View>
                                ) : null
                            ))}
                        </View>
                    ) : (
                        <View style={styles.emptyResponse}>
                            {isRunning ? (
                                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                            ) : (
                                <Text style={styles.emptyResponseText}>—</Text>
                            )}
                        </View>
                    )}
                </CollapsibleSection>
            </View>
        </ScrollView>
    );
});

/** Collapsible section with tappable header, wrapped in a card box */
const CollapsibleSection = React.memo<{
    icon: React.ReactNode;
    title: string;
    isOpen: boolean;
    onToggle: () => void;
    badge?: string | null;
    count?: number;
    children: React.ReactNode;
}>(({ icon, title, isOpen, onToggle, badge, count, children }) => {
    const { theme } = useUnistyles();
    return (
        <View style={styles.sectionCard}>
            <Pressable onPress={onToggle} style={styles.sectionHeader}>
                {icon}
                <Text style={styles.sectionTitle}>{title}</Text>
                {badge && (
                    <View style={styles.badgeContainer}>
                        <Text style={styles.badgeText}>{badge}</Text>
                    </View>
                )}
                {typeof count === 'number' && count > 0 && (
                    <Text style={styles.countText}>{count}</Text>
                )}
                <View style={{ marginLeft: 'auto' }}>
                    <Ionicons
                        name={isOpen ? 'chevron-down' : 'chevron-forward'}
                        size={18}
                        color={theme.colors.textSecondary}
                    />
                </View>
            </Pressable>
            {isOpen && (
                <View style={styles.sectionBody}>
                    {children}
                </View>
            )}
        </View>
    );
});

/** Renders a single child message inside the Task detail view */
const ChildMessage = React.memo<{
    message: Message;
    metadata: ToolViewProps['metadata'];
    sessionId?: string;
    showThinking: boolean;
}>(({ message, metadata, sessionId, showThinking }) => {
    if (message.kind === 'agent-text') {
        if (message.isThinking && !showThinking) {
            return null;
        }
        return (
            <View style={[styles.childMessage, message.isThinking && { opacity: 0.3 }]}>
                <MarkdownView markdown={message.text} />
            </View>
        );
    }

    if (message.kind === 'tool-call') {
        return (
            <View style={styles.childTool}>
                <ToolView
                    tool={message.tool}
                    metadata={metadata}
                    messages={message.children}
                    sessionId={sessionId}
                    messageId={message.id}
                />
            </View>
        );
    }

    if (message.kind === 'user-text') {
        return (
            <View style={styles.childMessage}>
                <MarkdownView markdown={message.text} />
            </View>
        );
    }

    return null;
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    scrollContent: {
        paddingTop: 12,
        paddingBottom: 64,
    },
    contentWrapper: {
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        width: '100%',
    },
    sectionCard: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 8,
        marginBottom: 12,
        marginHorizontal: 4,
        overflow: 'hidden',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        gap: 8,
        backgroundColor: theme.colors.surfaceHighest,
    },
    sectionBody: {
        padding: 12,
        paddingTop: 8,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: theme.colors.text,
    },
    countText: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.textSecondary,
    },
    badgeContainer: {
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
    activityList: {
        gap: 4,
    },
    childMessage: {
        paddingVertical: 2,
    },
    childTool: {
        paddingVertical: 2,
    },
    emptyResponse: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    emptyResponseText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
}));
