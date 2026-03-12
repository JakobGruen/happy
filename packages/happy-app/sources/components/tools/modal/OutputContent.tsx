import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

interface OutputContentProps {
    content?: any;
}

export const OutputContent = React.memo<OutputContentProps>(({ content }) => {
    const { theme } = useUnistyles();

    if (!content) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
                    No output
                </Text>
            </View>
        );
    }

    // Convert content to displayable string
    let displayText: string;
    if (typeof content === 'string') {
        displayText = content;
    } else if (typeof content === 'object') {
        // Format objects as prettified JSON
        try {
            displayText = JSON.stringify(content, null, 2);
        } catch {
            displayText = String(content);
        }
    } else {
        displayText = String(content);
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={true}
        >
            <View
                style={[
                    styles.codeBlock,
                    { backgroundColor: theme.colors.surfaceRipple },
                ]}
            >
                <Text
                    style={[
                        styles.codeText,
                        { color: theme.colors.text },
                    ]}
                >
                    {displayText}
                </Text>
            </View>
        </ScrollView>
    );
});

OutputContent.displayName = 'OutputContent';

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
    codeBlock: {
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        fontFamily: 'Courier New',
    },
    codeText: {
        fontSize: 12,
        fontFamily: 'Courier New',
        lineHeight: 18,
    },
}));
