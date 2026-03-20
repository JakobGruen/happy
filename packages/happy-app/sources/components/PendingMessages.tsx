import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native-unistyles';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';
import { usePendingMessages } from '@/sync/storage';
import { ImageViewerManager } from '@/components/ImageViewer';

interface PendingMessagesProps {
    sessionId: string;
}

export const PendingMessages = React.memo(({ sessionId }: PendingMessagesProps) => {
    const pendingMessages = usePendingMessages(sessionId);

    if (pendingMessages.length === 0) return null;

    return (
        <View style={styles.container}>
            {pendingMessages.map((msg) => {
                const hasImages = msg.images && msg.images.length > 0;
                const hasText = msg.text && msg.text !== '📷' && msg.text !== '...';
                const imageViewerData = msg.images?.map(img => ({
                    mediaType: img.mediaType,
                    data: img.data,
                }));

                return (
                    <Animated.View
                        key={msg.localId}
                        entering={FadeIn.duration(150)}
                        exiting={FadeOut.duration(150)}
                        layout={Layout.springify()}
                        style={styles.bubble}
                    >
                        <View style={styles.dot} />
                        <View style={styles.content}>
                            {hasImages && (
                                <View style={styles.imageRow}>
                                    {msg.images!.map((img, i) => (
                                        <Pressable
                                            key={i}
                                            onPress={() => imageViewerData && ImageViewerManager.open(imageViewerData, i)}
                                        >
                                            <Image
                                                source={{ uri: `data:${img.mediaType};base64,${img.data}` }}
                                                style={{ width: 60, height: 45, borderRadius: 6 }}
                                                contentFit="cover"
                                            />
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                            {hasText && (
                                <Text style={styles.text} numberOfLines={2}>
                                    {msg.text}
                                </Text>
                            )}
                            {!hasText && !hasImages && (
                                <Text style={styles.text} numberOfLines={1}>
                                    {msg.text}
                                </Text>
                            )}
                        </View>
                    </Animated.View>
                );
            })}
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
    content: {
        flex: 1,
        gap: 6,
    },
    imageRow: {
        flexDirection: 'row',
        gap: 4,
    },
    text: {
        fontSize: 14,
        color: theme.colors.text,
    },
}));
