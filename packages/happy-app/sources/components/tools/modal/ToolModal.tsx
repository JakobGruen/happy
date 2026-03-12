import React, { useEffect, useRef, useMemo } from 'react';
import { View, Modal, Pressable, SafeAreaView, Text, useWindowDimensions } from 'react-native';
import { StyleSheet as RNStyleSheet } from 'react-native';
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
import { ToolCall } from '@/sync/typesMessage';
import { ToolModalTabs } from './ToolModalTabs';
import { Ionicons } from '@expo/vector-icons';
import { Metadata } from '@/sync/storageTypes';
import { useLocalSettingMutable } from '@/sync/storage';

const DEFAULT_HEIGHT_RATIO = 0.5;
const MIN_HEIGHT_RATIO = 0.25;
const MAX_HEIGHT_RATIO = 0.93;
const DISMISS_VELOCITY = 1200;  // px/s — only checked at release moment, requires active fling
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };

interface ToolModalProps {
    visible: boolean;
    tool: ToolCall;
    metadata: Metadata | null;
    onClose: () => void;
    hideOutput?: boolean;
}

export const ToolModal = React.memo<ToolModalProps>(
    ({ visible, tool, metadata, onClose, hideOutput }) => {
        const { theme } = useUnistyles();
        const { height: screenHeight } = useWindowDimensions();

        // Height persistence (per-tool)
        const [toolModalHeights, setToolModalHeights] = useLocalSettingMutable('toolModalHeights');
        const savedHeightRatio = toolModalHeights?.[tool.name];
        const initialHeight = (savedHeightRatio ?? DEFAULT_HEIGHT_RATIO) * screenHeight;
        
        const setSavedHeightRatio = (ratio: number) => {
            setToolModalHeights({ ...toolModalHeights, [tool.name]: ratio });
        };

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
                modalHeight.value = (savedHeightRatio ?? DEFAULT_HEIGHT_RATIO) * screenHeight;
            }
        }, [visible, screenHeight, savedHeightRatio, tool.name]);

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
                    runOnJS(setSavedHeightRatio)(finalRatio);
                }
            }), [screenHeight]);

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
                        
                        {/* Card — positioned at bottom by parent's flex-end */}
                        <Animated.View
                            entering={SlideInDown.springify().damping(20).stiffness(200)}
                            style={animatedStyle}
                        >
                            <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.surfaceHigh }]}>
                                {/* Drag Handle wrapped in GestureDetector */}
                                <GestureDetector gesture={panGesture}>
                                    <View style={styles.dragHandleArea}>
                                        <View style={[styles.dragHandle, { backgroundColor: theme.colors.surfaceRipple }]} />
                                    </View>
                                </GestureDetector>
                                
                                {/* Modal Header */}
                                <View style={[styles.header, { borderBottomColor: theme.colors.surfaceRipple }]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.toolName}>{tool.name}</Text>
                                    </View>
                                    <Pressable onPress={onClose} hitSlop={8}>
                                        <Ionicons name="close" size={24} color={theme.colors.text} />
                                    </Pressable>
                                </View>

                                {/* Tabs */}
                                <ToolModalTabs tool={tool} hideOutput={hideOutput} />
                            </SafeAreaView>
                        </Animated.View>
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
    container: {
        flex: 1,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: 'hidden',
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
}));
