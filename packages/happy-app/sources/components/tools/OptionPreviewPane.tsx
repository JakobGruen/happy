import React from 'react';
import { ScrollView, Text } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import WebView from 'react-native-webview';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { detectContentType } from '@/components/tools/modal/detectContentType';
import { Typography } from '@/constants/Typography';

interface OptionPreviewPaneProps {
    content: string;
    testID?: string;
}

/**
 * Renders option preview content with smart type detection.
 *
 * - HTML → WebView with injected theme CSS (light/dark aware)
 * - Code → SimpleSyntaxHighlighter in a ScrollView
 * - Text → monospace Text in a ScrollView
 *
 * Used inside QuestionSheetContent above the options list.
 */
export function OptionPreviewPane({ content, testID }: OptionPreviewPaneProps) {
    const { theme } = useUnistyles();
    const type = detectContentType(content);

    if (type === 'html') {
        const html = buildHtmlPage(content, theme.colors.surface, theme.colors.text);
        return (
            <WebView
                testID={testID}
                source={{ html }}
                style={styles.webview}
                scrollEnabled
                originWhitelist={['*']}
                javaScriptEnabled={false}
            />
        );
    }

    return (
        <ScrollView
            testID={testID}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator
        >
            {type === 'code' ? (
                <SimpleSyntaxHighlighter
                    code={content}
                    language={detectLanguage(content)}
                    selectable
                />
            ) : (
                <Text
                    selectable
                    style={[styles.plainText, { color: theme.colors.text }]}
                >
                    {content}
                </Text>
            )}
        </ScrollView>
    );
}

/**
 * Wraps an HTML fragment in a complete themed document.
 * Injects background/text colours so WebView respects dark mode.
 */
function buildHtmlPage(fragment: string, bgColor: string, textColor: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body {
      background: ${bgColor};
      color: ${textColor};
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      padding: 12px;
      margin: 0;
      word-wrap: break-word;
    }
    pre, code { font-family: monospace; font-size: 12px; }
    pre { overflow-x: auto; }
  </style>
</head>
<body>${fragment}</body>
</html>`;
}

/** Minimal language heuristic — mirrors logic in ContentFormatter. */
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
    webview: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 12,
    },
    plainText: {
        fontSize: 13,
        fontFamily: Typography.mono().fontFamily,
        lineHeight: 20,
    },
}));
