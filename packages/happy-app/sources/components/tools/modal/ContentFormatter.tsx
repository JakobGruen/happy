import React from 'react';
import { View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { detectContentType, type ContentType } from './detectContentType';

export { detectContentType, type ContentType } from './detectContentType';

interface ContentFormatterProps {
    value: unknown;
    testID?: string;
}

/**
 * Renders a single value with smart type detection (JSON / code / text).
 *
 * No padding or background — the parent (VerticalParameterStack's valueContainer)
 * provides the gray box wrapper. This avoids double-padding.
 */
export function ContentFormatter({ value, testID }: ContentFormatterProps) {
    const type = detectContentType(value);

    return (
        <View testID={testID}>
            {type === 'json' && <JsonRenderer value={value} />}
            {type === 'code' && <CodeRenderer content={String(value)} />}
            {type === 'text' && <TextRenderer content={String(value)} />}
        </View>
    );
}

function JsonRenderer({ value }: { value: unknown }) {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            return <TextRenderer content={String(value)} />;
        }
    }

    const jsonStr = JSON.stringify(parsed, null, 2);
    return (
        <SimpleSyntaxHighlighter
            code={jsonStr}
            language="json"
            selectable={true}
        />
    );
}

function CodeRenderer({ content }: { content: string }) {
    const language = detectLanguage(content);

    return (
        <SimpleSyntaxHighlighter
            code={content}
            language={language}
            selectable={true}
        />
    );
}

function TextRenderer({ content }: { content: string }) {
    const { theme } = useUnistyles();

    return (
        <Text
            selectable={true}
            style={[styles.plainText, { color: theme.colors.text }]}
        >
            {content}
        </Text>
    );
}

/**
 * Simple language detection for syntax highlighting.
 */
function detectLanguage(content: string): string {
    if (/\bdef\s+\w+\s*\(/.test(content) || /^from\s+\w+\s+import/m.test(content)) {
        return 'python';
    }
    if (/^package\s+\w+/m.test(content) || /\bfunc\s+\w+/.test(content)) {
        return 'go';
    }
    return 'javascript';
}

const styles = StyleSheet.create(() => ({
    plainText: {
        fontSize: 12,
        fontFamily: 'monospace',
        lineHeight: 18,
    },
}));
