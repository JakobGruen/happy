import React from 'react';
import { View, Text, Pressable, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { SessionInitCard, SessionInitCardOption } from './SessionInitCard';
import { MachinePathSelector } from './MachinePathSelector';
import type { PermissionMode, ModelMode } from './PermissionModeSelector';
import type { Machine } from '@/sync/storageTypes';

interface SessionInitPanelProps {
    // Tab state
    agentType: 'claude' | 'codex' | 'gemini';
    onAgentTypeChange: (agent: 'claude' | 'codex' | 'gemini') => void;

    // Session Type
    sessionType: 'simple' | 'worktree';
    onSessionTypeChange: (type: 'simple' | 'worktree') => void;

    // Model selection
    availableModels: ModelMode[];
    selectedModel: ModelMode | null;
    onModelChange: (model: ModelMode) => void;

    // Permission mode
    availableModes: PermissionMode[];
    selectedMode: PermissionMode | null;
    onModeChange: (mode: PermissionMode) => void;

    // Machine and directory
    machines: Machine[];
    selectedMachineId: string | null;
    selectedPath: string;
    onMachineSelect: (machineId: string) => void;
    onPathChange: (path: string) => void;
    recentPathsForMachine?: string[];

    // Activation
    onActivate: () => void;
    isActivating?: boolean;
    canActivate?: boolean;
}

export const SessionInitPanel = React.memo<SessionInitPanelProps>(({
    agentType,
    onAgentTypeChange,
    sessionType,
    onSessionTypeChange,
    availableModels,
    selectedModel,
    onModelChange,
    availableModes,
    selectedMode,
    onModeChange,
    machines,
    selectedMachineId,
    selectedPath,
    onMachineSelect,
    onPathChange,
    recentPathsForMachine = [],
    onActivate,
    isActivating = false,
    canActivate = true,
}) => {
    const { theme } = useUnistyles();
    const styles = stylesheet;

    // Build options for session type card
    const sessionTypeOptions: SessionInitCardOption[] = [
        {
            id: 'simple',
            label: '🎯 Simple Session',
            description: 'Quick & lightweight - Single directory focus',
            icon: 'pin',
            isSelected: sessionType === 'simple',
        },
        {
            id: 'worktree',
            label: '🌳 Worktree Session',
            description: 'Isolated development - Separate git branch',
            icon: 'git-branch',
            isSelected: sessionType === 'worktree',
        },
    ];

    // Build options for model card with color tier (low/medium/high capability)
    const getModelColorTier = (modelKey: string): 'low' | 'medium' | 'high' => {
        if (modelKey === 'haiku') return 'low';
        if (modelKey === 'sonnet') return 'medium';
        if (modelKey === 'opus') return 'high';
        return 'medium';
    };

    const getModelIcon = (modelKey: string): React.ComponentProps<typeof Ionicons>['name'] => {
        if (modelKey === 'haiku') return 'flash';
        if (modelKey === 'opus') return 'diamond';
        return 'musical-note';
    };

    const modelOptions: SessionInitCardOption[] = availableModels.map((model) => ({
        id: model.key,
        label: model.name,
        description: model.description || '',
        icon: getModelIcon(model.key),
        isSelected: selectedModel?.key === model.key,
        badge: model.key === 'sonnet' ? 'Recommended' : undefined,
        colorTier: getModelColorTier(model.key),
    }));

    // Build options for permission mode card
    const getModeIcon = (modeKey: string): React.ComponentProps<typeof Ionicons>['name'] => {
        if (modeKey === 'default') return 'shield-checkmark-outline';
        if (modeKey === 'acceptEdits') return 'create-outline';
        if (modeKey === 'plan') return 'map-outline';
        if (modeKey === 'bypassPermissions') return 'flash-outline';
        return 'shield-checkmark-outline';
    };

    const modeOptions: SessionInitCardOption[] = availableModes.map((mode) => ({
        id: mode.key,
        label: mode.name,
        description: mode.description || '',
        icon: getModeIcon(mode.key),
        isSelected: selectedMode?.key === mode.key,
    }));

    return (
        <Animated.ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            entering={FadeIn.duration(300)}
        >
            {/* Header */}
            <Animated.View style={styles.headerSection} entering={SlideInDown.duration(400).delay(100)}>
                <Text style={styles.mainTitle}>🚀 Initialize Session</Text>
                <Text style={styles.subtitle}>Configure your coding environment</Text>
            </Animated.View>

            {/* Agent Tabs */}
            <Animated.View style={styles.tabsContainer} entering={SlideInDown.duration(400).delay(150)}>
                <Pressable
                    onPress={() => onAgentTypeChange('claude')}
                    style={({ pressed }) => [
                        styles.tab,
                        agentType === 'claude' && styles.tabActive,
                        pressed && styles.tabPressed,
                    ]}
                >
                    <Ionicons
                        name="radio-button-on"
                        size={16}
                        color={agentType === 'claude' ? '#10B981' : theme.colors.textSecondary}
                        style={{ marginRight: 6 }}
                    />
                    <Text style={[
                        styles.tabText,
                        agentType === 'claude' && styles.tabTextActive,
                    ]}>
                        🤖 Claude
                    </Text>
                </Pressable>

                <Pressable
                    onPress={() => onAgentTypeChange('codex')}
                    style={({ pressed }) => [
                        styles.tab,
                        agentType === 'codex' && styles.tabActive,
                        pressed && styles.tabPressed,
                    ]}
                >
                    <Ionicons
                        name="radio-button-on"
                        size={16}
                        color={agentType === 'codex' ? '#10B981' : theme.colors.textSecondary}
                        style={{ marginRight: 6 }}
                    />
                    <Text style={[
                        styles.tabText,
                        agentType === 'codex' && styles.tabTextActive,
                    ]}>
                        💻 Codex
                    </Text>
                </Pressable>
            </Animated.View>

            {/* Session Type Card */}
            <Animated.View entering={SlideInDown.duration(400).delay(200)}>
                <SessionInitCard
                    title="📍 Session Type"
                    options={sessionTypeOptions}
                    onSelectOption={(id) => onSessionTypeChange(id as 'simple' | 'worktree')}
                />
            </Animated.View>

            {/* Model Card */}
            <Animated.View entering={SlideInDown.duration(400).delay(250)}>
                <SessionInitCard
                    title="🧠 Model Selection"
                    description="Choose the AI model to use"
                    options={modelOptions}
                    onSelectOption={(id) => {
                        const model = availableModels.find((m) => m.key === id);
                        if (model) onModelChange(model);
                    }}
                />
            </Animated.View>

            {/* Permission Mode Card */}
            <Animated.View entering={SlideInDown.duration(400).delay(300)}>
                <SessionInitCard
                    title="🔐 Permission Mode"
                    description="Control how the agent can interact"
                    options={modeOptions}
                    onSelectOption={(id) => {
                        const mode = availableModes.find((m) => m.key === id);
                        if (mode) onModeChange(mode);
                    }}
                />
            </Animated.View>

            {/* Machine & Directory Card */}
            <Animated.View entering={SlideInDown.duration(400).delay(350)}>
                <MachinePathSelector
                    machines={machines}
                    selectedMachineId={selectedMachineId}
                    selectedPath={selectedPath}
                    onMachineSelect={onMachineSelect}
                    onPathChange={onPathChange}
                    recentPaths={recentPathsForMachine}
                />
            </Animated.View>

            {/* Activation Button */}
            <Animated.View entering={SlideInDown.duration(400).delay(400)}>
            <Pressable
                onPress={onActivate}
                disabled={isActivating || !canActivate}
                style={({ pressed }) => [
                    styles.activateButton,
                    (isActivating || !canActivate) && styles.activateButtonDisabled,
                    pressed && !isActivating && styles.activateButtonPressed,
                ]}
            >
                {isActivating ? (
                    <ActivityIndicator
                        size="small"
                        color="#FFFFFF"
                        style={{ marginRight: 8 }}
                    />
                ) : (
                    <Ionicons name="flash" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                )}
                <Text style={styles.activateButtonText}>
                    {isActivating ? 'Activating...' : 'Activate Session'}
                </Text>
            </Pressable>
            </Animated.View>

            {/* Spacing */}
            <View style={{ height: 40 }} />
        </Animated.ScrollView>
    );
});

SessionInitPanel.displayName = 'SessionInitPanel';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    contentContainer: {
        paddingTop: 16,
        paddingBottom: 32,
    },
    headerSection: {
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    mainTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: theme.colors.text,
        ...Typography.default('semiBold'),
        marginBottom: 6,
    },
    subtitle: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        ...Typography.default('regular'),
    },
    tabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 24,
        gap: 12,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: theme.colors.surfaceHighest,
        borderWidth: 1.5,
        borderColor: `${theme.colors.textSecondary}30`,
    },
    tabActive: {
        backgroundColor: '#10B98120',
        borderColor: '#10B981',
    },
    tabPressed: {
        backgroundColor: '#10B98115',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    tabTextActive: {
        color: '#10B981',
        fontWeight: '600',
    },
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

    activateButton: {
        marginHorizontal: 16,
        marginVertical: 16,
        paddingVertical: 14,
        borderRadius: 10,
        backgroundColor: '#F59E0B',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    activateButtonDisabled: {
        opacity: 0.5,
    },
    activateButtonPressed: {
        opacity: 0.8,
    },
    activateButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        ...Typography.default('semiBold'),
    },
}));