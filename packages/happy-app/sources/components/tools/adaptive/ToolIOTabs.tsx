import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { VariableFormatter } from './VariableFormatter';
import { analyzeContent } from './contentAnalyzer';

// Responsive grid breakpoints
const GRID_LAYOUT = {
    mobile: 1,   // 1 column on mobile
    tablet: 2,   // 2 columns on tablet
    web: 3,      // 3 columns on web
} as const;

type TabType = 'input' | 'output';

interface ToolIOTabsProps {
    input?: Record<string, unknown>;
    output?: unknown;
    hideOutput?: boolean; // For permission modals, hide output tab
}

/**
 * Adaptive INPUT/OUTPUT tabs component
 * Shows organized input variables and collapsible output
 * Hides output tab in permission modals (hideOutput=true)
 */
export const ToolIOTabs = React.memo<ToolIOTabsProps>(
    ({ input, output, hideOutput = false }) => {
        const { theme } = useUnistyles();
        const [activeTab, setActiveTab] = React.useState<TabType>('input');
        const [expandedVars, setExpandedVars] = React.useState<Set<string>>(new Set());

        const toggleVarExpanded = (varName: string) => {
            setExpandedVars((prev) => {
                const next = new Set(prev);
                if (next.has(varName)) {
                    next.delete(varName);
                } else {
                    next.add(varName);
                }
                return next;
            });
        };

        // Determine if output tab should be shown
        const hasOutput = !hideOutput && output !== undefined;
        const tabs: TabType[] = ['input'];
        if (hasOutput) {
            tabs.push('output');
        }

        const inputEntries = input ? Object.entries(input) : [];
        const inputCount = inputEntries.length;

        // Check if content is large to decide tab layout
        const inputSize = inputEntries.reduce(
            (sum, [, val]) => sum + JSON.stringify(val).length,
            0
        );
        const shouldCollapseTabs = inputSize > 1000;

        return (
            <View style={styles.container}>
                {/* Tab headers */}
                <View
                    style={[
                        styles.tabBar,
                        { borderBottomColor: theme.colors.textSecondary },
                    ]}
                >
                    {tabs.map((tab) => (
                        <Pressable
                            key={tab}
                            onPress={() => setActiveTab(tab)}
                            style={[
                                styles.tabButton,
                                activeTab === tab && {
                                    borderBottomColor: theme.colors.textLink,
                                },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.tabLabel,
                                    {
                                        color:
                                            activeTab === tab
                                                ? theme.colors.text
                                                : theme.colors.textSecondary,
                                    },
                                ]}
                            >
                                {tab.toUpperCase()}
                                {tab === 'input' && inputCount > 0 && (
                                    <Text
                                        style={[
                                            styles.tabCount,
                                            {
                                                color: theme.colors.textSecondary,
                                            },
                                        ]}
                                    >
                                        {` (${inputCount})`}
                                    </Text>
                                )}
                            </Text>
                        </Pressable>
                    ))}
                </View>

                {/* Tab content */}
                <ScrollView
                    style={[
                        styles.tabContent,
                        {
                            backgroundColor: theme.colors.surfaceHigh,
                        },
                    ]}
                    scrollEnabled={shouldCollapseTabs}
                >
                    {activeTab === 'input' && (
                        <View style={styles.inputContent}>
                            {inputCount === 0 ? (
                                <Text
                                    style={[
                                        styles.emptyText,
                                        { color: theme.colors.textSecondary },
                                    ]}
                                >
                                    No input parameters
                                </Text>
                            ) : inputCount > 5 ? (
                                // Multi-column layout for many params
                                <View style={styles.paramGrid}>
                                    {inputEntries.map(([name, value]) => (
                                        <View
                                            key={name}
                                            style={styles.gridItem}
                                        >
                                            <VariableFormatter
                                                name={name}
                                                value={value}
                                                isExpanded={expandedVars.has(name)}
                                                onToggle={() =>
                                                    toggleVarExpanded(name)
                                                }
                                            />
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                // Single column for fewer params
                                <>
                                    {inputEntries.map(([name, value]) => (
                                        <VariableFormatter
                                            key={name}
                                            name={name}
                                            value={value}
                                            isExpanded={expandedVars.has(name)}
                                            onToggle={() =>
                                                toggleVarExpanded(name)
                                            }
                                        />
                                    ))}
                                </>
                            )}
                        </View>
                    )}

                    {activeTab === 'output' && output !== undefined && (
                        <View style={styles.outputContent}>
                            <VariableFormatter
                                name="result"
                                value={output}
                                isExpanded={expandedVars.has('__output')}
                                onToggle={() =>
                                    toggleVarExpanded('__output')
                                }
                            />
                        </View>
                    )}
                </ScrollView>
            </View>
        );
    }
);

const styles = StyleSheet.create((theme) => ({
    container: {
        borderRadius: 8,
        overflow: 'hidden',
        marginVertical: 8,
    },
    tabBar: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        backgroundColor: theme.colors.surfaceHighest,
    },
    tabButton: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
        alignItems: 'center',
    },
    tabLabel: {
        fontSize: 13,
        fontWeight: '600',
    },
    tabCount: {
        fontSize: 12,
        fontWeight: '400',
    },
    tabContent: {
        minHeight: 150,
        maxHeight: 500,
    },
    inputContent: {
        padding: 12,
    },
    outputContent: {
        padding: 12,
    },
    paramGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    gridItem: {
        // Responsive: 2 columns on most screens, 1 on small screens
        // Account for gap: (100% - gap) / 2 = (100% - 12px) / 2
        flex: 1,
        minWidth: 160,  // Minimum width before wrapping to next row
    },
    emptyText: {
        fontSize: 13,
        fontStyle: 'italic',
        textAlign: 'center',
        marginVertical: 16,
    },
}));
