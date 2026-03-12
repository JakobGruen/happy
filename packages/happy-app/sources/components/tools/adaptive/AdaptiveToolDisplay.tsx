import React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolIOTabs } from './ToolIOTabs';
import { ContentPreview } from './ContentPreview';
import { useAdaptiveToolLayout } from './useAdaptiveToolLayout';
import { useIsPermissionSheetActive } from '../permissionSheetContext';
import { ToolCall } from '@/sync/typesMessage';

interface AdaptiveToolDisplayProps {
    tool: ToolCall;
    isExpanded: boolean;
}

/**
 * Adaptive tool display that handles INPUT/OUTPUT with intelligent formatting
 * - Chat view: minimized, shows preview
 * - Expanded chat: tabs with smart content detection
 * - Permission modal: input visible, output hidden
 */
export const AdaptiveToolDisplay = React.memo<AdaptiveToolDisplayProps>(
    ({ tool, isExpanded }) => {
        const { theme } = useUnistyles();
        const isInPermissionModal = useIsPermissionSheetActive();

        const layout = useAdaptiveToolLayout({
            isInPermissionModal,
            isPermissionPending: tool.permission?.status === 'pending',
            toolState: tool.state,
        });

        // Extract input/output
        const input =
            typeof tool.input === 'object' && !Array.isArray(tool.input)
                ? (tool.input as Record<string, unknown>)
                : null;

        const output =
            tool.state === 'completed' ? tool.result : undefined;

        // Minimized view: show preview in chat
        if (!isExpanded && layout.showPreview && input) {
            return (
                <View style={styles.minimizedContainer}>
                    <ContentPreview
                        label="INPUT"
                        content={input}
                    />
                    {output !== undefined && (
                        <ContentPreview
                            label="OUTPUT"
                            content={output}
                        />
                    )}
                </View>
            );
        }

        // Expanded view: show tabs with full content
        return (
            <View
                style={[
                    styles.expandedContainer,
                    { backgroundColor: theme.colors.surfaceHigh },
                ]}
            >
                {input || output !== undefined ? (
                    <ToolIOTabs
                        input={input ?? undefined}
                        output={output}
                        hideOutput={layout.hideOutput}
                    />
                ) : (
                    <View style={styles.emptyContent}>
                        <Text
                            style={[
                                styles.emptyText,
                                { color: theme.colors.textSecondary },
                            ]}
                        >
                            No content
                        </Text>
                    </View>
                )}
            </View>
        );
    }
);

const styles = StyleSheet.create({
    minimizedContainer: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        gap: 4,
    },
    expandedContainer: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    emptyContent: {
        paddingVertical: 16,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 13,
        fontStyle: 'italic',
    },
});
