import React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { CodeView } from '@/components/CodeView';

interface VariableFormatterProps {
    name: string;
    value: unknown;
    isVertical?: boolean;
}

export const VariableFormatter = React.memo<VariableFormatterProps>(
    ({ name, value, isVertical = false }) => {
        const { theme } = useUnistyles();

        // Format the value for display
        const formattedValue = React.useMemo(() => {
            if (value === undefined || value === null) {
                return String(value);
            }

            if (typeof value === 'string') {
                return value;
            }

            if (typeof value === 'object') {
                return JSON.stringify(value, null, 2);
            }

            return String(value);
        }, [value]);

        // Determine if we should use CodeView (for longer content)
        const isLongContent = typeof formattedValue === 'string' && formattedValue.length > 100;

        if (isLongContent) {
            return (
                <View style={styles.container}>
                    <CodeView code={formattedValue} />
                </View>
            );
        }

        return (
            <Text style={[styles.value, { color: theme.colors.textSecondary }]} numberOfLines={3}>
                {formattedValue}
            </Text>
        );
    }
);

const styles = StyleSheet.create((theme) => (({
    container: {
        marginVertical: 4,
    },
    value: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        lineHeight: 18,
    },
})));
