import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { ToolDiffView } from '@/components/tools/ToolDiffView';
import { detectContentType, type ContentType } from './detectContentType';

export { detectContentType, type ContentType } from './detectContentType';

interface ContentFormatterProps {
    value: unknown;
    testID?: string;
}

/**
 * Unified content formatter with intelligent type detection
 * Renders JSON, diffs, code, markdown, or plain text
 * Uses gray surfaceRipple background box for consistency
 */
export function ContentFormatter({ value, testID }: ContentFormatterProps) {
    const { theme } = useUnistyles();
    const type = detectContentType(value);

    return (
        <View
            testID={testID}
            style={styles.container}
        >
            {type === 'json' && <JsonRenderer value={value} />}
            {type === 'diff' && <DiffRenderer content={String(value)} />}
            {type === 'code' && <CodeRenderer content={String(value)} />}
            {type === 'markdown' && <TextRenderer content={String(value)} />}
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
        <ScrollView
            contentContainerStyle={styles.scrollContentContainer}
            showsVerticalScrollIndicator={true}
        >
            <SimpleSyntaxHighlighter
                code={jsonStr}
                language="json"
                selectable={true}
            />
        </ScrollView>
    );
}

interface ParsedDiff {
    oldText: string;
    newText: string;
}

/**
 * Parse unified diff format to extract old and new text sections
 */
function parseDiffFormat(content: string): ParsedDiff {
    const lines = content.split('\n');
    const oldLines: string[] = [];
    const newLines: string[] = [];

    for (const line of lines) {
        if (line.startsWith('-') && !line.startsWith('---')) {
            oldLines.push(line.substring(1));
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
            newLines.push(line.substring(1));
        } else if (!line.startsWith('@') && !line.startsWith('---') && !line.startsWith('+++')) {
            // Context lines (start with space or no prefix)
            const trimmed = line.startsWith(' ') ? line.substring(1) : line;
            if (trimmed) {
                oldLines.push(trimmed);
                newLines.push(trimmed);
            }
        }
    }

    return {
        oldText: oldLines.join('\n'),
        newText: newLines.join('\n'),
    };
}

function DiffRenderer({ content }: { content: string }) {
    const parsed = parseDiffFormat(content);
    return (
        <ToolDiffView
            oldText={parsed.oldText}
            newText={parsed.newText}
            showLineNumbers={true}
            showPlusMinusSymbols={true}
            style={styles.diffContainer}
        />
    );
}

function CodeRenderer({ content }: { content: string }) {
    // Detect language from common file extensions or keywords
    let language: string | null = 'javascript';

    if (content.includes('def ') || content.includes('import ')) {
        language = 'python';
    } else if (content.includes('class ') && content.includes(':')) {
        language = 'python';
    }

    return (
        <ScrollView
            contentContainerStyle={styles.scrollContentContainer}
            showsVerticalScrollIndicator={true}
        >
            <SimpleSyntaxHighlighter
                code={content}
                language={language}
                selectable={true}
            />
        </ScrollView>
    );
}

function TextRenderer({ content }: { content: string }) {
    const { theme } = useUnistyles();

    return (
        <ScrollView
            contentContainerStyle={styles.scrollContentContainer}
            showsVerticalScrollIndicator={true}
        >
            <Text
                selectable={true}
                style={[
                    styles.plainText,
                    { color: theme.colors.text },
                ]}
            >
                {content}
            </Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 8,
        overflow: 'hidden',
    },
    scrollContentContainer: {
        paddingHorizontal: 4,
        paddingVertical: 4,
    },
    diffContainer: {
        flex: 1,
    },
    plainText: {
        fontSize: 12,
        fontFamily: 'Courier New',
        lineHeight: 18,
    },
}));
