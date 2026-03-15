import React, { useEffect, useRef, useMemo } from 'react';
import { View, Modal, Pressable, Text, useWindowDimensions } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    withDecay,
    runOnJS,
    cancelAnimation,
    SlideInDown,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { ToolCall, Message } from '@/sync/typesMessage';
import { ToolModalTabs } from './ToolModalTabs';
import { DiffModalContent } from './DiffModalContent';
import { AgentModalContent } from './AgentModalContent';
import { FileViewModalContent } from './FileViewModalContent';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Metadata } from '@/sync/storageTypes';
import { useLocalSettingMutable } from '@/sync/storage';
import { CurrentSessionPermissionItem } from '@/hooks/useCurrentSessionPermissions';
import { UsePermissionActionsResult } from '@/hooks/usePermissionActions';
import { PermissionActionBar } from './PermissionActionBar';
import { QuestionSheetContent } from '../QuestionSheetContent';
import { PlanSheetContent } from '../PlanSheetContent';

const DIFF_TOOLS = new Set(['Edit', 'MultiEdit']);
const FILE_VIEW_TOOLS = new Set(['Read', 'Write']);
const AGENT_TOOLS = new Set(['Task', 'Agent']);

const DEFAULT_HEIGHT_RATIO = 0.5;
const MIN_HEIGHT_RATIO = 0.25;
const MAX_HEIGHT_RATIO = 0.93;
const DISMISS_VELOCITY = 1200;  // px/s — only checked at release moment, requires active fling
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };

interface ToolModalProps {
    visible: boolean;
    tool: ToolCall;
    metadata: Metadata | null;
    messages?: Message[];
    onClose: () => void;
    hideOutput?: boolean;
    sessionId?: string;
    permission?: CurrentSessionPermissionItem | null;
    permissionActions?: UsePermissionActionsResult | null;
    queueCount?: number;
}

