import React from 'react';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { CurrentSessionPermissionItem } from '@/hooks/useCurrentSessionPermissions';
import { knownTools } from '@/components/tools/knownTools';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { DiffView } from '@/components/diff/DiffView';
import { trimIdent } from '@/utils/trimIdent';
import { useSetting } from '@/sync/storage';

interface EditSheetContentProps {
    permission: CurrentSessionPermissionItem;
}

/**
 * Renders file diffs inside the permission sheet for Edit/Write/MultiEdit tools.
 * Reuses the same diff components as the inline tool views.
 */
export const EditSheetContent = React.memo<EditSheetContentProps>(({ permission }) => {
    const showLineNumbers = useSetting('showLineNumbersInToolViews');
    const wrapLines = useSetting('wrapLinesInDiffs');

    const tool = permission.tool;
    const input = permission.toolInput;

    if (tool === 'Edit') {
        const parsed = knownTools.Edit.input.safeParse(input);
        if (!parsed.success) return null;
        const oldString = trimIdent(parsed.data.old_string || '');
        const newString = trimIdent(parsed.data.new_string || '');

        return (
            <View style={styles.container}>
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
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

    if (tool === 'Write') {
        const parsed = knownTools.Write.input.safeParse(input);
        if (!parsed.success) return null;
        const contents = typeof parsed.data.content === 'string' ? parsed.data.content : '';

        return (
            <View style={styles.container}>
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
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

    if (tool === 'MultiEdit') {
        const parsed = knownTools.MultiEdit.input.safeParse(input);
        if (!parsed.success || !parsed.data.edits || parsed.data.edits.length === 0) return null;
        const edits = parsed.data.edits;

        return (
            <View style={styles.container}>
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
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
                            {index < edits.length - 1 && <View style={styles.separator} />}
                        </View>
                    ))}
                </ScrollView>
            </View>
        );
    }

    return null;
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: theme.colors.divider,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingVertical: 8,
    },
    separator: {
        height: 8,
    },
}));
