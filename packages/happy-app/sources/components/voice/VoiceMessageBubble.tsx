import * as React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';

interface VoiceMessageBubbleProps {
    transcript?: string;
    summary?: string;
    actions?: Array<{ tool: string; args: Record<string, unknown>; result?: unknown }>;
    isProcessing: boolean;
}

export const VoiceMessageBubble = React.memo(function VoiceMessageBubble(props: VoiceMessageBubbleProps) {
    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Ionicons name="mic-outline" size={14} style={styles.headerIcon} />
                <Text style={styles.headerText}>
                    {t('voiceMessage.voiceMessage')}
                </Text>
                {props.isProcessing && (
                    <ActivityIndicator size="small" style={styles.spinner} />
                )}
            </View>

            {/* Transcript */}
            {props.transcript && (
                <Text style={styles.transcript}>
                    &ldquo;{props.transcript}&rdquo;
                </Text>
            )}

            {/* Summary */}
            {props.summary && (
                <Text style={styles.summary}>
                    {props.summary}
                </Text>
            )}

            {/* Action badges */}
            {props.actions && props.actions.length > 0 && (
                <View style={styles.actionsRow}>
                    {props.actions.map((action, i) => (
                        <View key={i} style={styles.actionBadge}>
                            <Text style={styles.actionText}>
                                {action.tool}
                            </Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        borderRadius: 16,
        padding: 12,
        gap: 8,
        maxWidth: '85%',
        backgroundColor: theme.colors.input.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerIcon: {
        color: theme.colors.textLink,
    },
    headerText: {
        fontSize: 13,
        color: theme.colors.textLink,
        ...Typography.default('semiBold'),
    },
    spinner: {
        marginLeft: 8,
    },
    transcript: {
        fontSize: 15,
        fontStyle: 'italic',
        color: theme.colors.text,
        ...Typography.default(),
    },
    summary: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    actionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 4,
    },
    actionBadge: {
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        backgroundColor: theme.colors.surfaceRipple,
    },
    actionText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
}));
