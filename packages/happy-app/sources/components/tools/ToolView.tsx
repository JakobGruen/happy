import * as React from 'react';
import { Text, View, TouchableOpacity, Pressable, ActivityIndicator, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { getToolViewComponent } from './views/_all';
import { Message, ToolCall } from '@/sync/typesMessage';
import { CodeView } from '../CodeView';
import { ToolSectionView } from './ToolSectionView';
import { useElapsedTime } from '@/hooks/useElapsedTime';
import { ToolError } from './ToolError';
import { knownTools } from '@/components/tools/knownTools';
import { Metadata } from '@/sync/storageTypes';
import { useRouter } from 'expo-router';
import { PermissionFooter } from './PermissionFooter';
import { useIsPermissionSheetActive } from './permissionSheetContext';
import { parseToolUseError } from '@/utils/toolErrorParser';
import { formatMCPTitle } from './views/MCPToolView';
import { t } from '@/text';
import { ToolModal } from './modal/ToolModal';
import { ContentPreview } from './modal/ContentPreview';

interface ToolViewProps {
    metadata: Metadata | null;
    tool: ToolCall;
    messages?: Message[];
    onPress?: () => void;
    sessionId?: string;
    messageId?: string;
}

export const ToolView = React.memo<ToolViewProps>((props) => {
    const { tool, onPress, sessionId, messageId } = props;
    const router = useRouter();
    const { theme } = useUnistyles();

    // Modal state for full content view
    const [isModalVisible, setIsModalVisible] = React.useState(false);

    // Open modal on header press
    const handlePress = React.useCallback(() => {
        setIsModalVisible(true);
    }, []);

    // Always make header pressable to open modal
    const isPressable = true;

    let knownTool = knownTools[tool.name as keyof typeof knownTools] as any;

    // Internal Claude Code tools (e.g. ToolSearch) are completely hidden from the UI
    if (knownTool?.hidden) {
        return null;
    }

    let description: string | null = null;
    let status: string | null = null;
    let minimal = false;
    let icon = <Ionicons name="construct-outline" size={18} color={theme.colors.textSecondary} />;
    let noStatus = false;
    let hideDefaultError = false;

    // For Gemini: unknown tools should be rendered as minimal (hidden)
    // This prevents showing raw INPUT/OUTPUT for internal Gemini tools
    // that we haven't explicitly added to knownTools
    const isGemini = props.metadata?.flavor === 'gemini';
    if (!knownTool && isGemini) {
        minimal = true;
    }

    // Extract status first to potentially use as title
    if (knownTool && typeof knownTool.extractStatus === 'function') {
        const state = knownTool.extractStatus({ tool, metadata: props.metadata });
        if (typeof state === 'string' && state) {
            status = state;
        }
    }

    // Handle optional title and function type
    let toolTitle = tool.name;

    // Special handling for MCP tools — compact summary with key params
    if (tool.name.startsWith('mcp__')) {
        toolTitle = formatMCPTitle(tool.name);
        icon = <Ionicons name="extension-puzzle-outline" size={18} color={theme.colors.text} />;
        // Extract 1-2 key string params as inline subtitle
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
    } else if (knownTool?.title) {
        if (typeof knownTool.title === 'function') {
            toolTitle = knownTool.title({ tool, metadata: props.metadata });
        } else {
            toolTitle = knownTool.title;
        }
    }

    if (knownTool && typeof knownTool.extractSubtitle === 'function') {
        const subtitle = knownTool.extractSubtitle({ tool, metadata: props.metadata });
        if (typeof subtitle === 'string' && subtitle) {
            description = subtitle;
        }
    }
    if (knownTool && knownTool.minimal !== undefined) {
        if (typeof knownTool.minimal === 'function') {
            minimal = knownTool.minimal({ tool, metadata: props.metadata, messages: props.messages });
        } else {
            minimal = knownTool.minimal;
        }
    }

    // Special handling for CodexBash to determine icon based on parsed_cmd
    if (tool.name === 'CodexBash' && tool.input?.parsed_cmd && Array.isArray(tool.input.parsed_cmd) && tool.input.parsed_cmd.length > 0) {
        const parsedCmd = tool.input.parsed_cmd[0];
        if (parsedCmd.type === 'read') {
            icon = <Octicons name="eye" size={18} color={theme.colors.text} />;
        } else if (parsedCmd.type === 'write') {
            icon = <Octicons name="file-diff" size={18} color={theme.colors.text} />;
        } else {
            icon = <Octicons name="terminal" size={18} color={theme.colors.text} />;
        }
    } else if (knownTool && typeof knownTool.icon === 'function') {
        icon = knownTool.icon(18, theme.colors.text);
    }

    if (knownTool && typeof knownTool.noStatus === 'boolean') {
        noStatus = knownTool.noStatus;
    }
    if (knownTool && typeof knownTool.hideDefaultError === 'boolean') {
        hideDefaultError = knownTool.hideDefaultError;
    }

    let statusIcon = null;

    let isToolUseError = false;
    if (tool.state === 'error' && tool.result && parseToolUseError(tool.result).isToolUseError) {
        isToolUseError = true;
        console.log('isToolUseError', tool.result);
    }

    // Check permission status first for denied/canceled states
    if (tool.permission && (tool.permission.status === 'denied' || tool.permission.status === 'canceled')) {
        statusIcon = <Ionicons name="remove-circle-outline" size={20} color={theme.colors.textSecondary} />;
    } else if (isToolUseError) {
        statusIcon = <Ionicons name="remove-circle-outline" size={20} color={theme.colors.textSecondary} />;
        hideDefaultError = true;
        minimal = true;
    } else {
        switch (tool.state) {
            case 'running':
                if (!noStatus) {
                    statusIcon = <ActivityIndicator size="small" color={theme.colors.text} style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }} />;
                }
                break;
            case 'completed':
                // if (!noStatus) {
                //     statusIcon = <Ionicons name="checkmark-circle" size={20} color="#34C759" />;
                // }
                break;
            case 'error':
                statusIcon = <Ionicons name="alert-circle-outline" size={20} color={theme.colors.warning} />;
                break;
        }
    }

    // Collapse post-approval/denial tools to minimal header line for Claude sessions
    // This matches CC terminal behavior where completed tools show as a single line
    const isClaude = props.metadata?.flavor !== 'codex' && props.metadata?.flavor !== 'gemini';
    if (isClaude && tool.permission && tool.permission.status !== 'pending' && tool.state !== 'running') {
        minimal = true;
    }

    // When the permission sheet is active and this tool has a pending permission,
    // collapse to one-liner in chat — the sheet shows the full context instead
    const isSheetActive = useIsPermissionSheetActive();
    if (isSheetActive && isClaude && tool.permission?.status === 'pending') {
        minimal = true;
    }

    const headerContent = (
        <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
                {icon}
            </View>
            <View style={styles.titleContainer}>
                <Text style={styles.toolName} numberOfLines={1}>{toolTitle}{status ? <Text style={styles.status}>{` ${status}`}</Text> : null}</Text>
                {description && (
                    <Text style={styles.toolDescription} numberOfLines={1}>
                        {description}
                    </Text>
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

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                {isPressable ? (
                    <TouchableOpacity style={styles.headerMain} onPress={handlePress} activeOpacity={0.8}>
                        {headerContent}
                    </TouchableOpacity>
                ) : (
                    <View style={styles.headerMain}>
                        {headerContent}
                    </View>
                )}
            </View>

            {/* Deny feedback — shown when user denied with a reason */}
            {tool.permission?.status === 'denied' && tool.permission.reason && (
                <View style={styles.denyReasonContainer}>
                    <Text style={styles.denyReasonText} numberOfLines={3}>
                        {tool.permission.reason}
                    </Text>
                </View>
            )}

            {/* Answer summary — shown for completed AskUserQuestion (like deny-feedback) */}
            {tool.name === 'AskUserQuestion' && tool.permission?.status === 'approved' && tool.result &&
                typeof tool.result === 'object' && !Array.isArray(tool.result) && !(tool.result as any).error && (
                <View style={styles.answerSummaryContainer}>
                    {Object.entries(tool.result as Record<string, string>).map(([, answer], idx) => (
                        <Text key={idx} style={styles.answerSummaryText} numberOfLines={2}>
                            {answer}
                        </Text>
                    ))}
                </View>
            )}

            {/* 2-Line Preview (static, always visible) */}
            {!minimal && (
                <View style={styles.previewContainer}>
                    <ContentPreview tool={tool} />
                </View>
            )}

            {/* Modal (opens on preview tap) */}
            <ToolModal
                visible={isModalVisible}
                tool={tool}
                metadata={props.metadata}
                onClose={() => setIsModalVisible(false)}
                hideOutput={tool.permission?.status === 'pending'}
            />

            {/* Permission footer - always renders when permission exists to maintain consistent height */}
            {/* AskUserQuestion has its own Submit button UI - no permission footer needed */}
            {tool.permission && sessionId && tool.name !== 'AskUserQuestion' && (
                <PermissionFooter permission={tool.permission} sessionId={sessionId} toolName={tool.name} toolInput={tool.input} metadata={props.metadata} />
            )}
        </View>
    );
});

function ElapsedView(props: { from: number }) {
    const { from } = props;
    const elapsed = useElapsedTime(from);
    return <Text style={styles.elapsedText}>{elapsed.toFixed(1)}s</Text>;
}

const styles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 8,
        marginVertical: 4,
        overflow: 'hidden'
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: theme.colors.surfaceHighest,
    },
    headerMain: {
        flex: 1,
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
    toolDescription: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    previewContainer: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: theme.colors.surfaceRipple,
    },
    denyReasonContainer: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    denyReasonText: {
        fontSize: 13,
        color: theme.colors.permissionButton.deny.background,
        fontStyle: 'italic',
    },
    answerSummaryContainer: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    answerSummaryText: {
        fontSize: 13,
        color: theme.colors.textLink,
        fontStyle: 'italic',
    },
}));
