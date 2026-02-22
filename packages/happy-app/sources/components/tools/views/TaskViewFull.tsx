import * as React from 'react';
import { Text, View, ScrollView, Platform } from 'react-native';
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
 * Renders agent description, type, and all child messages
 * as a read-only scrollable chat-like view.
 */
export const TaskViewFull = React.memo<ToolViewProps>(({ tool, metadata, messages, sessionId }) => {
    const { theme } = useUnistyles();
    const experiments = useSetting('experiments');

    const description = tool.input?.description;
    const agentType = tool.input?.subagent_type;

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
            <View style={styles.contentWrapper}>
                {/* Agent description header */}
                {description && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Octicons name="rocket" size={20} color={theme.colors.textLink} />
                            <Text style={styles.sectionTitle}>{t('tools.taskViewFull.agentPrompt')}</Text>
                        </View>
                        <Text style={styles.description}>{description}</Text>
                    </View>
                )}

                {/* Agent type badge */}
                {agentType && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="code-slash" size={20} color={theme.colors.textLink} />
                            <Text style={styles.sectionTitle}>{t('tools.taskViewFull.agentType')}</Text>
                        </View>
                        <View style={styles.badgeContainer}>
                            <Text style={styles.badgeText}>{agentType}</Text>
                        </View>
                    </View>
                )}

                {/* Activity — child messages */}
                {messages.length > 0 && (
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Ionicons name="list" size={20} color={theme.colors.textLink} />
                            <Text style={styles.sectionTitle}>{t('tools.taskViewFull.activity')}</Text>
                        </View>
                        <View style={styles.activityList}>
                            {messages.map((msg) => (
                                <ChildMessage
                                    key={msg.id}
                                    message={msg}
                                    metadata={metadata}
                                    sessionId={sessionId}
                                    showThinking={!!experiments}
                                />
                            ))}
                        </View>
                    </View>
                )}
            </View>
        </ScrollView>
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
    section: {
        marginBottom: 28,
        paddingHorizontal: 4,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: theme.colors.text,
    },
    description: {
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
    },
    badgeContainer: {
        alignSelf: 'flex-start',
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
        paddingHorizontal: 4,
        paddingVertical: 2,
    },
    childTool: {
        paddingVertical: 2,
    },
}));
