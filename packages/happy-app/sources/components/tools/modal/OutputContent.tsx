import React from 'react';
import { View, ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ContentFormatter } from './ContentFormatter';
import { VerticalParameterStack } from './VerticalParameterStack';

interface OutputContentProps {
    result: unknown;
    testID?: string;
}

/**
 * Attempts to parse a string as JSON object
 * Returns object if successful, undefined otherwise
 */
export function tryParseJsonString(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'string') return undefined;

    try {
        const parsed = JSON.parse(value);
        // Only return if it's a plain object (not array or primitive)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed;
        }
    } catch {
        // Not valid JSON
    }

    return undefined;
}

/**
 * Determines if a value should be unpacked as parameters
 * Returns true only for objects with 2+ keys (avoids ambiguous single-result fields)
 */
export function shouldUnpackJson(value: unknown): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length >= 2;
}

/**
 * OutputContent renders tool result with intelligent formatting
 * - Detects JSON strings and unpacks them as parameters (2+ keys only)
 * - Detects plain objects with 2+ keys and renders as parameters
 * - Falls back to ContentFormatter for all other content types
 */
export function OutputContent({ result, testID }: OutputContentProps) {
    // Try to unpack JSON strings as parameters
    if (typeof result === 'string') {
        const parsed = tryParseJsonString(result);
        if (parsed && shouldUnpackJson(parsed)) {
            return (
                <ScrollView testID={testID} style={styles.container}>
                    <VerticalParameterStack parameters={parsed} />
                </ScrollView>
            );
        }
    }

    // For already-parsed objects, check if they should be unpacked
    if (shouldUnpackJson(result)) {
        return (
            <ScrollView testID={testID} style={styles.container}>
                <VerticalParameterStack
                    parameters={result as Record<string, unknown>}
                />
            </ScrollView>
        );
    }

    // Default: use ContentFormatter for intelligent rendering
    // Handles: JSON arrays, strings, diffs, code, markdown, plain text
    return (
        <ScrollView testID={testID} style={styles.container}>
            <ContentFormatter value={result} testID={`${testID}-content`} />
        </ScrollView>
    );
}

const styles = StyleSheet.create(() => ({
    container: {
        flex: 1,
    },
}));
