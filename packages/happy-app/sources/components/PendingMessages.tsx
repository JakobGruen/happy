import React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { usePendingMessages } from '@/sync/storage';

interface PendingMessagesProps {
    sessionId: string;
}

export const PendingMessages = React.memo(({ sessionId }: PendingMessagesProps) => {
    const pendingMessages = usePendingMessages(sessionId);

    if (pendingMessages.length === 0) return null;

    return (
        <View style={styles.container}>
            {pendingMessages.map((msg) => (
                <Animated.View
                    key={msg.localId}
                    entering={FadeIn.duration(150)}
                    exiting={FadeOut.duration(150)}
                    layout={Layout.springify()}
                    style={styles.bubble}
                >
                    <View style={styles.dot} />
                    <Text style={styles.text} numberOfLines={2}>
                        {msg.text}
                    </Text>
                </Animated.View>
            ))}
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        paddingHorizontal: 16,
        paddingVertical: 4,
        gap: 4,
    },
    bubble: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceRipple,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
        opacity: 0.7,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: theme.colors.textSecondary,
    },
    text: {
        flex: 1,
        fontSize: 14,
        color: theme.colors.typography,
    },
}));
