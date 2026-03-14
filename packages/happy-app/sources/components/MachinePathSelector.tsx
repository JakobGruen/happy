import React from 'react';
import { View, Text, Pressable, TextInput, ScrollView, Platform } from 'react-native';
import { StyleSheet, useUnistyles, mq } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import type { Machine } from '@/sync/storageTypes';

interface MachinePathSelectorProps {
    machines: Machine[];
    selectedMachineId: string | null;
    selectedPath: string;
    onMachineSelect: (machineId: string) => void;
    onPathChange: (path: string) => void;
    recentPaths?: string[]; // Suggestions for quick paths on the selected machine
}

export const MachinePathSelector = React.memo<MachinePathSelectorProps>(({
    machines,
    selectedMachineId,
    selectedPath,
    onMachineSelect,
    onPathChange,
    recentPaths = [],
}) => {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const selectedMachine = machines.find(m => m.id === selectedMachineId);

    return (
        <View style={styles.cardContainer}>
            <View style={styles.header}>
                <Text style={styles.title}>🖥️ Machine & Directory</Text>
            </View>

            {/* Machine Tabs */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.tabsContainer}
                contentContainerStyle={styles.tabsContentContainer}
            >
                {machines.map((machine) => (
                    <Pressable
                        key={machine.id}
                        onPress={() => onMachineSelect(machine.id)}
                        style={({ pressed }) => [
                            styles.machineTab,
                            selectedMachineId === machine.id && styles.machineTabActive,
                            pressed && styles.machineTabPressed,
                        ]}
                    >
                        <Ionicons
                            name="desktop-outline"
                            size={14}
                            color={selectedMachineId === machine.id ? '#10B981' : theme.colors.textSecondary}
                            style={styles.machineTabIcon}
                        />
                        <Text
                            style={[
                                styles.machineTabLabel,
                                selectedMachineId === machine.id && styles.machineTabLabelActive,
                            ]}
                            numberOfLines={1}
                        >
                            {machine.metadata?.displayName || machine.metadata?.host || machine.id}
                        </Text>
                    </Pressable>
                ))}
            </ScrollView>

            {/* Path Input Section */}
            {selectedMachine && (
                <View style={styles.pathSection}>
                    <View style={styles.pathInputContainer}>
                        <Ionicons
                            name="folder-outline"
                            size={16}
                            color={theme.colors.textSecondary}
                            style={styles.pathInputIcon}
                        />
                        <TextInput
                            style={styles.pathInput}
                            placeholder="Enter path..."
                            placeholderTextColor={theme.colors.textSecondary}
                            value={selectedPath}
                            onChangeText={onPathChange}
                            editable
                        />
                    </View>

                    {/* Quick Path Suggestions */}
                    {recentPaths.length > 0 && (
                        <View style={styles.suggestionsContainer}>
                            <Text style={styles.suggestionsLabel}>Quick options</Text>
                            <View style={styles.suggestionsGrid}>
                                {recentPaths.map((path, index) => (
                                    <Pressable
                                        key={`${path}-${index}`}
                                        onPress={() => onPathChange(path)}
                                        style={({ pressed }) => [
                                            styles.suggestionChip,
                                            pressed && styles.suggestionChipPressed,
                                        ]}
                                    >
                                        <Text
                                            style={styles.suggestionChipText}
                                            numberOfLines={1}
                                            ellipsizeMode="head"
                                        >
                                            {path}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
});

MachinePathSelector.displayName = 'MachinePathSelector';

const stylesheet = StyleSheet.create((theme) => (
    {
        cardContainer: {
            backgroundColor: theme.colors.surface,
            borderRadius: Platform.select({ ios: 10, default: 16 }),
            marginHorizontal: 16,
            marginVertical: 8,
            overflow: 'hidden',
            shadowColor: theme.colors.shadow.color,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: theme.colors.shadow.opacity,
            shadowRadius: 4,
            elevation: 2,
            borderWidth: 1,
            borderColor: `${theme.colors.divider}50`,
        },
        header: {
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.divider,
        },
        title: {
            fontSize: 16,
            fontWeight: '600',
            color: theme.colors.text,
            ...Typography.default('semiBold'),
        },
        tabsContainer: {
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.divider,
        },
        tabsContentContainer: {
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 8,
        },
        machineTab: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: theme.colors.surfaceHighest,
            borderWidth: 1.5,
            borderColor: `${theme.colors.textSecondary}30`,
        },
        machineTabActive: {
            backgroundColor: '#10B98120',
            borderColor: '#10B981',
        },
        machineTabPressed: {
            backgroundColor: '#10B98115',
        },
        machineTabIcon: {
            marginRight: 6,
        },
        machineTabLabel: {
            fontSize: 13,
            fontWeight: '500',
            color: theme.colors.textSecondary,
            maxWidth: 100,
        },
        machineTabLabelActive: {
            color: '#10B981',
            fontWeight: '600',
        },
        pathSection: {
            paddingHorizontal: 16,
            paddingVertical: 12,
        },
        pathInputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.colors.input.background,
            borderRadius: 8,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: theme.colors.divider,
        },
        pathInputIcon: {
            marginRight: 8,
        },
        pathInput: {
            flex: 1,
            paddingVertical: 10,
            fontSize: 14,
            color: theme.colors.text,
            ...Typography.default(),
        },
        suggestionsContainer: {
            marginTop: 12,
        },
        suggestionsLabel: {
            fontSize: 12,
            fontWeight: '600',
            color: theme.colors.textSecondary,
            marginBottom: 8,
        },
        suggestionsGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
        },
        suggestionChip: {
            backgroundColor: theme.colors.surfaceHighest,
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderWidth: 1,
            borderColor: theme.colors.divider,
            flexShrink: 1,
            maxWidth: {
                [mq.only.width(0, 480)]: '100%',
                [mq.only.width(480)]: '48%',
            },
        },
        suggestionChipPressed: {
            backgroundColor: theme.colors.button.primary.background,
            opacity: 0.8,
        },
        suggestionChipText: {
            fontSize: 12,
            color: theme.colors.text,
            fontWeight: '500',
        },
    }
));
