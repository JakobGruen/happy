/**
 * Tests for the preview pane integration in QuestionSheetContent.
 * Verifies that OptionPreviewPane is rendered when options have preview content,
 * hidden when no options have preview, and updates when a different option is selected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// Stable form stub shared between the mock factory and tests.
// Declared via vi.hoisted so it is available in the hoisted vi.mock() factories.
const sharedFormStub = vi.hoisted(() => ({
    selections: new Map(),
    otherTexts: new Map(),
    activeTab: 0,
    setActiveTab: vi.fn(),
    isSubmitting: false,
    isSubmitted: false,
    allQuestionsAnswered: false,
    canInteract: true,
    handleOptionToggle: vi.fn(),
    handleOtherTextChange: vi.fn(),
    handleSubmit: vi.fn(),
    isQuestionAnswered: () => false,
}));

// --- React hooks mock: allow calling component as a plain function ---
// In React 19, the dispatcher is ReactSharedInternals.H (previously ReactCurrentDispatcher.current)
// We inject a fake dispatcher so useState/useCallback etc. work without a real renderer.
import * as ReactActual from 'react';

const fakeDispatcher = {
    useState: (initial: any) => [
        typeof initial === 'function' ? initial() : initial,
        vi.fn(),
    ],
    useCallback: (fn: any, _deps?: any) => fn,
    useEffect: (_fn: any, _deps?: any) => {},
    useMemo: (fn: any, _deps?: any) => fn(),
    useRef: (initial: any) => ({ current: initial }),
    useContext: (_ctx: any) => undefined,
    useReducer: (_reducer: any, initial: any) => [initial, vi.fn()],
    readContext: (_ctx: any) => undefined,
};

// React 19: internals live at __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H
const sharedInternals = (ReactActual as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
if (sharedInternals) {
    sharedInternals.H = fakeDispatcher;
}

// --- React Native mock ---
const MockView = ({ children, testID, style }: any) => ({ type: 'View', props: { children, testID, style } });
const MockText = ({ children, style, testID }: any) => ({ type: 'Text', props: { children, style, testID } });
const MockScrollView = ({ children, testID, style, contentContainerStyle, horizontal, showsVerticalScrollIndicator, showsHorizontalScrollIndicator, nestedScrollEnabled, keyboardShouldPersistTaps }: any) => ({
    type: 'ScrollView',
    props: { children, testID, style, contentContainerStyle, horizontal, showsVerticalScrollIndicator, showsHorizontalScrollIndicator, nestedScrollEnabled, keyboardShouldPersistTaps },
});
const MockTouchableOpacity = ({ children, onPress, disabled, style, activeOpacity, testID }: any) => ({
    type: 'TouchableOpacity',
    props: { children, onPress, disabled, style, activeOpacity, testID },
});
const MockActivityIndicator = ({ size, color }: any) => ({ type: 'ActivityIndicator', props: { size, color } });
const MockTextInput = (props: any) => ({ type: 'TextInput', props });

vi.mock('react-native', () => ({
    View: MockView,
    Text: MockText,
    ScrollView: MockScrollView,
    TouchableOpacity: MockTouchableOpacity,
    ActivityIndicator: MockActivityIndicator,
    TextInput: MockTextInput,
}));

// Reanimated mock — FadeIn animation + Animated.View
const MockAnimatedView = ({ children, testID, style, entering, keyProp }: any) => ({
    type: 'Animated.View',
    props: { children, testID, style, entering },
});

vi.mock('react-native-reanimated', () => ({
    default: {
        View: MockAnimatedView,
        createAnimatedComponent: (Component: any) => Component,
    },
    FadeIn: {
        duration: () => ({ duration: 200 }),
    },
}));

// WebView mock
function MockWebView(props: any) {
    return { type: 'WebView', props };
}

vi.mock('react-native-webview', () => ({
    default: MockWebView,
}));

// Unistyles mock
vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (fn: any) => (typeof fn === 'function' ? fn({ colors: { divider: '#e0e0e0', surface: '#fff', text: '#000', textSecondary: '#999', surfaceHighest: '#f5f5f5', radio: { active: '#007aff', dot: '#007aff' }, permissionButton: { deny: { background: '#ff3b30' } }, button: { primary: { background: '#007aff', tint: '#fff' } } } }) : fn),
    },
    useUnistyles: () => ({
        theme: {
            colors: {
                divider: '#e0e0e0',
                surface: '#fff',
                text: '#000',
                textSecondary: '#999',
                surfaceHighest: '#f5f5f5',
                radio: { active: '#007aff', dot: '#007aff' },
                permissionButton: { deny: { background: '#ff3b30' } },
                button: { primary: { background: '#007aff', tint: '#fff' } },
            },
        },
    }),
}));

// Ionicons mock
vi.mock('@expo/vector-icons', () => ({
    Ionicons: ({ name, size, color }: any) => ({ type: 'Ionicons', props: { name, size, color } }),
}));

// sessionAllow / sessionDeny mocks
vi.mock('@/sync/ops', () => ({
    sessionAllow: vi.fn().mockResolvedValue(undefined),
    sessionDeny: vi.fn().mockResolvedValue(undefined),
}));

// trackPermissionResponse mock
vi.mock('@/track', () => ({
    trackPermissionResponse: vi.fn(),
}));

// voiceQuestionBridge mock — subscribe returns a no-op unsubscribe
vi.mock('@/realtime/voiceQuestionBridge', () => ({
    subscribe: vi.fn(() => () => {}),
}));

// useQuestionFormState mock — returns a stable stub so the same spy references
// are accessible both in the mock factory and in test assertions.
// Also re-exports OTHER_INDEX constant which the component uses.
vi.mock('@/hooks/useQuestionFormState', () => ({
    OTHER_INDEX: -1,
    useQuestionFormState: () => sharedFormStub,
}));

// detectContentType mock
vi.mock('@/components/tools/modal/detectContentType', () => ({
    detectContentType: (value: string) => {
        if (typeof value !== 'string') return 'text';
        if (/^<[a-z][a-z0-9]*[\s/>]/.test(value.trimStart())) return 'html';
        return 'text';
    },
}));

// SimpleSyntaxHighlighter mock
vi.mock('@/components/SimpleSyntaxHighlighter', () => ({
    SimpleSyntaxHighlighter: ({ code, language }: any) => ({ type: 'SimpleSyntaxHighlighter', props: { code, language } }),
}));

// Typography mock
vi.mock('@/constants/Typography', () => ({
    Typography: { mono: () => ({ fontFamily: 'IBMPlexMono-Regular' }) },
}));

// OptionPreviewPane mock — renders a simple stub with the testID passed through
vi.mock('@/components/tools/OptionPreviewPane', () => ({
    OptionPreviewPane: ({ content, testID }: any) => ({
        type: 'OptionPreviewPane',
        props: { content, testID },
    }),
}));

// t() mock
vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

// Helper: recursively find a node by testID
function findByTestID(node: any, testID: string): any {
    if (!node || typeof node !== 'object') return null;
    // Handle arrays directly (e.g. children prop containing multiple elements)
    if (Array.isArray(node)) {
        for (const child of node) {
            const found = findByTestID(child, testID);
            if (found) return found;
        }
        return null;
    }
    if (node.props?.testID === testID) return node;
    const children = node.props?.children;
    if (Array.isArray(children)) {
        for (const child of children) {
            const found = findByTestID(child, testID);
            if (found) return found;
        }
    } else if (children) {
        return findByTestID(children, testID);
    }
    return null;
}

// Helper: recursively collect all nodes matching a predicate
function findAll(node: any, predicate: (n: any) => boolean): any[] {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) {
        return node.flatMap((child) => findAll(child, predicate));
    }
    const results: any[] = [];
    if (predicate(node)) results.push(node);
    const children = node.props?.children;
    if (Array.isArray(children)) {
        results.push(...children.flatMap((child: any) => findAll(child, predicate)));
    } else if (children) {
        results.push(...findAll(children, predicate));
    }
    return results;
}

// Helper: build a minimal permission item with questions
function makePermission(questions: any[]) {
    return {
        permissionId: 'perm-1',
        toolInput: { questions },
        toolName: 'AskUserQuestion',
        permission: { pending: true },
    };
}

describe('QuestionSheetContent — preview pane', () => {
    let QuestionSheetContent: any;

    beforeEach(async () => {
        vi.resetModules();
        // After resetModules, get fresh React and inject fake dispatcher
        const freshReact = await import('react') as any;
        const internals = freshReact.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
        if (internals) internals.H = fakeDispatcher;
        const mod = await import('../QuestionSheetContent');
        // QuestionSheetContent is wrapped in React.memo; unwrap to call as function
        const exported = (mod as any).QuestionSheetContent;
        QuestionSheetContent = exported.type ?? exported;
    });

    it('renders preview pane when first option has preview content', () => {
        const permission = makePermission([{
            header: 'Choose',
            question: 'Pick an option',
            multiSelect: false,
            options: [
                { label: 'Option A', preview: '<b>Preview A</b>' },
                { label: 'Option B' },
            ],
        }]);

        const output = QuestionSheetContent({ permission, sessionId: 'sess-1' });
        const previewPane = findByTestID(output, 'option-preview-pane');
        expect(previewPane).not.toBeNull();
    });

    it('does NOT render preview pane when no options have preview', () => {
        const permission = makePermission([{
            header: 'Choose',
            question: 'Pick an option',
            multiSelect: false,
            options: [
                { label: 'Option A' },
                { label: 'Option B' },
            ],
        }]);

        const output = QuestionSheetContent({ permission, sessionId: 'sess-1' });
        const previewPane = findByTestID(output, 'option-preview-pane');
        expect(previewPane).toBeNull();
    });

    it('renders preview pane at initial state when all options have preview', () => {
        // Both options have preview content — the pane is visible at initial render.
        const permission = makePermission([{
            header: 'Choose',
            question: 'Pick an option',
            multiSelect: false,
            options: [
                { label: 'Option A', preview: 'Preview A text' },
                { label: 'Option B', preview: 'Preview B text' },
            ],
        }]);

        // First render — default previewOptionIndex=0, so Option A's preview shows.
        const output = QuestionSheetContent({ permission, sessionId: 'sess-1' });
        const previewPane = findByTestID(output, 'option-preview-pane');
        expect(previewPane).not.toBeNull();
    });

    it('calls handleOptionToggle when an option button is pressed', () => {
        // Reset the spy so previous test calls don't interfere
        sharedFormStub.handleOptionToggle.mockClear();

        const permission = makePermission([{
            header: 'Choose',
            question: 'Pick an option',
            multiSelect: false,
            options: [
                { label: 'Option A', preview: 'Preview A text' },
                { label: 'Option B', preview: 'Preview B text' },
            ],
        }]);

        const output = QuestionSheetContent({ permission, sessionId: 'sess-1' });

        // Find all pressable nodes (React elements whose props include onPress)
        // JSX produces React elements with { type: MockTouchableOpacity, props: { onPress, ... } },
        // so we match by the presence of an onPress prop rather than a string type name.
        const buttons = findAll(output, (n) => typeof n.props?.onPress === 'function');
        expect(buttons.length).toBeGreaterThanOrEqual(1);

        // Press the second option button (index 1 — Option B)
        buttons[1].props.onPress();

        // handleOptionWithPreview calls form.handleOptionToggle(qIndex=0, oIndex=1, multiSelect=false)
        expect(sharedFormStub.handleOptionToggle).toHaveBeenCalledWith(0, 1, false);
    });
});
