import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { analyzeContent, getContentBadge } from './contentAnalyzer';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { CodeView } from '@/components/CodeView';

interface VariableFormatterProps {
    name: string;
    value: unknown;
    isExpanded?: boolean;
    onToggle?: () => void;
    isVertical?: boolean;
}

/**
 * Formats and displays a single input/output variable with smart content detection
 * Shows inline for short values, collapsible for long values
 * In vertical mode, displays value below name without expand/collapse
 */
export const VariableFormatter = React.memo<VariableFormatterProps>(
    ({ name, value, isExpanded = false, onToggle, isVertical = false }) => {
        const { theme } = useUnistyles();
        const analysis = React.useMemo(() => analyzeContent(value, name), [value, name]);

        // Vertical mode: display value below name without expand/collapse
        if (isVertical) {
            return (
                <View style={styles.verticalContainer}>
                    {typeof value === 'string' && value.length < 80 ? (
                        <Text
                            style={[
                                styles.varValueShort,
                                { color: theme.colors.text },
                            ]}
                            numberOfLines={1}
                        >
                            {value}
                        </Text>
                    ) : typeof value === 'boolean' || typeof value === 'number' ? (
                        <Text style={[styles.varValueShort, { color: theme.colors.text }]}>
                            {String(value)}
                        </Text>
                    ) : (
                        <View
                            style={[
                                styles.verticalCodeBlock,
                                { backgroundColor: theme.colors.surfaceHigh },
                            ]}
                        >
                            <CodeView
                                code={analysis.fullText}
                            />
                        </View>
                    )}
                </View>
            );
        }

        // Short values display inline without expand/collapse
        if (!analysis.isLarge) {
            return (
                <View style={styles.container}>
                    <Text style={[styles.varName, { color: theme.colors.textSecondary }]}>
                        {name}
                    </Text>
                    {typeof value === 'string' && value.length < 80 ? (
                        <Text
                            style={[
                                styles.varValueShort,
                                { color: theme.colors.text },
                            ]}
                            numberOfLines={1}
                        >
                            {value}
                        </Text>
                    ) : typeof value === 'boolean' || typeof value === 'number' ? (
                        <Text style={[styles.varValueShort, { color: theme.colors.text }]}>
                            {String(value)}
                        </Text>
                    ) : (
                        <View
                            style={[
                                styles.inlineCodeBlock,
                                { backgroundColor: theme.colors.surfaceHigh },
                            ]}
                        >
                            <CodeView
                                code={analysis.fullText}
                            />
                        </View>
                    )}
                </View>
            );
        }

        // Long values are collapsible
        const badge = getContentBadge(analysis);

        return (
            <View style={styles.container}>
                <Pressable
                    onPress={onToggle}
                    style={[
                        styles.expandableHeader,
                        { backgroundColor: theme.colors.surfaceHigh },
                    ]}
                    hitSlop={8}
                >
                    <View style={styles.headerLeft}>
                        <Ionicons
                            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                            size={16}
                            color={theme.colors.textSecondary}
                            style={styles.chevron}
                        />
                        <Text
                            style={[
                                styles.varName,
                                { color: theme.colors.textSecondary },
                            ]}
                            numberOfLines={1}
                        >
                            {name}
                        </Text>
                    </View>
                    <Text
                        style={[
                            styles.badge,
                            { color: theme.colors.textSecondary },
                        ]}
                    >
                        {badge}
                    </Text>
                </Pressable>

                {isExpanded && (
                    <View
                        style={[
                            styles.expandedContent,
                            { backgroundColor: theme.colors.surfaceHighest },
                        ]}
                    >
                        {analysis.type === 'code' && analysis.language ? (
                            <SimpleSyntaxHighlighter
                                code={analysis.fullText}
                                language={analysis.language}
                                selectable={true}
                            />
                        ) : (
                            <CodeView code={analysis.fullText} />
                        )}
                    </View>
                )}
            </View>
        );
    }
);

const styles = StyleSheet.create((theme) => ({
    container: {
        marginVertical: 6,
    },
    varName: {
        fontSize: 13,
        fontWeight: '500',
        fontFamily: Platform.select({
            ios: 'Menlo',
            android: 'monospace',
            default: 'monospace',
        }),
    },
    varValueShort: {
        fontSize: 13,
        fontFamily: Platform.select({
            ios: 'Menlo',
            android: 'monospace',
            default: 'monospace',
        }),
        marginTop: 4,
    },
    inlineCodeBlock: {
        borderRadius: 4,
        padding: 8,
        marginTop: 4,
        maxHeight: 120,
    },
    expandableHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 4,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 6,
    },
    chevron: {
        width: 16,
        textAlignVertical: 'center',
    },
    badge: {
        fontSize: 12,
        marginLeft: 8,
    },
    expandedContent: {
        marginTop: 4,
        borderRadius: 4,
        overflow: 'hidden',
        maxHeight: 400,
    },
    verticalContainer: {
        marginBottom: 0,
        marginTop: 0,
    },
    verticalCodeBlock: {
        borderRadius: 4,
        padding: 8,
        marginTop: 4,
        maxHeight: 120,
    },
}));
