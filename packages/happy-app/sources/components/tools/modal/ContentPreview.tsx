import React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall } from '@/sync/typesMessage';
import { analyzeContent, formatSize } from '../adaptive/contentAnalyzer';
import { languageFromPath } from '@/utils/languageFromPath';

interface ContentPreviewProps {
    tool: ToolCall;
}

export const ContentPreview = React.memo<ContentPreviewProps>(({ tool }) => {
    const { theme } = useUnistyles();

    // Get first line of output or first parameter
    const previewLine = React.useMemo(() => {
        // File-aware preview for Read/Write
        if (tool.name === 'Read' || tool.name === 'Write') {
            const filePath = tool.input?.file_path;
            if (typeof filePath === 'string') {
                const lang = languageFromPath(filePath);
                const langLabel = lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : 'File';
                if (tool.name === 'Read' && tool.result) {
                    const file = (tool.result as any)?.file;
                    if (file?.totalLines) {
                        return `${langLabel} · ${file.totalLines} lines`;
                    }
                }
                if (tool.name === 'Write' && tool.input?.content) {
                    const lineCount = String(tool.input.content).split('\n').length;
                    return `${langLabel} · ${lineCount} lines`;
                }
                return langLabel;
            }
        }

        // First try result/output
        if (tool.result && typeof tool.result === 'string') {
            const firstLine = tool.result.split('\n')[0];
            return firstLine.substring(0, 50) + (firstLine.length > 50 ? '…' : '');
        }

        // Then try first input parameter
        if (tool.input && typeof tool.input === 'object') {
            const values = Object.values(tool.input);
            if (values.length > 0 && typeof values[0] === 'string') {
                const firstVal = String(values[0]);
                return firstVal.substring(0, 50) + (firstVal.length > 50 ? '…' : '');
            }
        }

        // Fallback
        return '–';
    }, [tool.result, tool.input]);

    // Analyze content to get type badge
    const badge = React.useMemo(() => {
        if (!tool.result) return null;
        const analysis = analyzeContent(tool.result);
        const sizeLabel = formatSize(analysis.size);
        return `${analysis.type.toUpperCase()} • ${sizeLabel}`;
    }, [tool.result]);

    return (
        <View>
            <Text style={[styles.previewLine, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                {previewLine}
            </Text>
            {badge && (
                <Text style={[styles.badge, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                    {badge}
                </Text>
            )}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    previewLine: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    badge: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 1,
    },
}));