export const ToolModal = React.memo<ToolModalProps>(
    ({ visible, tool, metadata, messages, onClose, hideOutput, sessionId, permission, permissionActions, queueCount }) => {
        const { theme } = useUnistyles();
        const { height: screenHeight } = useWindowDimensions();
        const insets = useSafeAreaInsets();

        // Height persistence (global across all tool types)
        const [toolModalHeight, setToolModalHeight] = useLocalSettingMutable('toolModalHeight');
        const savedHeightRatio = toolModalHeight || 0;
        const initialHeight = (savedHeightRatio || DEFAULT_HEIGHT_RATIO) * screenHeight;

        // Gesture state for drag-to-resize and drag-to-dismiss
        const translateY = useSharedValue(0);
        const modalHeight = useSharedValue(initialHeight);
        const heightAtStart = useSharedValue(initialHeight);

        // Reset animations when modal opens
        useEffect(() => {
            if (visible) {
                cancelAnimation(translateY);
                cancelAnimation(modalHeight);
                translateY.value = 0;
                modalHeight.value = (savedHeightRatio || DEFAULT_HEIGHT_RATIO) * screenHeight;
            }
        }, [visible, screenHeight, savedHeightRatio]);

        // Stable ref for dismiss callback from gesture worklet
        const handleCloseRef = useRef(onClose);
        handleCloseRef.current = onClose;

        const handleCloseFromGesture = () => {
            handleCloseRef.current();
        };

        // Pan gesture for drag-to-resize and drag-to-dismiss
        const panGesture = useMemo(() => Gesture.Pan()
            .onBegin(() => {
                heightAtStart.value = modalHeight.value;
            })
            .onUpdate((e) => {
                // Drag up = expand, drag down = shrink
                const newHeight = Math.min(
                    Math.max(heightAtStart.value - e.translationY, MIN_HEIGHT_RATIO * screenHeight),
                    MAX_HEIGHT_RATIO * screenHeight,
                );
                modalHeight.value = newHeight;
            })
            .onEnd((e) => {
                if (e.velocityY > DISMISS_VELOCITY) {
                    // Fast fling → dismiss with velocity-driven animation
                    translateY.value = withDecay({ velocity: e.velocityY, clamp: [0, screenHeight] });
                    // Delay close callback to let animation complete
                    runOnJS(() => {
                        setTimeout(handleCloseFromGesture, 400);
                    })();
                } else {
                    // Slow drag → persist new height (no spring-back)
                    const finalRatio = modalHeight.value / screenHeight;
                    runOnJS(setToolModalHeight)(finalRatio);
                }
            }), [screenHeight]);

        const hasActionBar = !!(permission && permissionActions);

        const animatedStyle = useAnimatedStyle(() => ({
            transform: [{ translateY: translateY.value }],
            height: modalHeight.value,
        }));

        return (
            <Modal
                visible={visible}
                transparent={true}
                animationType="none"
                onRequestClose={onClose}
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    {/* Full-screen flex container positioned with card at bottom */}
                    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                        {/* Backdrop overlay — absolutely positioned, full-screen */}
                        <Pressable
                            style={styles.backdrop}
                            onPress={onClose}
                        />

                        {/* Floating card — bottom-justified with margins */}
                        <Animated.View
                            testID="tool-modal-card"
                            entering={SlideInDown.springify().damping(20).stiffness(200)}
                            style={[
                                animatedStyle,
                                styles.card,
                                {
                                    backgroundColor: theme.colors.surfaceHigh,
                                    marginBottom: hasActionBar ? 0 : insets.bottom + 8,
                                },
                            ]}
                        >
                            {/* Drag Handle wrapped in GestureDetector */}
                            <GestureDetector gesture={panGesture}>
                                <View style={styles.dragHandleArea}>
                                    <View style={[styles.dragHandle, { backgroundColor: theme.colors.surfaceRipple }]} />
                                </View>
                            </GestureDetector>

                            {/* Modal Header */}
                            <View style={[styles.header, { borderBottomColor: theme.colors.surfaceRipple }]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.toolName}>
                                        {AGENT_TOOLS.has(tool.name)
                                            ? (tool.input?.subagent_type || tool.name)
                                            : tool.name}
                                    </Text>
                                    {AGENT_TOOLS.has(tool.name) && tool.input?.description && typeof tool.input.description === 'string' && (
                                        <Text style={styles.toolSubtitle} numberOfLines={1}>
                                            {tool.input.description}
                                        </Text>
                                    )}
                                </View>
                                <Pressable onPress={onClose} hitSlop={8}>
                                    <Ionicons name="close" size={24} color={theme.colors.text} />
                                </Pressable>
                            </View>

                            {/* Content — route by tool type */}
                            {/* Permission-aware routing — rich content tools get specialized views */}
                            {(() => {
                                const isPending = tool.permission?.status === 'pending';

                                if (isPending && tool.name === 'AskUserQuestion' && permission) {
                                    return <QuestionSheetContent permission={permission} sessionId={sessionId ?? ''} />;
                                }
                                if (isPending && (tool.name === 'ExitPlanMode' || tool.name === 'exit_plan_mode') && permission) {
                                    return <PlanSheetContent permission={permission} />;
                                }

                                // Standard routing
                                if (AGENT_TOOLS.has(tool.name)) {
                                    return <AgentModalContent tool={tool} metadata={metadata} messages={messages || []} />;
                                }
                                if (DIFF_TOOLS.has(tool.name)) {
                                    return <DiffModalContent tool={tool} />;
                                }
                                if (FILE_VIEW_TOOLS.has(tool.name)) {
                                    return <FileViewModalContent tool={tool} />;
                                }
                                return <ToolModalTabs tool={tool} hideOutput={hideOutput} />;
                            })()}
                        </Animated.View>

                        {/* Permission Action Bar — separate floating card below */}
                        {hasActionBar && (
                            <View style={{ marginBottom: insets.bottom + 8 }}>
                                <PermissionActionBar
                                    actions={permissionActions!}
                                    llmSummary={permission!.llmSummary}
                                    queueCount={queueCount ?? 0}
                                    suggestions={permission!.permissionSuggestions}
                                    toolName={tool.name}
                                />
                            </View>
                        )}
                    </View>
                </GestureHandlerRootView>
            </Modal>
        );
    }
);

const styles = StyleSheet.create((theme) => ({
    backdrop: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    card: {
        marginHorizontal: 12,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 8,
    },
    dragHandleArea: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    dragHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    toolName: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
    },
    toolSubtitle: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
}));
