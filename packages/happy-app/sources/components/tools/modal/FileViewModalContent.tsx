import React from 'react';
import { ScrollView, View, Text, Pressable, LayoutChangeEvent, StyleSheet as RNStyleSheet } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    useAnimatedScrollHandler,
    useAnimatedRef,
    scrollTo as reanimatedScrollTo,
    runOnUI,
} from 'react-native-reanimated';
import { ToolCall } from '@/sync/typesMessage';
import { knownTools } from '@/components/tools/knownTools';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { languageFromPath } from '@/utils/languageFromPath';
import { useSettingMutable } from '@/sync/storage';
import { Typography } from '@/constants/Typography';

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

    const filePath = (typeof tool.input?.file_path === 'string' ? tool.input.file_path : '') as string;

    // tool.result comes from the wire as either a string or array of content blocks.
    let rawContent: string | null = null;

    if (typeof tool.result === 'string') {
        rawContent = tool.result;
    } else if (Array.isArray(tool.result)) {
        // Content blocks: [{ type: 'text', text: '...' }, ...]
        const textBlocks = (tool.result as Array<{ type: string; text?: string }>)
            .filter(b => b.type === 'text' && typeof b.text === 'string')
            .map(b => b.text!);
        if (textBlocks.length > 0) {
            rawContent = textBlocks.join('\n');
        }
    } else if (typeof tool.result === 'object' && tool.result !== null) {
        // Nested file object (knownTools schema shape — may be used in future)
        const file = (tool.result as any).file;
        if (file && typeof file.content === 'string') {
            const startLine = file.startLine ?? 1;
            const numLines = file.numLines ?? file.content.split('\n').length;
            const totalLines = file.totalLines ?? numLines;
            const fp = file.filePath ?? filePath;
            return {
                content: file.content,
                filePath: fp,
                fileName: fp.split('/').pop() || '',
                language: languageFromPath(fp),
                startLine,
                numLines,
                totalLines,
                isPartialRead: startLine > 1 || (totalLines > 0 && numLines < totalLines),
            };
        }
    }

    if (!rawContent) return null;

    // Parse `cat -n` format: strip leading line numbers.
    // Format: spaces + number + separator + content
    // Separator is either \t (actual tab) or → (U+2192, how Read tool formats output)
    const lines = rawContent.split('\n');
    const strippedLines: string[] = [];
    let detectedStartLine = 1;
    let hasLineNumbers = false;

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^\s*(\d+)[\t\u2192](.*)$/);
        if (match) {
            if (i === 0) {
                detectedStartLine = parseInt(match[1], 10);
                hasLineNumbers = true;
            }
            strippedLines.push(match[2]);
        } else {
            strippedLines.push(lines[i]);
        }
    }

    const content = strippedLines.join('\n');
    const numLines = strippedLines.length;
    const fileName = filePath.split('/').pop() || '';

    // Detect partial read from input params or line numbers
    const inputOffset = tool.input?.offset;
    const inputLimit = tool.input?.limit;
    const startLine = hasLineNumbers ? detectedStartLine : (typeof inputOffset === 'number' ? inputOffset : 1);
    const isPartialRead = startLine > 1 || (typeof inputLimit === 'number' && inputLimit > 0);
    // We can't know totalLines from result alone when partial
    const totalLines = isPartialRead ? 0 : numLines;

    return {
        content,
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

// Padding at the top of the code container — must match styles.codeContainer.paddingVertical
const CONTENT_PADDING_TOP = 8;

/**
 * Finds the line index whose row is at the top of the visible viewport,
 * plus a fractional pixel offset within that row for sub-line precision.
 * Uses binary search over measured row Y positions (relative to codeLinesContainer).
 * scrollY should already be adjusted for the container padding offset.
 */
export function findTopVisibleLine(scrollY: number, rowYs: number[]): { index: number; offset: number } {
    if (rowYs.length === 0) return { index: 0, offset: 0 };
    // Find the last row whose Y is <= scrollY
    let lo = 0;
    let hi = rowYs.length - 1;
    let result = 0;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (rowYs[mid] != null && rowYs[mid] <= scrollY) {
            result = mid;
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    // Fractional offset: how many pixels past the top of this row
    const offset = rowYs[result] != null ? scrollY - rowYs[result] : 0;
    return { index: result, offset };
}

// --- Component ---

interface FileViewModalContentProps {
    tool: ToolCall;
}

/**
 * Renders file content with syntax highlighting for Read and Write tools.
 * Replaces ToolModalTabs for these tools — shows file header + syntax-highlighted code.
 *
 * Flicker-free wrap toggle via dual ScrollView double-buffer:
 * Both wrapped and unwrapped ScrollViews are always mounted (absolutely positioned).
 * The inactive one has opacity 0 and sits behind the active one (lower zIndex).
 * On toggle, a Reanimated UI-thread worklet atomically scrolls the hidden view to
 * the correct line position and flips opacity — both happen in the same UI frame,
 * so there is zero flicker or visual jump.
 */
export const FileViewModalContent = React.memo<FileViewModalContentProps>(({ tool }) => {
    const [wrapLines, setWrapLines] = useSettingMutable('wrapLinesInDiffs');

    // Reanimated refs for both ScrollViews
    const wrappedRef = useAnimatedRef<Animated.ScrollView>();
    const unwrappedRef = useAnimatedRef<Animated.ScrollView>();

    // Shared value: 1 = wrapped view is active, 0 = unwrapped is active
    const activeIsWrapped = useSharedValue(wrapLines ? 1 : 0);

    // Scroll position tracking on UI thread
    const wrappedScrollY = useSharedValue(0);
    const unwrappedScrollY = useSharedValue(0);

    // Row Y positions (JS thread, populated by onLayout from each view)
    const wrappedRowYs = React.useRef<number[]>([]);
    const unwrappedRowYs = React.useRef<number[]>([]);

    // Scroll handlers — track Y on UI thread via shared values
    const wrappedScrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            wrappedScrollY.value = event.contentOffset.y;
        },
    });
    const unwrappedScrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            unwrappedScrollY.value = event.contentOffset.y;
        },
    });

    // Layout callbacks — each view populates its own row Y array
    const handleWrappedRowLayout = React.useCallback((index: number, y: number) => {
        wrappedRowYs.current[index] = y;
    }, []);
    const handleUnwrappedRowLayout = React.useCallback((index: number, y: number) => {
        unwrappedRowYs.current[index] = y;
    }, []);

    // Animated styles: opacity + zIndex driven by shared value
    const wrappedAnimStyle = useAnimatedStyle(() => ({
        opacity: activeIsWrapped.value,
        zIndex: activeIsWrapped.value,
    }));
    const unwrappedAnimStyle = useAnimatedStyle(() => ({
        opacity: 1 - activeIsWrapped.value,
        zIndex: 1 - activeIsWrapped.value,
    }));

    const handleToggleWrap = React.useCallback(() => {
        const isWrapped = wrapLines;
        const currentScrollY = isWrapped ? wrappedScrollY.value : unwrappedScrollY.value;
        const currentRowYs = isWrapped ? wrappedRowYs.current : unwrappedRowYs.current;
        const targetRowYs = isWrapped ? unwrappedRowYs.current : wrappedRowYs.current;

        const topLine = findTopVisibleLine(currentScrollY - CONTENT_PADDING_TOP, currentRowYs);
        const targetY = Math.max(0, (targetRowYs[topLine.index] ?? 0) + topLine.offset + CONTENT_PADDING_TOP);

        const targetRef = isWrapped ? unwrappedRef : wrappedRef;
        const newActiveValue = isWrapped ? 0 : 1;

        // Atomic UI-thread operation: scroll hidden view + flip visibility
        runOnUI(() => {
            'worklet';
            reanimatedScrollTo(targetRef, 0, targetY, false);
            activeIsWrapped.value = newActiveValue;
        })();

        setWrapLines(!wrapLines);
    }, [wrapLines, setWrapLines, activeIsWrapped, wrappedScrollY, unwrappedScrollY, wrappedRef, unwrappedRef]);

    // Running Read tool: no result yet
    if (tool.name === 'Read' && tool.state === 'running') {
        return <FallbackText text="Waiting for result…" />;
    }

    const data = extractFileViewData(tool);

    if (!data) {
        const text = (tool.name === 'Read' || tool.name === 'Write')
            ? 'No content available'
            : 'Unable to display file';
        return <FallbackText text={text} />;
    }

    const codeLines = data.content.split('\n');

    return (
        <View style={styles.container}>
            <FileHeader
                fileName={data.fileName}
                isPartialRead={data.isPartialRead}
                startLine={data.startLine}
                numLines={data.numLines}
                totalLines={data.totalLines}
                wrapLines={wrapLines}
                onToggleWrap={handleToggleWrap}
            />
            <View style={styles.scrollArea}>
                {/* Wrapped view — always mounted */}
                <Animated.ScrollView
                    ref={wrappedRef}
                    style={[RNStyleSheet.absoluteFill, wrappedAnimStyle]}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator
                    onScroll={wrappedScrollHandler}
                    scrollEventThrottle={16}
                >
                    <View style={styles.codeContainer}>
                        <CodeLines
                            lines={codeLines}
                            startLine={data.startLine}
                            language={data.language}
                            onRowLayout={handleWrappedRowLayout}
                        />
                    </View>
                </Animated.ScrollView>

                {/* Unwrapped view — always mounted */}
                <Animated.ScrollView
                    ref={unwrappedRef}
                    style={[RNStyleSheet.absoluteFill, unwrappedAnimStyle]}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator
                    onScroll={unwrappedScrollHandler}
                    scrollEventThrottle={16}
                >
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator
                        contentContainerStyle={styles.horizontalScrollContent}
                    >
                        <View style={styles.codeContainer}>
                            <CodeLines
                                lines={codeLines}
                                startLine={data.startLine}
                                language={data.language}
                                onRowLayout={handleUnwrappedRowLayout}
                            />
                        </View>
                    </ScrollView>
                </Animated.ScrollView>
            </View>
        </View>
    );
});

