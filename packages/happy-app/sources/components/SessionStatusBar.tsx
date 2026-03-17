// SessionStatusBar.tsx
import * as React from 'react';
import { View, Text, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';

export type SessionViewMode = 'chat' | 'log';

interface SessionStatusBarProps {
    isConnected: boolean;
    activeView: SessionViewMode;
    onViewChange: (view: SessionViewMode) => void;
    modelName: string | null;
    modeName: string | null;
}

export const SessionStatusBar = React.memo(function SessionStatusBar({
    isConnected,
    activeView,
    onViewChange,
    modelName,
    modeName,
}: SessionStatusBarProps) {
    const { theme } = useUnistyles();

    return (
        <View style={[styles.container, { borderTopColor: theme.colors.divider }]}>
            {/* Left: status */}
            <View style={styles.leftSection}>
                <View style={[
                    styles.statusDot,
                    { backgroundColor: isConnected ? theme.colors.status.connected : theme.colors.status.disconnected },
                ]} />
                <Text style={[styles.statusLabel, {
                    color: isConnected ? theme.colors.status.connected : theme.colors.textSecondary,
                }]}>
                    {isConnected ? 'online' : 'offline'}
                </Text>
            </View>

            {/* Center: toggle pill */}
            <View style={[styles.togglePill, { backgroundColor: theme.colors.surfaceHighest }]}>
                <Pressable
                    style={[
                        styles.toggleBtn,
                        activeView === 'chat' && { backgroundColor: theme.colors.surfacePressed },
                    ]}
                    onPress={() => onViewChange('chat')}
                >
                    <Text style={[
                        styles.toggleText,
                        { color: activeView === 'chat' ? theme.colors.text : theme.colors.textSecondary },
                    ]}>
                        Chat
                    </Text>
                </Pressable>
                <Pressable
                    style={[
                        styles.toggleBtn,
                        activeView === 'log' && { backgroundColor: theme.colors.surfacePressed },
                    ]}
                    onPress={() => onViewChange('log')}
                >
                    <Text style={[
                        styles.toggleText,
                        { color: activeView === 'log' ? theme.colors.text : theme.colors.textSecondary },
                    ]}>
                        Log
                    </Text>
                </Pressable>
            </View>

            {/* Right: model info */}
            <View style={styles.rightSection}>
                {modeName && (
                    <Text style={[styles.modeText, { color: theme.colors.textSecondary }]}>
                        {modeName}
                    </Text>
                )}
                {modelName && (
                    <Text style={[styles.modelText, { color: theme.colors.status.connected }]}>
                        {modelName}
                    </Text>
                )}
            </View>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 16,
        gap: 8,
        borderTopWidth: 1,
    },
    leftSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statusDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
    },
    statusLabel: {
        fontSize: 12,
        ...Typography.default(),
    },
    togglePill: {
        flexDirection: 'row',
        borderRadius: 8,
        padding: 2,
        gap: 1,
        marginHorizontal: 'auto',
    },
    toggleBtn: {
        paddingVertical: 3,
        paddingHorizontal: 14,
        borderRadius: 6,
    },
    toggleText: {
        fontSize: 12,
        fontWeight: '500',
        ...Typography.default('semiBold'),
    },
    rightSection: {
        alignItems: 'flex-end',
        flexShrink: 0,
    },
    modeText: {
        fontSize: 11,
        ...Typography.default(),
    },
    modelText: {
        fontSize: 12,
        fontWeight: '500',
        ...Typography.default('semiBold'),
    },
}));
