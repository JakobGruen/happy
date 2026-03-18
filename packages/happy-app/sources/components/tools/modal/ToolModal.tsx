import React, { useEffect, useRef, useMemo } from 'react';
import { Modal, Pressable, useWindowDimensions, Platform, Keyboard } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS,
    cancelAnimation,
    interpolate,
    Extrapolation,
    runOnUI,
} from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
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
const DIFF_HEIGHT_RATIO = 0.85;
const DISMISS_VELOCITY = 1200;
const SPRING_CONFIG = { damping: 26, stiffness: 200, mass: 0.8 };
const CLOSE_SPRING_CONFIG = { damping: 30, stiffness: 200, mass: 0.8, overshootClamping: true };

const INPUT_BOX_TOTAL_HEIGHT = 44;
const PERMISSION_CARD_HEIGHT_DEFAULT = 110; // Fallback when no pre-measurement available
const GAP_BETWEEN_CARDS = 8;

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Helper for input-box-aligned positioning (called from worklets)
function getInputBoxAlignment(screenWidth: number) {
    'worklet';
    const isDesktop = screenWidth > 700;
    const containerPadding = isDesktop ? 16 : 8;
    const contentWidth = Math.min(screenWidth, layout.maxWidth);
    const centeredOffset = Math.max((screenWidth - contentWidth) / 2, 0);
    return {
        left: centeredOffset + containerPadding,
        width: contentWidth - containerPadding * 2,
    };
}

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
    // Split source rects: header rect + optional permBar rect (from ToolView)
    sourceRects?: { header: Rect; permBar: Rect | null } | null;
    // Legacy single sourceRect (from PermissionBanner)
    sourceRect?: Rect | null;
    bubbleRef?: AnimatedRef<Animated.View> | null;
    permissionBarHeight?: number;
}

