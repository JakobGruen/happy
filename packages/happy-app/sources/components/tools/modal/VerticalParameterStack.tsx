import React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { VariableFormatter } from '../adaptive/VariableFormatter';

interface VerticalParameterStackProps {
    parameters: Record<string, unknown>;
    hideOutput?: boolean; // For permission pending state
    testID?: string;
}

export const VerticalParameterStack = React.memo<VerticalParameterStackProps>(
    ({ parameters, hideOutput, testID }) => {
        const { theme } = useUnistyles();

        const entries = Object.entries(parameters || {}).filter(
            ([key, value]) => !(hideOutput && value === undefined)
        );

        if (entries.length === 0) {
            return (
                <View style={styles.emptyContainer} testID={testID ? `${testID}-empty` : undefined}>
                    <Text style={styles.emptyText}>No parameters</Text>
                </View>
            );
        }

        return (
            <View style={styles.container} testID={testID}>
                {entries.map(([key, value], idx) => (
                    <View key={`${key}-${idx}`} style={styles.parameterGroup}>
                        <Text style={styles.parameterName}>{key}</Text>
                        <VariableFormatter
                            name={key}
                            value={value}
                            isVertical={true}
                        />
                    </View>
                ))}
            </View>
        );
    }
);

const styles = StyleSheet.create((theme) => ({
    container: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    parameterGroup: {
        marginBottom: 12,
    },
    parameterName: {
        fontSize: 13,
        fontWeight: '500',
        color: theme.colors.textSecondary,
        marginBottom: 4,
    },
    emptyContainer: {
        paddingHorizontal: 12,
        paddingVertical: 16,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
    },
}));
