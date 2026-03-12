import React from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { analyzeContent, getContentBadge } from './contentAnalyzer';

interface ContentPreviewProps {
    label: string;
    content: unknown;
}

/**
 * Generates a scannable preview of content for the minimized chat view
 * Shows label + first line + badge indicating content type/size
 */
export const ContentPreview = React.memo<ContentPreviewProps>(
    ({ label, content }) => {
        const { theme } = useUnistyles();
        const analysis = React.useMemo(
            () => analyzeContent(content),
            [content]
        );

        // Get preview text: first line only
        const previewText =
            analysis.previewLines.length > 0
                ? analysis.previewLines[0]
                : '(empty)';

        const truncated =
            previewText.length > 50
                ? previewText.substring(0, 47) + '…'
                : previewText;

        const badge = getContentBadge(analysis);

        return (
            <View style={styles.container}>
                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                    {label}
                </Text>
                <Text
                    style={[
                        styles.preview,
                        { color: theme.colors.text },
                    ]}
                    numberOfLines={1}
                >
                    {truncated}
                </Text>
                {badge && (
                    <Text
                        style={[
                            styles.badge,
                            { color: theme.colors.textSecondary },
                        ]}
                    >
                        [{badge}]
                    </Text>
                )}
            </View>
        );
    }
);

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 2,
    },
    label: {
        fontSize: 12,
        fontWeight: '500',
    },
    preview: {
        fontSize: 12,
        flex: 1,
    },
    badge: {
        fontSize: 11,
        marginLeft: 4,
    },
});
