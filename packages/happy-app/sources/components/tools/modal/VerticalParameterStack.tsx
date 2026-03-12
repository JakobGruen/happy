import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { VariableFormatter } from '../adaptive/VariableFormatter';

interface VerticalParameterStackProps {
    parameters?: Record<string, any>;
    hideOutput?: boolean;
    isVertical?: boolean;
}

export const VerticalParameterStack = React.memo<VerticalParameterStackProps>(
    ({ parameters, hideOutput = false, isVertical = true }) => {
        const { theme } = useUnistyles();

        if (!parameters || Object.keys(parameters).length === 0) {
            return (
                <View style={styles.emptyContainer}>
                    <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                        No parameters
                    </Text>
                </View>
            );
        }

        return (
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.contentContainer}
                showsVerticalScrollIndicator={true}
            >
                {Object.entries(parameters).map(([key, value]) => {
                    // Skip undefined values when hideOutput is true
                    if (hideOutput && value === undefined) {
                        return null;
                    }

                    return (
                        <View key={key} style={styles.parameterGroup}>
                            <Text style={[styles.paramName, { color: theme.colors.textSecondary }]}>
                                {key}
                            </Text>
                            <View style={styles.valueContainer}>
                                <VariableFormatter
                                    name={key}
                                    value={value}
                                    isVertical={isVertical}
                                />
                            </View>
                        </View>
                    );
                })}
            </ScrollView>
        );
    }
);

VerticalParameterStack.displayName = 'VerticalParameterStack';

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 14,
        fontStyle: 'italic',
    },
    parameterGroup: {
        marginBottom: 16,
    },
    paramName: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    valueContainer: {
        backgroundColor: theme.colors.surfaceRipple,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
}));
