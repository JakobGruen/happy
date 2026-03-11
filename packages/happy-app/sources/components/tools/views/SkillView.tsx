import * as React from 'react';
import { ToolViewProps } from "./_all";
import { ToolSectionView } from '../../tools/ToolSectionView';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { View, Text, StyleSheet } from 'react-native';

export const SkillView = React.memo<ToolViewProps>(({ tool }) => {
    // Skill content might be in the result field
    let skillContent: string | null = null;

    // Check if result contains the skill content (string format)
    if (tool.result) {
        if (typeof tool.result === 'string') {
            skillContent = tool.result;
        } else if (typeof tool.result === 'object' && 'content' in tool.result) {
            skillContent = (tool.result as any).content;
        }
    }

    // If no content in result, check input for stored skill content
    if (!skillContent && tool.input && typeof tool.input === 'object' && 'content' in tool.input) {
        skillContent = (tool.input as any).content;
    }

    if (!skillContent) {
        return null;
    }

    return (
        <ToolSectionView title="Skill Content">
            <View style={styles.container}>
                <MarkdownView markdown={skillContent} />
            </View>
        </ToolSectionView>
    );
});

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 8,
        marginTop: -10,
    },
});
