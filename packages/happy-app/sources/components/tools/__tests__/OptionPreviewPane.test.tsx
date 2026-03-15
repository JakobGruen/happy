/**
 * Unit tests for OptionPreviewPane.
 * Verifies content-type-based rendering dispatch without asserting internal
 * implementation details of each renderer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// --- React Native mock ---
const MockView = ({ children, testID }: any) => ({ type: 'View', props: { children, testID } });
const MockText = ({ children, style, testID }: any) => ({ type: 'Text', props: { children, style, testID } });
const MockScrollView = ({ children, testID, style, contentContainerStyle }: any) => ({
    type: 'ScrollView',
    props: { children, testID, style, contentContainerStyle },
});

vi.mock('react-native', () => ({
    View: MockView,
    Text: MockText,
    ScrollView: MockScrollView,
}));

// WebView mock — named so we can identify it in element type checks
function MockWebView(props: any) {
    return { type: 'WebView', props };
}

vi.mock('react-native-webview', () => ({
    default: MockWebView,
}));

// Unistyles mock
vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (fn: any) => (typeof fn === 'function' ? fn({}) : fn),
    },
    useUnistyles: () => ({
        theme: { colors: { surface: '#ffffff', text: '#000000' } },
    }),
}));

// SimpleSyntaxHighlighter mock
function MockSyntaxHighlighter({ code, language }: any) {
    return { type: 'SimpleSyntaxHighlighter', props: { code, language } };
}

vi.mock('@/components/SimpleSyntaxHighlighter', () => ({
    SimpleSyntaxHighlighter: MockSyntaxHighlighter,
}));

// Typography mock
vi.mock('@/constants/Typography', () => ({
    Typography: { mono: () => ({ fontFamily: 'IBMPlexMono-Regular' }) },
}));

// detectContentType mock — mirrors real implementation heuristics
vi.mock('@/components/tools/modal/detectContentType', () => ({
    detectContentType: (value: string) => {
        if (typeof value !== 'string') return 'text';
        if (/^<[a-z][a-z0-9]*[\s/>]/.test(value.trimStart())) return 'html';
        if (/\b(const|let|var)\s+\w+\s*=/.test(value)) return 'code';
        return 'text';
    },
}));

describe('OptionPreviewPane', () => {
    let OptionPreviewPane: any;

    beforeEach(async () => {
        vi.resetModules();
        const mod = await import('../OptionPreviewPane');
        OptionPreviewPane = mod.OptionPreviewPane;
    });

    it('renders a WebView for HTML content', () => {
        const output = OptionPreviewPane({ content: '<div>hello</div>', testID: 'preview' });
        // HTML content should produce a React element whose type is the WebView component
        // output.type is the constructor function (React.createElement stores the component reference)
        expect(output.type).toBe(MockWebView);
    });

    it('does NOT render a WebView for code content', () => {
        const output = OptionPreviewPane({ content: 'const x = 5;', testID: 'preview' });
        // Code content uses ScrollView — no WebView
        expect(output.type).toBe(MockScrollView);
        // The child should be SimpleSyntaxHighlighter (not plain Text)
        const child = output.props.children;
        expect(child.type).toBe(MockSyntaxHighlighter);
    });

    it('renders plain text for text content', () => {
        const output = OptionPreviewPane({ content: 'plain text content', testID: 'preview' });
        // Text content uses ScrollView
        expect(output.type).toBe(MockScrollView);
        // The child should be a Text element (not SimpleSyntaxHighlighter)
        const child = output.props.children;
        expect(child.type).toBe(MockText);
        expect(child.props.children).toBe('plain text content');
    });

    it('renders without crashing for an empty string', () => {
        expect(() => OptionPreviewPane({ content: '', testID: 'preview' })).not.toThrow();
    });
});
