import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ToolCall } from '@/sync/typesMessage';
import { knownTools } from '@/components/tools/knownTools';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { languageFromPath } from '@/utils/languageFromPath';
import { useSetting } from '@/sync/storage';

// --- Exported types and pure extraction logic (testable without rendering) ---

export interface FileViewData {
    content: string;
    filePath: string;
    fileName: string;
    language: string | null;
    startLine: number;
    numLines: number;
    totalLines: number;
    isPartialRead: boolean;
}

/**
 * Extracts file content and metadata from Read or Write tool calls.
 * Returns null if the tool is unsupported, still running (Read), or data is missing.
 */
export function extractFileViewData(tool: ToolCall): FileViewData | null {
    if (tool.name === 'Read') {
        return extractReadData(tool);
    }
    if (tool.name === 'Write') {
        return extractWriteData(tool);
    }
    return null;
}

function extractReadData(tool: ToolCall): FileViewData | null {
    if (tool.result == null) return null;

    const parsed = knownTools.Read.result?.safeParse(tool.result);
    if (!parsed?.success) return null;

    const file = parsed.data.file;
    if (!file || typeof file.content !== 'string') return null;

    const filePath = file.filePath ?? tool.input?.file_path ?? '';
    const fileName = filePath.split('/').pop() || '';
    const startLine = file.startLine ?? 1;
    const numLines = file.numLines ?? 0;
    const totalLines = file.totalLines ?? 0;
    const isPartialRead = startLine > 1 || (totalLines > 0 && numLines < totalLines);

    return {
        content: file.content,
        filePath,
        fileName,
        language: languageFromPath(filePath),
        startLine,
        numLines,
        totalLines,
        isPartialRead,
    };
}

function extractWriteData(tool: ToolCall): FileViewData | null {
    const parsed = knownTools.Write.input.safeParse(tool.input);
    if (!parsed?.success) return null;

    const content = parsed.data.content;
    if (typeof content !== 'string') return null;

    const filePath = parsed.data.file_path ?? '';
    const fileName = filePath.split('/').pop() || '';
    const lines = content.split('\n').length;

    return {
        content,
        filePath,
        fileName,
        language: languageFromPath(filePath),
        startLine: 1,
        numLines: lines,
        totalLines: lines,
        isPartialRead: false,
    };
}

// --- Component ---

interface FileViewModalContentProps {
    tool: ToolCall;
}

/**
 * Renders file content with syntax highlighting for Read and Write tools.
 * Replaces ToolModalTabs for these tools — shows file header + syntax-highlighted code.
 */
export const FileViewModalContent = React.memo<FileViewModalContentProps>(({ tool }) => {
    const { theme } = useUnistyles();
    const showLineNumbers = useSetting('showLineNumbersInToolViews');

    // Running Read tool: no result yet
    if (tool.name === 'Read' && tool.state === 'running') {
        return <FallbackText text="Waiting for result\u2026" />;
    }

    const data = extractFileViewData(tool);

    if (!data) {
        // Unsupported tool or missing data
        const text = (tool.name === 'Read' || tool.name === 'Write')
            ? 'No content available'
            : 'Unable to display file';
        return <FallbackText text={text} />;
    }

    return (
        <View style={styles.container}>
            <FileHeader
                fileName={data.fileName}
                isPartialRead={data.isPartialRead}
                startLine={data.startLine}
                numLines={data.numLines}
                totalLines={data.totalLines}
            />
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator
            >
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator
                    contentContainerStyle={styles.horizontalScrollContent}
                >
                    <View style={styles.codeContainer}>
                        {showLineNumbers && (
                            <LineNumbers
                                startLine={data.startLine}
                                count={data.content.split('\n').length}
                            />
                        )}
                        <View style={styles.codeContent}>
                            <SimpleSyntaxHighlighter
                                code={data.content}
                                language={data.language}
                                selectable
                            />
                        </View>
                    </View>
                </ScrollView>
            </ScrollView>
        </View>
    );
});

// --- Sub-components ---

function FileHeader({
    fileName,
    isPartialRead,
    startLine,
    numLines,
    totalLines,
}: {
    fileName: string;
    isPartialRead: boolean;
    startLine: number;
    numLines: number;
    totalLines: number;
}) {
    const { theme } = useUnistyles();
    if (!fileName) return null;

    const endLine = startLine + numLines - 1;
    const rangeText = isPartialRead
        ? `Lines ${startLine}\u2013${endLine} of ${totalLines}`
        : null;

    return (
        <View style={[styles.fileHeader, { borderBottomColor: theme.colors.surfaceRipple }]}>
            <Text
                style={[styles.fileHeaderText, { color: theme.colors.textSecondary }]}
                numberOfLines={1}
            >
                {fileName}
            </Text>
            {rangeText && (
                <Text
                    style={[styles.rangeText, { color: theme.colors.textSecondary }]}
                    numberOfLines={1}
                >
                    {rangeText}
                </Text>
            )}
        </View>
    );
}

function LineNumbers({ startLine, count }: { startLine: number; count: number }) {
    const { theme } = useUnistyles();
    const lines: string[] = [];
    for (let i = 0; i < count; i++) {
        lines.push(String(startLine + i));
    }

    return (
        <View style={styles.lineNumbers}>
            {lines.map((num, i) => (
                <Text
                    key={i}
                    style={[styles.lineNumber, { color: theme.colors.textSecondary }]}
                >
                    {num}
                </Text>
            ))}
        </View>
    );
}

function FallbackText({ text }: { text: string }) {
    const { theme } = useUnistyles();
    return (
        <View style={styles.fallback}>
            <Text style={[styles.fallbackText, { color: theme.colors.textSecondary }]}>
                {text}
            </Text>
        </View>
    );
}

// --- Styles ---

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surfaceHigh,
    },
    fileHeader: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    fileHeaderText: {
        fontSize: 13,
        fontFamily: 'monospace',
        fontWeight: '500',
        flexShrink: 1,
    },
    rangeText: {
        fontSize: 12,
        fontFamily: 'monospace',
        marginLeft: 8,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    horizontalScrollContent: {
        flexGrow: 1,
    },
    codeContainer: {
        flexDirection: 'row',
        paddingVertical: 8,
    },
    lineNumbers: {
        paddingLeft: 12,
        paddingRight: 8,
        alignItems: 'flex-end',
    },
    lineNumber: {
        fontSize: 14,
        fontFamily: 'monospace',
        lineHeight: 20,
        opacity: 0.5,
    },
    codeContent: {
        flex: 1,
        paddingHorizontal: 12,
    },
    fallback: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    fallbackText: {
        fontSize: 14,
        fontStyle: 'italic',
    },
}));
