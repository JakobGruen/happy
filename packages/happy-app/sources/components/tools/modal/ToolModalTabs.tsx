import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall } from '@/sync/typesMessage';
import { VerticalParameterStack } from './VerticalParameterStack';

interface ToolModalTabsProps {
    tool: ToolCall;
    hideOutput?: boolean; // Show INPUT only (permission pending)
}

type TabType = 'input' | 'output';

export const ToolModalTabs = React.memo<ToolModalTabsProps>(
    ({ tool, hideOutput }) => {
        const { theme } = useUnistyles();
        const [activeTab, setActiveTab] = React.useState<TabType>('input');

        const inputCount = tool.input ? Object.keys(tool.input).length : 0;
        const outputCount = tool.result ? Object.keys(tool.result).length : 0;

        return (
            <View style={styles.container}>
                {/* Tab Headers */}
                <View style={styles.tabHeader}>
                    <Pressable
                        style={[
                            styles.tabButton,
                            activeTab === 'input' && styles.tabButtonActive,
                        ]}
                        onPress={() => setActiveTab('input')}
                    >
                        <Text style={styles.tabLabel}>
                            INPUT{inputCount > 0 ? ` (${inputCount})` : ''}
                        </Text>
                    </Pressable>

                    {!hideOutput && (
                        <Pressable
                            style={[
                                styles.tabButton,
                                activeTab === 'output' && styles.tabButtonActive,
                            ]}
                            onPress={() => setActiveTab('output')}
                        >
                            <Text style={styles.tabLabel}>
                                OUTPUT{outputCount > 0 ? ` (${outputCount})` : ''}
                            </Text>
                        </Pressable>
                    )}
                </View>

                {/* Tab Content */}
                <View style={styles.tabContent}>
                    {activeTab === 'input' && (
                        <VerticalParameterStack parameters={tool.input} />
                    )}
                    {activeTab === 'output' && !hideOutput && (
                        <VerticalParameterStack parameters={tool.result} />
                    )}
                </View>
            </View>
        );
    }
);

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surfaceHigh,
    },
    tabHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceHighest,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    tabButtonActive: {
        borderBottomWidth: 2,
        borderBottomColor: theme.colors.textLink,
    },
    tabLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
    },
    tabContent: {
        flex: 1,
        paddingVertical: 8,
    },
}));
