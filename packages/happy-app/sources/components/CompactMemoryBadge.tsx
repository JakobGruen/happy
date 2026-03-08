import React from 'react';
import { View, Text } from 'react-native';
import { useMachine } from '@/sync/storage';
import { StyleSheet } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceHighest,
        paddingHorizontal: 6,
        height: 16,
        borderRadius: 4,
        gap: 2,
    },
    text: {
        fontSize: 10,
        fontWeight: '500',
        color: theme.colors.textSecondary,
    },
}));

interface CompactMemoryBadgeProps {
    sessionId: string;
    machineId?: string;
}

export function CompactMemoryBadge({ sessionId, machineId }: CompactMemoryBadgeProps) {
    const styles = stylesheet;
    const machine = useMachine(machineId ?? '');

    const memStats = machine?.daemonState?.memoryStats;
    if (!machineId || !memStats) return null;

    const sessionMem = memStats.sessions?.find(
        (s: any) => s.sessionId === sessionId
    );
    if (!sessionMem || sessionMem.rssBytes == null) return null;

    const mb = Math.round(sessionMem.rssBytes / (1024 * 1024));

    return (
        <View style={styles.container}>
            <Ionicons
                name="hardware-chip-outline"
                size={10}
                color={styles.text.color}
            />
            <Text style={styles.text}>{mb} MB</Text>
        </View>
    );
}
