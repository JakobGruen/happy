import * as React from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
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
    const { height: screenHeight } = useWindowDimensions();

    if (!visible || todos.length === 0) return null;

    const completed = todos.filter(item => item.status === 'completed').length;
    const total = todos.length;
    const maxHeight = screenHeight * 0.5;

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
                    left: 12,
                    width: 240,
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
                {/* Arrow */}
                <View style={{
                    position: 'absolute',
                    bottom: -6,
                    left: 60,
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
                        Tasks
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