export const ToolModal = React.memo<ToolModalProps>(
    ({ visible, tool, metadata, messages, onClose, hideOutput, sessionId, permission, permissionActions, queueCount, sourceRects, sourceRect, bubbleRef, permissionBarHeight: permBarHeightProp }) => {
        const { theme } = useUnistyles();
        const { width: screenWidth, height: screenHeight } = useWindowDimensions();
        const insets = useSafeAreaInsets();

        // Gesture state for drag-to-dismiss
        const translateY = useSharedValue(0);
        const modalHeight = useSharedValue(MODAL_HEIGHT_RATIO * screenHeight);

        // Expand/collapse animation progress (0 = at bubble, 1 = fully expanded)
        const progress = useSharedValue(0);

        // Permission card height — pre-measured from inline bar, fallback to constant
        const measuredPermHeight = useSharedValue(permBarHeightProp || PERMISSION_CARD_HEIGHT_DEFAULT);

        // Detail card (top half) source position
        const headerX = useSharedValue(0);
        const headerY = useSharedValue(0);
        const headerW = useSharedValue(0);
        const headerH = useSharedValue(0);

        // Permission card (bottom half) source position
        const permBarY = useSharedValue(0);
        const permBarH = useSharedValue(0);

        // Keyboard height — shrinks card when keyboard is visible (for AskUserQuestion inputs)
        const keyboardHeight = useSharedValue(0);
        useEffect(() => {
            const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
            const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
            const showSub = Keyboard.addListener(showEvent, (e) => {
                keyboardHeight.value = e.endCoordinates.height;
            });
            const hideSub = Keyboard.addListener(hideEvent, () => {
                keyboardHeight.value = 0;
            });
            return () => { showSub.remove(); hideSub.remove(); };
        }, []);

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

        const hasActionBar = !!(permission && permissionActions);

        // Sync source rects into shared values
        useEffect(() => {
            if (sourceRects) {
                // Split rects from ToolView
                headerX.value = sourceRects.header.x;
                headerY.value = sourceRects.header.y;
                headerW.value = sourceRects.header.width;
                headerH.value = sourceRects.header.height;
                if (sourceRects.permBar) {
                    permBarY.value = sourceRects.permBar.y;
                    permBarH.value = sourceRects.permBar.height;
                }
            } else if (sourceRect) {
                // Legacy single rect (PermissionBanner path) — use full rect for header
                headerX.value = sourceRect.x;
                headerY.value = sourceRect.y;
                headerW.value = sourceRect.width;
                headerH.value = sourceRect.height;
                // No permBar source — it will use fallback animation
            }
        }, [sourceRects, sourceRect]);

        // Sync pre-measured permission bar height
        useEffect(() => {
            if (permBarHeightProp && permBarHeightProp > 0) {
                measuredPermHeight.value = permBarHeightProp;
            }
        }, [permBarHeightProp]);

        // Close when visible prop becomes false (e.g., permission resolved externally)
        useEffect(() => {
            if (!visible && internalVisible) {
                startCloseAnimation();
            }
        }, [visible]);

        // Open: set internal visible immediately, animate in
        useEffect(() => {
            if (visible) {
                isClosingRef.current = false;
                cancelAnimation(translateY);
                cancelAnimation(modalHeight);
                translateY.value = 0;
                const isDiffTool = DIFF_TOOLS.has(tool.name);
                if (hasActionBar) {
                    const pcHeight = measuredPermHeight.value;
                    const permCardBottom = INPUT_BOX_TOTAL_HEIGHT + insets.bottom;
                    const permCardTop = screenHeight - permCardBottom - pcHeight;
                    const detailCardTop = screenHeight * 0.25;
                    const availableHeight = permCardTop - detailCardTop - GAP_BETWEEN_CARDS;
                    modalHeight.value = Math.max(availableHeight, screenHeight * 0.3);
                } else {
                    modalHeight.value = (isDiffTool ? DIFF_HEIGHT_RATIO : MODAL_HEIGHT_RATIO) * screenHeight;
                }
                setInternalVisible(true);
            }
        }, [visible, screenHeight, tool.name, hasActionBar, insets.bottom]);

        // Animate progress when internalVisible changes
        useEffect(() => {
            if (internalVisible) {
                cancelAnimation(progress);
                progress.value = 0;
                progress.value = withSpring(1, SPRING_CONFIG);
            }
        }, [internalVisible]);

        // Close with animation — re-measures bubble position, splits mathematically
        const startCloseAnimation = React.useCallback(() => {
            if (isClosingRef.current) return;
            isClosingRef.current = true;

            const doClose = () => {
                'worklet';
                progress.value = withSpring(0, CLOSE_SPRING_CONFIG, (finished) => {
                    if (finished) runOnJS(actualClose)();
                });
            };

            // Re-measure bubble using measureInWindow (same coord system as open path)
            // measure() uses pageX/pageY which differs from measureInWindow on web
            if (bubbleRef?.current) {
                bubbleRef.current.measureInWindow((x, y, width, height) => {
                    headerX.value = x;
                    headerY.value = y;
                    headerW.value = width;
                    // Split: header height = total - permBar height
                    const pH = measuredPermHeight.value;
                    const hH = hasActionBar ? Math.max(height - pH, 40) : height;
                    headerH.value = hH;
                    if (hasActionBar) {
                        permBarY.value = y + hH;
                        permBarH.value = pH;
                    }
                    runOnUI(doClose)();
                });
            } else {
                runOnUI(doClose)();
            }
        }, [actualClose, bubbleRef]);

        // Shared dismiss gesture factory — swipe up or down on either card dismisses both
        const makeDismissGesture = () => Gesture.Pan()
            .onUpdate((e) => {
                'worklet';
                if (progress.value < 0.95) return;
                translateY.value = e.translationY;
            })
            .onEnd((e) => {
                'worklet';
                if (progress.value < 0.95) return;
                if (Math.abs(e.translationY) > 80 || Math.abs(e.velocityY) > DISMISS_VELOCITY) {
                    runOnJS(startCloseAnimation)();
                } else {
                    translateY.value = withSpring(0);
                }
            });

        const dismissGesture = useMemo(() => makeDismissGesture(), [startCloseAnimation]);
        const permissionDismissGesture = useMemo(() => makeDismissGesture(), [startCloseAnimation]);

        // Permission card (bottom half) — slides from inline position to bottom of screen
        // Uses `bottom` positioning at rest for true auto-sizing (no fixed height needed).
        // During animation, uses `top` with estimated height for smooth interpolation.
        const permissionCardStyle = useAnimatedStyle(() => {
            const { left: finalX, width: finalWidth } = getInputBoxAlignment(screenWidth);
            const kb = keyboardHeight.value;
            // When keyboard is visible, position above keyboard instead of above input box
            const finalBottom = kb > 0 ? kb + 8 : INPUT_BOX_TOTAL_HEIGHT + insets.bottom;

            const p = progress.value;
            const hasSource = permBarH.value > 0;
            const atRest = p > 0.99;

            if (atRest) {
                // Final resting state: bottom-anchored, auto-sized to content
                return {
                    position: 'absolute' as const,
                    left: finalX,
                    bottom: finalBottom,
                    width: finalWidth,
                    borderRadius: 12,
                    opacity: 1,
                    transform: [{ translateY: translateY.value }],
                };
            }

            // Convert bottom to top for animation interpolation
            const pcH = measuredPermHeight.value;
            const finalY = screenHeight - finalBottom - pcH;

            if (!hasSource) {
                // No source rect (banner path) — slide up from bottom
                return {
                    position: 'absolute' as const,
                    left: finalX,
                    top: interpolate(p, [0, 1], [screenHeight, finalY]) + translateY.value,
                    width: finalWidth,
                    borderRadius: 12,
                    opacity: interpolate(p, [0.1, 0.4], [0, 1], Extrapolation.CLAMP),
                };
            }

            // Split animation: starts at its inline position, slides to bottom
            return {
                position: 'absolute' as const,
                left: interpolate(p, [0, 1], [headerX.value, finalX]),
                top: interpolate(p, [0, 1], [permBarY.value, finalY]) + translateY.value,
                width: interpolate(p, [0, 1], [headerW.value, finalWidth]),
                // Top corners round as it separates from header
                borderRadius: interpolate(p, [0, 1], [0, 12]),
            };
        });

        // Detail card (top half) — expands from header-only height to full modal
        // When keyboard is visible, card shrinks to fit above it
        const expandStyle = useAnimatedStyle(() => {
            const { left: finalX, width: finalWidth } = getInputBoxAlignment(screenWidth);
            const kb = keyboardHeight.value;
            const bottomMargin = hasActionBar
                ? (INPUT_BOX_TOTAL_HEIGHT + insets.bottom) + measuredPermHeight.value + GAP_BETWEEN_CARDS
                : INPUT_BOX_TOTAL_HEIGHT + insets.bottom;
            // When keyboard is visible, bottom margin is keyboard height (replaces insets/input box)
            const effectiveBottomMargin = kb > 0 ? kb + 8 : bottomMargin;
            const maxHeight = screenHeight - effectiveBottomMargin - insets.top - 8;
            const finalHeight = kb > 0
                ? Math.min(modalHeight.value, maxHeight)
                : modalHeight.value;
            const finalY = screenHeight - finalHeight - effectiveBottomMargin;

            const hasTarget = headerW.value > 0;
            if (!hasTarget) {
                // Fallback: slide up from bottom
                const fallbackY = interpolate(progress.value, [0, 1], [screenHeight, finalY]);
                return {
                    position: 'absolute' as const,
                    left: finalX,
                    top: fallbackY + translateY.value,
                    width: finalWidth,
                    height: finalHeight,
                    borderRadius: 12,
                };
            }

            const p = progress.value;
            // Start from HEADER height only (not full bubble) — the "tear apart" effect
            return {
                position: 'absolute' as const,
                left: interpolate(p, [0, 1], [headerX.value, finalX]),
                top: interpolate(p, [0, 1], [headerY.value, finalY]) + translateY.value,
                width: interpolate(p, [0, 1], [headerW.value, finalWidth]),
                height: interpolate(p, [0, 1], [headerH.value, finalHeight]),
                borderRadius: interpolate(p, [0, 1], [8, 12]),
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
                onRequestClose={startCloseAnimation}
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    {/* Backdrop overlay — animated opacity */}
                    <Animated.View style={[styles.backdrop, backdropStyle]}>
                        <Pressable style={{ flex: 1 }} onPress={startCloseAnimation} />
                    </Animated.View>

                    {/* Detail card (top half) — expands from header */}
                    <Animated.View
                        testID="tool-modal-card"
                        style={[
                            expandStyle,
                            styles.card,
                            { backgroundColor: theme.colors.surfaceHigh },
                            tool.permission?.status === 'pending' && { borderWidth: 1.5, borderColor: theme.colors.box.warning.border },
                        ]}
                    >
                        {/* Header — always visible, matches bubble */}
                        <GestureDetector gesture={dismissGesture}>
                            <Animated.View>
                                <ToolBubbleHeader
                                    tool={tool}
                                    metadata={metadata}
                                    messages={messages}
                                    expanded={false}
                                />
                            </Animated.View>
                        </GestureDetector>

                        {/* Close button overlay */}
                        <Pressable onPress={startCloseAnimation} hitSlop={8} style={[styles.closeButton, { backgroundColor: theme.colors.surfaceRipple }]}>
                            <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
                        </Pressable>

                        {/* Content — fades in during expansion */}
                        <Animated.View style={[{ flex: 1 }, contentOpacity]}>
                            {(() => {
                                const isPending = tool.permission?.status === 'pending';

                                if (isPending && tool.name === 'AskUserQuestion' && permission) {
                                    return <QuestionSheetContent permission={permission} sessionId={sessionId ?? ''} />;
                                }
                                if (isPending && (tool.name === 'ExitPlanMode' || tool.name === 'exit_plan_mode') && permission) {
                                    return <PlanSheetContent permission={permission} />;
                                }

                                if (AGENT_TOOLS.has(tool.name)) {
                                    return <AgentModalContent tool={tool} metadata={metadata} messages={messages || []} />;
                                }
                                if (DIFF_TOOLS.has(tool.name)) {
                                    return <DiffModalContent tool={tool} />;
                                }
                                if (FILE_VIEW_TOOLS.has(tool.name) && !isPending) {
                                    return <FileViewModalContent tool={tool} />;
                                }
                                return <ToolModalTabs tool={tool} hideOutput={hideOutput} />;
                            })()}
                        </Animated.View>
                    </Animated.View>

                    {/* Permission card (bottom half) — slides from inline position */}
                    {hasActionBar && (
                        <GestureDetector gesture={permissionDismissGesture}>
                            <Animated.View
                                onLayout={(e) => { measuredPermHeight.value = e.nativeEvent.layout.height; }}
                                style={[styles.permissionCard, permissionCardStyle, { backgroundColor: theme.colors.surfaceHigh }, { borderWidth: 1.5, borderColor: theme.colors.box.warning.border }]}
                            >
                                <PermissionActionBar
                                    inline={true}
                                    containerStyle={{ borderTopWidth: 0 }}
                                    actions={permissionActions!}
                                    queueCount={queueCount ?? 0}
                                    suggestions={permission!.permissionSuggestions}
                                    toolName={tool.name}
                                />
                            </Animated.View>
                        </GestureDetector>
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
    permissionCard: {
        overflow: 'hidden',
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 6,
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