// --- Sub-components ---

/**
 * Renders code lines with per-row line numbers.
 * Each logical line is a row: [lineNumber | codeLine].
 * When text wraps, the line number stays at the top of its row.
 * Reports row Y positions via onRowLayout for scroll preservation.
 */
function CodeLines({
    lines,
    startLine,
    language,
    onRowLayout,
}: {
    lines: string[];
    startLine: number;
    language: string | null;
    onRowLayout?: (index: number, y: number) => void;
}) {
    const { theme } = useUnistyles();
    const lineNumWidth = String(startLine + lines.length - 1).length;
    const gutterWidth = Math.max(lineNumWidth * 9 + 16, 36);

    return (
        <View style={styles.codeLinesContainer}>
            {lines.map((line, i) => (
                <View
                    key={i}
                    style={styles.codeRow}
                    onLayout={onRowLayout ? (e: LayoutChangeEvent) => {
                        onRowLayout(i, e.nativeEvent.layout.y);
                    } : undefined}
                >
                    <View style={[styles.lineNumberCell, { width: gutterWidth }]}>
                        <Text
                            style={[styles.lineNumber, { color: theme.colors.textSecondary }]}
                        >
                            {startLine + i}
                        </Text>
                    </View>
                    <View style={styles.codeLineCell}>
                        <SimpleSyntaxHighlighter
                            code={line}
                            language={language}
                            selectable
                        />
                    </View>
                </View>
            ))}
        </View>
    );
}

