import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

interface TodoPopoverItemProps {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
}

export const TodoPopoverItem = React.memo<TodoPopoverItemProps>(({ content, status }) => {
    const [expanded, setExpanded] = React.useState(false);

    const isCompleted = status === 'completed';
    const isActive = status === 'in_progress';

    return (
        <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(150)}
            layout={LinearTransition.duration(200)}
        >
            <Pressable
                onPress={() => setExpanded(e => !e)}
                style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 8,
                    paddingVertical: 5,
                    paddingHorizontal: 12,
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isCompleted }}
            >
                {/* Checkbox */}
                <View style={{
                    width: 15,
                    height: 15,
                    borderRadius: 4,
                    borderWidth: 1.5,
                    borderColor: isCompleted ? '#007AFF' : isActive ? '#007AFF' : '#555',
                    backgroundColor: isCompleted ? 'rgba(0,122,255,0.2)' : isActive ? 'rgba(0,122,255,0.08)' : 'transparent',
                    marginTop: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {isCompleted && (
                        <Text style={{ fontSize: 9, color: '#007AFF' }}>✓</Text>
                    )}
                    {isActive && (
                        <View style={{ width: 5, height: 5, borderRadius: 2, backgroundColor: '#007AFF' }} />
                    )}
                </View>

                {/* Text */}
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <Text
                        style={{
                            fontSize: 11,
                            lineHeight: 15,
                            color: isCompleted ? '#666' : isActive ? '#fff' : '#ccc',
                            textDecorationLine: isCompleted ? 'line-through' : 'none',
                            flex: 1,
                        }}
                        numberOfLines={expanded ? undefined : 2}
                    >
                        {content}
                    </Text>
                    {isActive && (
                        <View style={{
                            backgroundColor: 'rgba(0,122,255,0.12)',
                            paddingHorizontal: 4,
                            paddingVertical: 1,
                            borderRadius: 3,
                            marginLeft: 4,
                            marginTop: 1,
                        }}>
                            <Text style={{ fontSize: 8, color: '#007AFF' }}>
                                active
                            </Text>
                        </View>
                    )}
                </View>
            </Pressable>
        </Animated.View>
    );
});
