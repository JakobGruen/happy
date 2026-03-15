import React, { useEffect, useRef, useMemo } from 'react';
import { View, Modal, Pressable, useWindowDimensions } from 'react-native';
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
import { ToolBubbleHeader } from './ToolBubbleHeader';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Metadata } from '@/sync/storageTypes';
import { CurrentSessionPermissionItem } from '@/hooks/useCurrentSessionPermissions';
import { UsePermissionActionsResult } from '@/hooks/usePermissionActions';
import { PermissionActionBar } from './PermissionActionBar';
import { QuestionSheetContent } from '../QuestionSheetContent';
import { PlanSheetContent } from '../PlanSheetContent';
import { layout } from '@/components/layout';

const DIFF_TOOLS = new Set(['Edit', 'MultiEdit']);
const FILE_VIEW_TOOLS = new Set(['Read', 'Write']);
const AGENT_TOOLS = new Set(['Task', 'Agent']);

const MODAL_HEIGHT_RATIO = 0.75;
const DISMISS_VELOCITY = 1200;  // px/s — only checked at release moment, requires active fling
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };

const ACTION_BAR_ESTIMATED_HEIGHT = 140;
const INPUT_BOX_HEIGHT = 56;

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

        // Gesture state for drag-to-dismiss
        const translateY = useSharedValue(0);
        const modalHeight = useSharedValue(MODAL_HEIGHT_RATIO * screenHeight);

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
                modalHeight.value = MODAL_HEIGHT_RATIO * screenHeight;
                setInternalVisible(true);
            }
        }, [visible, screenHeight]);

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

        // Pan gesture for swipe-to-dismiss on header
        const dismissGesture = useMemo(() => Gesture.Pan()
            .onUpdate((e) => {
                if (progress.value < 0.95) return;
                if (e.translationY > 0) {
                    translateY.value = e.translationY;
                }
            })
            .onEnd((e) => {
                if (progress.value < 0.95) return;
                if (e.translationY > 100 || e.velocityY > DISMISS_VELOCITY) {
                    progress.value = withSpring(0, SPRING_CONFIG, (finished) => {
                        if (finished) runOnJS(actualClose)();
                    });
                } else {
                    translateY.value = withSpring(0);
                }
            }), [actualClose]);

        const hasActionBar = !!(permission && permissionActions);

        // Expand-from-bubble animated style
        const expandStyle = useAnimatedStyle(() => {
            // Align modal edges with input box (AgentInput container padding)
            const isDesktop = screenWidth > 700;
            const containerPadding = isDesktop ? 16 : 8;
            const contentWidth = Math.min(screenWidth, layout.maxWidth);
            const centeredOffset = Math.max((screenWidth - contentWidth) / 2, 0);
            const finalX = centeredOffset + containerPadding;
            const finalWidth = contentWidth - containerPadding * 2;
            const finalHeight = modalHeight.value;
            const bottomMargin = hasActionBar ? ACTION_BAR_ESTIMATED_HEIGHT : INPUT_BOX_HEIGHT + insets.bottom;
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
                        {/* Header — always visible, matches bubble */}
                        <GestureDetector gesture={dismissGesture}>
                            <Animated.View>
                                <ToolBubbleHeader
                                    tool={tool}
                                    metadata={metadata}
                                    messages={messages}
                                    expanded={true}
                                />
                            </Animated.View>
                        </GestureDetector>

                        {/* Close button overlay */}
                        <Pressable onPress={handleClose} hitSlop={8} style={[styles.closeButton, { backgroundColor: theme.colors.surfaceRipple }]}>
                            <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
                        </Pressable>

                        {/* Content — fades in during expansion */}
                        <Animated.View style={[{ flex: 1 }, contentOpacity]}>
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
    closeButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
}));
