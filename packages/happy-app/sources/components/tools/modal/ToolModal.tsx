import React, { useEffect, useRef, useMemo } from 'react';
import { View, Modal, Pressable, Text, useWindowDimensions } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    cancelAnimation,
    interpolate,
    Extrapolation,
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

const ACTION_BAR_ESTIMATED_HEIGHT = 140;

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
    sourceRect?: { x: number; y: number; width: number; height: number } | null;
}

export const ToolModal = React.memo<ToolModalProps>(
    ({ visible, tool, metadata, messages, onClose, hideOutput, sessionId, permission, permissionActions, queueCount, sourceRect }) => {
        const { theme } = useUnistyles();
        const { width: screenWidth, height: screenHeight } = useWindowDimensions();
        const insets = useSafeAreaInsets();

        // Height persistence (global across all tool types)
        const [toolModalHeight, setToolModalHeight] = useLocalSettingMutable('toolModalHeight');
        const savedHeightRatio = toolModalHeight || 0;
        const initialHeight = (savedHeightRatio || DEFAULT_HEIGHT_RATIO) * screenHeight;

        // Gesture state for drag-to-resize and drag-to-dismiss
        const translateY = useSharedValue(0);
        const modalHeight = useSharedValue(initialHeight);
        const heightAtStart = useSharedValue(initialHeight);

        // Expand/collapse animation progress (0 = at bubble, 1 = fully expanded)
        const progress = useSharedValue(0);

        // Internal visibility keeps Modal mounted during close animation
        const [internalVisible, setInternalVisible] = React.useState(false);
        const isClosingRef = useRef(false);

        // Stable ref for onClose callback
        const handleCloseRef = useRef(onClose);
        handleCloseRef.current = onClose;

        const actualClose = React.useCallback(() => {
            isClosingRef.current = false;
            setInternalVisible(false);
            handleCloseRef.current();
        }, []);

        // Open: set internal visible immediately, animate in
        useEffect(() => {
            if (visible) {
                isClosingRef.current = false;
                cancelAnimation(translateY);
                cancelAnimation(modalHeight);
                translateY.value = 0;
                modalHeight.value = (savedHeightRatio || DEFAULT_HEIGHT_RATIO) * screenHeight;
                setInternalVisible(true);
            }
        }, [visible, screenHeight, savedHeightRatio]);

        // Animate progress when internalVisible changes
        useEffect(() => {
            if (internalVisible) {
                cancelAnimation(progress);
                progress.value = 0;
                progress.value = withSpring(1, SPRING_CONFIG);
            }
        }, [internalVisible]);

        // Close with animation
        const handleClose = React.useCallback(() => {
            if (isClosingRef.current) return;
            isClosingRef.current = true;
            progress.value = withSpring(0, SPRING_CONFIG, (finished) => {
                if (finished) {
                    runOnJS(actualClose)();
                }
            });
        }, [actualClose]);

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
                    // Fast fling → collapse back to bubble
                    progress.value = withSpring(0, SPRING_CONFIG, (finished) => {
                        if (finished) runOnJS(actualClose)();
                    });
                } else {
                    // Slow drag → persist new height (no spring-back)
                    const finalRatio = modalHeight.value / screenHeight;
                    runOnJS(setToolModalHeight)(finalRatio);
                }
            }), [screenHeight, actualClose]);

        const hasActionBar = !!(permission && permissionActions);

        // Expand-from-bubble animated style
        const expandStyle = useAnimatedStyle(() => {
            const finalX = 12; // marginHorizontal
            const finalWidth = screenWidth - 24;
            const finalHeight = modalHeight.value;
            const bottomMargin = hasActionBar ? ACTION_BAR_ESTIMATED_HEIGHT : insets.bottom + 8;
            const finalY = screenHeight - finalHeight - bottomMargin;

            if (!sourceRect) {
                // Fallback: slide up from bottom
                const fallbackY = interpolate(progress.value, [0, 1], [screenHeight, finalY]);
                return {
                    position: 'absolute' as const,
                    left: finalX,
                    top: fallbackY + translateY.value,
                    width: finalWidth,
                    height: finalHeight,
                    borderRadius: 16,
                };
            }

            const p = progress.value;
            return {
                position: 'absolute' as const,
                left: interpolate(p, [0, 1], [sourceRect.x, finalX]),
                top: interpolate(p, [0, 1], [sourceRect.y, finalY]) + translateY.value,
                width: interpolate(p, [0, 1], [sourceRect.width, finalWidth]),
                height: interpolate(p, [0, 1], [sourceRect.height, finalHeight]),
                borderRadius: interpolate(p, [0, 1], [8, 16]),
            };
        });

        // Backdrop fade animation
        const backdropStyle = useAnimatedStyle(() => ({
            opacity: interpolate(progress.value, [0, 1], [0, 0.4]),
        }));

        // Content fade-in (unreadable at small scale)
        const contentOpacity = useAnimatedStyle(() => ({
            opacity: interpolate(progress.value, [0.3, 0.7], [0, 1], Extrapolation.CLAMP),
        }));

        return (
            <Modal
                visible={internalVisible}
                transparent={true}
                animationType="none"
                onRequestClose={handleClose}
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    {/* Backdrop overlay — animated opacity */}
                    <Animated.View style={[styles.backdrop, backdropStyle]}>
                        <Pressable style={{ flex: 1 }} onPress={handleClose} />
                    </Animated.View>

                    {/* Floating card — expands from bubble position */}
                    <Animated.View
                        testID="tool-modal-card"
                        style={[
                            expandStyle,
                            styles.card,
                            {
                                backgroundColor: theme.colors.surfaceHigh,
                            },
                        ]}
                    >
                        {/* Content fades in as card expands */}
                        <Animated.View style={[{ flex: 1 }, contentOpacity]}>
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
                                <Pressable onPress={handleClose} hitSlop={8}>
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
                                // Pending permission: Read/Write have no result yet, so FileViewModalContent
                                // would show "Waiting for result..." — fall through to ToolModalTabs which
                                // correctly renders INPUT parameters the user needs to review before approving.
                                if (FILE_VIEW_TOOLS.has(tool.name) && !isPending) {
                                    return <FileViewModalContent tool={tool} />;
                                }
                                return <ToolModalTabs tool={tool} hideOutput={hideOutput} />;
                            })()}
                        </Animated.View>
                    </Animated.View>

                    {/* Permission Action Bar — separate floating card below */}
                    {hasActionBar && (
                        <View style={{ position: 'absolute', bottom: insets.bottom + 8, left: 0, right: 0 }}>
                            <PermissionActionBar
                                actions={permissionActions!}
                                llmSummary={permission!.llmSummary}
                                queueCount={queueCount ?? 0}
                                suggestions={permission!.permissionSuggestions}
                                toolName={tool.name}
                            />
                        </View>
                    )}
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
        backgroundColor: 'rgb(0, 0, 0)',
    },
    card: {
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
