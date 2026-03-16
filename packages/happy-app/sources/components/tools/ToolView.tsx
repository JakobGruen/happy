import * as React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { Message, ToolCall } from '@/sync/typesMessage';
import { Metadata } from '@/sync/storageTypes';
import { knownTools } from '@/components/tools/knownTools';
import { PermissionFooter } from './PermissionFooter';
import { PermissionActionBar } from './modal/PermissionActionBar';
import { ToolModal } from './modal/ToolModal';
import { ToolBubbleHeader } from './modal/ToolBubbleHeader';
import { usePermissionActions } from '@/hooks/usePermissionActions';
import { useCurrentSessionPermissions, CurrentSessionPermissionItem } from '@/hooks/useCurrentSessionPermissions';
import { registerPermissionModalOpen, registerPermissionModalClose } from './permissionModalRegistry';

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

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

    // Modal state for full content view
    const [isModalVisible, setIsModalVisible] = React.useState(false);

    // Measure bubble position for expand-from-bubble animation
    const containerRef = useAnimatedRef<Animated.View>();
    const sourceRectRef = React.useRef<{ header: Rect; permBar: Rect | null } | null>(null);

    // Permission state
    const isPending = tool.permission?.status === 'pending';

    // Permission actions hook (called unconditionally per React rules)
    const permissionActions = usePermissionActions(
        sessionId ?? '',
        tool.permission?.id ?? null,
        tool.name,
        tool.input,
        isPending ?? false,
    );

    // Queue count from session permissions
    const { queueCount } = useCurrentSessionPermissions(sessionId ?? '');

    // Pre-measure inline heights for split animation
    const [headerHeight, setHeaderHeight] = React.useState(0);
    const [permissionBarHeight, setPermissionBarHeight] = React.useState(0);

    // Map tool.permission to CurrentSessionPermissionItem for ToolModal
    const permissionItem: CurrentSessionPermissionItem | null = React.useMemo(() => {
        if (!isPending || !tool.permission) return null;
        return {
            permissionId: tool.permission.id,
            tool: tool.name,
            toolInput: tool.input,
            description: tool.permission.description ?? tool.description,
            llmSummary: tool.permission.decisionReason ?? null,
            permissionSuggestions: tool.permission.permissionSuggestions ?? null,
            decisionReason: tool.permission.decisionReason ?? null,
            createdAt: tool.createdAt ?? null,
        };
    }, [isPending, tool.permission, tool.name, tool.input, tool.description, tool.createdAt]);

    // Auto-close modal when permission is resolved (approved, denied, canceled)
    React.useEffect(() => {
        if (tool.permission?.status && tool.permission.status !== 'pending') {
            setIsModalVisible(false);
        }
    }, [tool.permission?.status]);

    // Track open/close in the shared registry so other modals know not to auto-open
    React.useEffect(() => {
        if (isModalVisible && isPending) {
            registerPermissionModalOpen();
            return () => registerPermissionModalClose();
        }
    }, [isModalVisible, isPending]);

    // Close modal handler
    const handleModalClose = React.useCallback(() => {
        setIsModalVisible(false);
    }, []);

    // Stable refs for measured heights (available synchronously in measureInWindow callback)
    const headerHeightRef = React.useRef(headerHeight);
    headerHeightRef.current = headerHeight;
    const permBarHeightRef = React.useRef(permissionBarHeight);
    permBarHeightRef.current = permissionBarHeight;

    const hasInlineActionBar = isPending && sessionId &&
        tool.name !== 'AskUserQuestion' && tool.name !== 'ExitPlanMode' && tool.name !== 'exit_plan_mode' &&
        props.metadata?.flavor !== 'codex';

    // Open modal on header press — measure bubble, then split into header + permBar rects
    const handlePress = React.useCallback(() => {
        if (containerRef.current) {
            containerRef.current.measureInWindow((x, y, width, height) => {
                const hH = headerHeightRef.current;
                const pH = permBarHeightRef.current;

                const headerRect: Rect = { x, y, width, height: hH || height };

                // Only provide permBar rect if we have the inline action bar with a measured height
                const permBarRect: Rect | null = (hasInlineActionBar && pH > 0)
                    ? { x, y: y + (hH || height), width, height: pH }
                    : null;

                sourceRectRef.current = { header: headerRect, permBar: permBarRect };
                setIsModalVisible(true);
            });
        } else {
            setIsModalVisible(true);
        }
    }, [hasInlineActionBar]);

    // Internal Claude Code tools (e.g. ToolSearch) are completely hidden from the UI
    const knownTool = knownTools[tool.name as keyof typeof knownTools] as any;
    if (knownTool?.hidden) {
        return null;
    }

    // Collapse post-approval/denial tools to minimal header line for Claude sessions
    // This matches CC terminal behavior where completed tools show as a single line
    const isCodex = props.metadata?.flavor === 'codex';
    const isClaude = !isCodex && props.metadata?.flavor !== 'gemini';
    const shouldCollapseToMinimal = isClaude && !!tool.permission && tool.permission.status !== 'pending' && tool.state !== 'running';

    return (
        <Animated.View ref={containerRef} style={[styles.container, isPending && styles.pendingBorder, isModalVisible && { opacity: 0 }]}>
            <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
                <ToolBubbleHeader
                    tool={tool}
                    metadata={props.metadata}
                    messages={props.messages}
                    expanded={shouldCollapseToMinimal}
                    onPress={handlePress}
                    isPending={isPending}
                />
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

            {/* Modal (opens on preview tap or auto-opened for permissions) */}
            <ToolModal
                visible={isModalVisible}
                tool={tool}
                metadata={props.metadata}
                messages={props.messages}
                onClose={handleModalClose}
                hideOutput={isPending}
                permission={permissionItem}
                permissionActions={isPending && tool.name !== 'AskUserQuestion' && tool.name !== 'ExitPlanMode' && tool.name !== 'exit_plan_mode' ? permissionActions : null}
                queueCount={queueCount}
                sessionId={sessionId}
                sourceRects={sourceRectRef.current}
                bubbleRef={containerRef}
                permissionBarHeight={permissionBarHeight}
            />

            {/* Inline permission action bar for Claude sessions */}
            {hasInlineActionBar && (
                <View onLayout={(e) => setPermissionBarHeight(e.nativeEvent.layout.height)}>
                    <PermissionActionBar
                        inline
                        containerStyle={{ borderTopWidth: 0 }}
                        actions={permissionActions}
                        llmSummary={permissionItem?.llmSummary ?? null}
                        queueCount={queueCount}
                        suggestions={permissionItem?.permissionSuggestions ?? null}
                        toolName={tool.name}
                    />
                </View>
            )}

            {/* Codex permission footer fallback */}
            {tool.permission?.status === 'pending' && sessionId && isCodex && (
                <PermissionFooter permission={tool.permission} sessionId={sessionId} toolName={tool.name} toolInput={tool.input} metadata={props.metadata} />
            )}
        </Animated.View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 8,
        marginVertical: 4,
        overflow: 'hidden',
    },
    pendingBorder: {
        borderWidth: 1.5,
        borderColor: theme.colors.box.warning.border,
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
