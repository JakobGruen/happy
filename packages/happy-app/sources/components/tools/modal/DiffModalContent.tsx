import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall } from '@/sync/typesMessage';
import { knownTools } from '@/components/tools/knownTools';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { DiffView } from '@/components/diff/DiffView';
import { trimIdent } from '@/utils/trimIdent';
import { useSetting } from '@/sync/storage';

interface DiffModalContentProps {
    tool: ToolCall;
}

/**
 * Single-tab diff view for Edit / Write / MultiEdit tools.
 * Replaces ToolModalTabs for these tools — no INPUT/OUTPUT tabs,
 * just the diff(s).
 */
export const DiffModalContent = React.memo<DiffModalContentProps>(({ tool }) => {
    const { theme } = useUnistyles();
    const showLineNumbers = useSetting('showLineNumbersInToolViews');
    const wrapLines = useSetting('wrapLinesInDiffs');

    if (tool.name === 'Edit') {
        const parsed = knownTools.Edit.input.safeParse(tool.input);
        if (!parsed.success) return <FallbackText />;

        const oldString = trimIdent(parsed.data.old_string || '');
        const newString = trimIdent(parsed.data.new_string || '');

        return (
            <View style={styles.container}>
                <DiffHeader filePath={parsed.data.file_path} />
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator
                >
                    <ToolDiffView
                        oldText={oldString}
                        newText={newString}
                        showLineNumbers={showLineNumbers}
                        showPlusMinusSymbols={showLineNumbers}
                    />
                </ScrollView>
            </View>
        );
    }

    if (tool.name === 'Write') {
        const parsed = knownTools.Write.input.safeParse(tool.input);
        if (!parsed.success) return <FallbackText />;

        const contents = typeof parsed.data.content === 'string' ? parsed.data.content : '';

        return (
            <View style={styles.container}>
                <DiffHeader filePath={parsed.data.file_path} />
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator
                >
                    <ToolDiffView
                        oldText=""
                        newText={contents}
                        showLineNumbers={showLineNumbers}
                        showPlusMinusSymbols={showLineNumbers}
                    />
                </ScrollView>
            </View>
        );
    }

    if (tool.name === 'MultiEdit') {
        const parsed = knownTools.MultiEdit.input.safeParse(tool.input);
        const edits = parsed.success ? parsed.data.edits : undefined;
        if (!edits || edits.length === 0) {
            return <FallbackText />;
        }

        return (
            <View style={styles.container}>
                <DiffHeader filePath={parsed.data?.file_path} />
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator
                >
                    {edits.map((edit, index) => (
                        <View key={index}>
                            <DiffView
                                oldText={trimIdent(edit.old_string || '')}
                                newText={trimIdent(edit.new_string || '')}
                                wrapLines={wrapLines}
                                showLineNumbers={showLineNumbers}
                                showPlusMinusSymbols={showLineNumbers}
                            />
                            {index < edits.length - 1 && (
                                <View style={styles.separator} />
                            )}
                        </View>
                    ))}
                </ScrollView>
            </View>
        );
    }

    return <FallbackText />;
});

function DiffHeader({ filePath }: { filePath?: string }) {
    const { theme } = useUnistyles();
    if (!filePath) return null;

    // Show only filename from path
    const fileName = filePath.split('/').pop() || filePath;

    return (
        <View style={[styles.diffHeader, { borderBottomColor: theme.colors.surfaceRipple }]}>
            <Text
                style={[styles.diffHeaderText, { color: theme.colors.textSecondary }]}
                numberOfLines={1}
            >
                {fileName}
            </Text>
        </View>
    );
}

function FallbackText() {
    const { theme } = useUnistyles();
    return (
        <View style={styles.fallback}>
            <Text style={[styles.fallbackText, { color: theme.colors.textSecondary }]}>
                Unable to parse diff
            </Text>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surfaceHigh,
    },
    diffHeader: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    diffHeaderText: {
        fontSize: 13,
        fontFamily: 'monospace',
        fontWeight: '500',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingVertical: 8,
    },
    separator: {
        height: 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.surfaceRipple,
        marginVertical: 4,
    },
    fallback: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    fallbackText: {
        fontSize: 14,
        fontStyle: 'italic',
    },
}));
