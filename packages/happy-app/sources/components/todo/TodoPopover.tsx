import * as React from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { t } from '@/text';
import { TodoPopoverItem } from './TodoPopoverItem';

interface TodoItem {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'high' | 'medium' | 'low';
    id: string;
}

interface TodoPopoverProps {
    todos: TodoItem[];
    visible: boolean;
    onDismiss: () => void;
}

export const TodoPopover = React.memo<TodoPopoverProps>(({ todos, visible, onDismiss }) => {
    const { height: screenHeight, width: screenWidth } = useWindowDimensions();

    if (!visible || todos.length === 0) return null;

    const completed = todos.filter(item => item.status === 'completed').length;
    const total = todos.length;
    const maxHeight = screenHeight * 0.5;

    // Popover is rendered inside the pill's absolute container (left: 28% of status bar).
    // We want the popover left-aligned to screen edge (with 16px padding).
    // The pill is ~28% from left edge of the status bar (which has 16px paddingHorizontal).
    // So offset the popover left by: -(28% of statusBarWidth + 16px padding) + 16px screen padding
    const pillOffsetFromScreenLeft = screenWidth * 0.28 + 16; // pill position from screen left
    const popoverLeft = -(pillOffsetFromScreenLeft - 16); // align to 16px from screen left
    const popoverWidth = screenWidth - 32; // full width minus 16px padding each side
    // Arrow should point at center of pill (~20px wide, so ~10px from popover's pill offset)
    const arrowLeft = pillOffsetFromScreenLeft - 16 + 10; // center of pill relative to popover left

    return (
        <>
            {/* Invisible dismiss layer — large offsets to cover full screen from relative parent */}
            <Pressable
                onPress={onDismiss}
                style={{
                    position: 'absolute',
                    top: -screenHeight,
                    left: -1000,
                    right: -1000,
                    bottom: -screenHeight,
                    zIndex: 99,
                }}
            />

            {/* Popover */}
            <Animated.View
                entering={FadeIn.springify().damping(20).stiffness(300)}
                exiting={FadeOut.duration(150)}
                style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: popoverLeft,
                    width: popoverWidth,
                    marginBottom: 6,
                    backgroundColor: '#2a2a2c',
                    borderWidth: 1,
                    borderColor: '#444',
                    borderRadius: 12,
                    paddingVertical: 10,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.5,
                    shadowRadius: 16,
                    elevation: 20,
                    zIndex: 100,
                }}
            >
                {/* Arrow — centered under the pill */}
                <View style={{
                    position: 'absolute',
                    bottom: -6,
                    left: arrowLeft,
                    width: 12,
                    height: 12,
                    backgroundColor: '#2a2a2c',
                    borderRightWidth: 1,
                    borderBottomWidth: 1,
                    borderColor: '#444',
                    transform: [{ rotate: '45deg' }],
                }} />

                {/* Header */}
                <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingBottom: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: 'rgba(255,255,255,0.06)',
                }}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                        {t('session.todoPill.tasks')}
                    </Text>
                    <Text style={{ color: '#666', fontSize: 11 }}>
                        {completed}/{total}
                    </Text>
                </View>

                {/* Scrollable item list */}
                <ScrollView
                    style={{ maxHeight: maxHeight - 40 }}
                    showsVerticalScrollIndicator={false}
                >
                    {todos.map((todo) => (
                        <TodoPopoverItem
                            key={todo.id || todo.content}
                            content={todo.content}
                            status={todo.status}
                        />
                    ))}
                </ScrollView>
            </Animated.View>
        </>
    );
});
