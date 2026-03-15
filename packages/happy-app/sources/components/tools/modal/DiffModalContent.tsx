import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall } from '@/sync/typesMessage';
import { knownTools } from '@/components/tools/knownTools';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { DiffView } from '@/components/diff/DiffView';
import { trimIdent } from '@/utils/trimIdent';
import { useSetting, useSettingMutable } from '@/sync/storage';
import { WrapToggleButton } from './FileViewModalContent';
import { Typography } from '@/constants/Typography';

interface DiffModalContentProps {
    tool: ToolCall;
}

/**
 * Single-tab diff view for Edit / MultiEdit tools.
 * Replaces ToolModalTabs for these tools — no INPUT/OUTPUT tabs,
 * just the diff(s).
 */
export const DiffModalContent = React.memo<DiffModalContentProps>(({ tool }) => {
    const { theme } = useUnistyles();
    const showLineNumbers = useSetting('showLineNumbersInToolViews');
    const [wrapLines, setWrapLines] = useSettingMutable('wrapLinesInDiffs');

    if (tool.name === 'Edit') {
        const parsed = knownTools.Edit.input.safeParse(tool.input);
        if (!parsed.success) return <FallbackText />;

        const oldString = trimIdent(parsed.data.old_string || '');
        const newString = trimIdent(parsed.data.new_string || '');

        return (
            <View style={styles.container}>
                <DiffHeader
                    filePath={parsed.data.file_path}
                    wrapLines={wrapLines}
                    onToggleWrap={() => setWrapLines(!wrapLines)}
                />
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

    if (tool.name === 'MultiEdit') {
        const parsed = knownTools.MultiEdit.input.safeParse(tool.input);
        const edits = parsed.success ? parsed.data.edits : undefined;
        if (!edits || edits.length === 0) {
            return <FallbackText />;
        }

        return (
            <View style={styles.container}>
                <DiffHeader
                    filePath={parsed.data?.file_path}
                    wrapLines={wrapLines}
                    onToggleWrap={() => setWrapLines(!wrapLines)}
                />
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

function DiffHeader({
    filePath,
    wrapLines,
    onToggleWrap,
}: {
    filePath?: string;
    wrapLines: boolean;
    onToggleWrap: () => void;
}) {
    const { theme } = useUnistyles();
    if (!filePath) return null;

    const fileName = filePath.split('/').pop() || filePath;

    return (
        <View style={[styles.diffHeader, { borderBottomColor: theme.colors.surfaceRipple }]}>
            <Text
                style={[styles.diffHeaderText, { color: theme.colors.textSecondary }]}
                numberOfLines={1}
            >
                {fileName}
            </Text>
            <WrapToggleButton wrapLines={wrapLines} onPress={onToggleWrap} />
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    diffHeaderText: {
        fontSize: 13,
        fontFamily: Typography.mono().fontFamily,
        fontWeight: '500',
        flex: 1,
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
