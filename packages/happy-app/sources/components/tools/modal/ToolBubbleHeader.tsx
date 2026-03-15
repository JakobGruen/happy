import * as React from 'react';
import { Text, View, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { ToolCall, Message } from '@/sync/typesMessage';
import { Metadata } from '@/sync/storageTypes';
import { knownTools } from '@/components/tools/knownTools';
import { formatMCPTitle } from '@/components/tools/views/MCPToolView';
import { ContentPreview } from './ContentPreview';
import { useElapsedTime } from '@/hooks/useElapsedTime';
import { parseToolUseError } from '@/utils/toolErrorParser';

const ACTIVITY_INDICATOR_STYLE = { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] } as const;

interface ToolBubbleHeaderProps {
    tool: ToolCall;
    metadata: Metadata | null;
    messages?: Message[];
    expanded: boolean;
    onPress?: () => void;
    isPending?: boolean;
}

export const ToolBubbleHeader = React.memo<ToolBubbleHeaderProps>(({
    tool,
    metadata,
    messages,
    expanded,
    onPress,
    isPending,
}) => {
    const { theme } = useUnistyles();

    // --- Resolve tool title ---
    const knownTool = knownTools[tool.name as keyof typeof knownTools] as any;

    let toolTitle = tool.name;
    if (tool.name.startsWith('mcp__')) {
        toolTitle = formatMCPTitle(tool.name);
    } else if (knownTool?.title) {
        if (typeof knownTool.title === 'function') {
            toolTitle = knownTool.title({ tool, metadata });
        } else {
            toolTitle = knownTool.title;
        }
    }

    // --- Resolve description/subtitle ---
    let description: string | null = null;

    if (tool.name.startsWith('mcp__')) {
        // MCP tools: extract 1-2 key string params as inline subtitle
        if (tool.input && typeof tool.input === 'object') {
            const stringParams = Object.entries(tool.input)
                .filter(([_, v]) => typeof v === 'string' && (v as string).length > 0)
                .slice(0, 2);
            if (stringParams.length > 0) {
                description = stringParams
                    .map(([k, v]) => {
                        const val = String(v);
                        const truncated = val.length > 30 ? val.substring(0, 30) + '…' : val;
                        return `${k}=${truncated}`;
                    })
                    .join('  ');
            }
        }
    } else if (knownTool && typeof knownTool.extractSubtitle === 'function') {
        const subtitle = knownTool.extractSubtitle({ tool, metadata });
        if (typeof subtitle === 'string' && subtitle) {
            description = subtitle;
        }
    }

    // --- Resolve status text ---
    let status: string | null = null;
    if (knownTool && typeof knownTool.extractStatus === 'function') {
        const state = knownTool.extractStatus({ tool, metadata });
        if (typeof state === 'string' && state) {
            status = state;
        }
    }

    // --- Resolve icon ---
    let icon = <Ionicons name="construct-outline" size={18} color={theme.colors.textSecondary} />;

    if (tool.name === 'CodexBash' && tool.input?.parsed_cmd && Array.isArray(tool.input.parsed_cmd) && tool.input.parsed_cmd.length > 0) {
        const parsedCmd = tool.input.parsed_cmd[0];
        if (parsedCmd.type === 'read') {
            icon = <Octicons name="eye" size={18} color={theme.colors.text} />;
        } else if (parsedCmd.type === 'write') {
            icon = <Octicons name="file-diff" size={18} color={theme.colors.text} />;
        } else {
            icon = <Octicons name="terminal" size={18} color={theme.colors.text} />;
        }
    } else if (tool.name.startsWith('mcp__')) {
        icon = <Ionicons name="extension-puzzle-outline" size={18} color={theme.colors.text} />;
    } else if (knownTool && typeof knownTool.icon === 'function') {
        icon = knownTool.icon(18, theme.colors.text);
    }

    // --- Resolve minimal flag (suppress ContentPreview) ---
    let minimal = false;
    if (knownTool && knownTool.minimal !== undefined) {
        if (typeof knownTool.minimal === 'function') {
            minimal = knownTool.minimal({ tool, metadata, messages });
        } else {
            minimal = knownTool.minimal;
        }
    }

    // --- Resolve noStatus flag ---
    let noStatus = false;
    if (knownTool && typeof knownTool.noStatus === 'boolean') {
        noStatus = knownTool.noStatus;
    }

    // --- Resolve status icon ---
    let statusIcon = null;

    let isToolUseError = false;
    if (tool.state === 'error' && tool.result && parseToolUseError(tool.result).isToolUseError) {
        isToolUseError = true;
    }

    if (tool.permission && (tool.permission.status === 'denied' || tool.permission.status === 'canceled')) {
        statusIcon = <Ionicons name="remove-circle-outline" size={20} color={theme.colors.textSecondary} />;
    } else if (isToolUseError) {
        statusIcon = <Ionicons name="remove-circle-outline" size={20} color={theme.colors.textSecondary} />;
    } else {
        switch (tool.state) {
            case 'running':
                if (!noStatus) {
                    statusIcon = <ActivityIndicator size="small" color={theme.colors.text} style={ACTIVITY_INDICATOR_STYLE} />;
                }
                break;
            case 'completed':
                break;
            case 'error':
                statusIcon = <Ionicons name="alert-circle-outline" size={20} color={theme.colors.warning} />;
                break;
        }
    }

    // --- Build title text with inline description ---
    const titleText = description
        ? `${toolTitle}: ${description}`
        : toolTitle;

    const headerContent = (
        <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
                {icon}
            </View>
            <View style={styles.titleContainer}>
                <Text style={styles.toolName} numberOfLines={1}>
                    {titleText}
                    {status ? <Text style={styles.status}>{` ${status}`}</Text> : null}
                </Text>
                {!expanded && !minimal && (
                    <ContentPreview tool={tool} />
                )}
            </View>
            {tool.state === 'running' && (
                <View style={styles.elapsedContainer}>
                    <ElapsedView from={tool.createdAt} />
                </View>
            )}
            {statusIcon}
        </View>
    );

    if (onPress) {
        return (
            <TouchableOpacity
                style={styles.header}
                onPress={onPress}
                activeOpacity={0.8}
                testID="tool-bubble-header"
            >
                {headerContent}
            </TouchableOpacity>
        );
    }

    return (
        <View style={styles.header} testID="tool-bubble-header">
            {headerContent}
        </View>
    );
});

function ElapsedView(props: { from: number }) {
    const { from } = props;
    const elapsed = useElapsedTime(from);
    return <Text style={styles.elapsedText}>{elapsed.toFixed(1)}s</Text>;
}

const styles = StyleSheet.create((theme) => ({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: theme.colors.surfaceHighest,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    iconContainer: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleContainer: {
        flex: 1,
    },
    elapsedContainer: {
        marginLeft: 8,
    },
    elapsedText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    toolName: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
    },
    status: {
        fontWeight: '400',
        opacity: 0.3,
        fontSize: 15,
    },
}));
