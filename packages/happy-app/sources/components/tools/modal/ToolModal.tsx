import React from 'react';
import { View, Modal, Pressable, SafeAreaView, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall } from '@/sync/typesMessage';
import { ToolModalTabs } from './ToolModalTabs';
import { Ionicons } from '@expo/vector-icons';
import { Metadata } from '@/sync/storageTypes';

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

        return (
            <Modal
                visible={visible}
                animationType="slide"
                transparent={true}
                onRequestClose={onClose}
            >
                <Pressable
                    style={styles.backdrop}
                    onPress={onClose}
                />
                <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.surfaceHigh }]}>
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
            </Modal>
        );
    }
);

const styles = StyleSheet.create((theme) => ({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    container: {
        flex: 1,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        overflow: 'hidden',
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