function FileHeader({
    fileName,
    isPartialRead,
    startLine,
    numLines,
    totalLines,
    wrapLines,
    onToggleWrap,
}: {
    fileName: string;
    isPartialRead: boolean;
    startLine: number;
    numLines: number;
    totalLines: number;
    wrapLines: boolean;
    onToggleWrap: () => void;
}) {
    const { theme } = useUnistyles();
    if (!fileName) return null;

    const endLine = startLine + numLines - 1;
    const rangeText = isPartialRead
        ? totalLines > 0
            ? `Lines ${startLine}\u2013${endLine} of ${totalLines}`
            : `Lines ${startLine}\u2013${endLine}`
        : null;

    return (
        <View style={[styles.fileHeader, { borderBottomColor: theme.colors.surfaceRipple }]}>
            <View style={styles.fileHeaderLeft}>
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
            <WrapToggleButton wrapLines={wrapLines} onPress={onToggleWrap} />
        </View>
    );
}

/** Shared wrap-toggle icon button used in file view and diff modal headers. */
export function WrapToggleButton({ wrapLines, onPress }: { wrapLines: boolean; onPress: () => void }) {
    const { theme } = useUnistyles();
    return (
        <Pressable
            onPress={onPress}
            style={[
                styles.wrapToggle,
                {
                    backgroundColor: wrapLines
                        ? theme.colors.surfaceRipple
                        : 'transparent',
                },
            ]}
            hitSlop={8}
        >
            <Ionicons
                name="return-down-back-outline"
                size={16}
                color={theme.colors.textSecondary}
            />
        </Pressable>
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
    fileHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    fileHeaderText: {
        fontSize: 13,
        fontFamily: Typography.mono().fontFamily,
        fontWeight: '500',
        flexShrink: 1,
    },
    rangeText: {
        fontSize: 12,
        fontFamily: Typography.mono().fontFamily,
        marginLeft: 8,
    },
    wrapToggle: {
        padding: 4,
        borderRadius: 4,
        marginLeft: 8,
    },
    scrollArea: {
        flex: 1,
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
        paddingVertical: 8,
    },
    codeLinesContainer: {
        // Each child is a codeRow
    },
    codeRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    lineNumberCell: {
        alignItems: 'flex-end',
        paddingRight: 8,
        paddingLeft: 12,
    },
    lineNumber: {
        fontSize: 14,
        fontFamily: Typography.mono().fontFamily,
        lineHeight: 20,
        opacity: 0.5,
    },
    codeLineCell: {
        flex: 1,
        paddingRight: 12,
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
