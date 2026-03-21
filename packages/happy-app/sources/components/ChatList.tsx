import * as React from 'react';
import { useSession, useSessionMessages } from "@/sync/storage";
import { FlatList, Platform, View } from 'react-native';
import { useCallback } from 'react';
import { useHeaderHeight } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageView } from './MessageView';

import { Metadata, Session } from '@/sync/storageTypes';
import { ChatFooter } from './ChatFooter';
import { Message } from '@/sync/typesMessage';

export const ChatList = React.memo((props: { session: Session }) => {
    const { messages } = useSessionMessages(props.session.id);
    return (
        <ChatListInternal
            metadata={props.session.metadata}
            sessionId={props.session.id}
            messages={messages}
        />
    )
});

const ListHeader = React.memo(() => {
    const headerHeight = useHeaderHeight();
    const safeArea = useSafeAreaInsets();
    return <View style={{ flexDirection: 'row', alignItems: 'center', height: headerHeight + safeArea.top + 32 }} />;
});

const ListFooter = React.memo((props: { sessionId: string }) => {
    const session = useSession(props.sessionId)!;
    return (
        <ChatFooter controlledByUser={session.agentState?.controlledByUser || false} />
    )
});

// Lerp factor: each frame covers this portion of remaining distance.
// Higher = faster animation, lower = smoother.
const LERP_FACTOR = 0.03;

const ChatListInternal = React.memo((props: {
    metadata: Metadata | null,
    sessionId: string,
    messages: Message[],
}) => {
    const listRef = React.useRef<FlatList<Message>>(null);
    const isNearBottomRef = React.useRef(true);
    const scrollAnimRef = React.useRef(0);
    const webScrollNodeRef = React.useRef<HTMLElement | null>(null);
    const initialSnapDoneRef = React.useRef(false);

    // Capture scrollHeight DURING render (before React commits new DOM).
    // Only trigger on actual new agent messages (length increase), not content
    // reflow or user message echoes (already visible as pending).
    const preChangeScrollHeightRef = React.useRef(0);
    const prevMessageLenRef = React.useRef(props.messages.length);
    const settledRef = React.useRef(false);
    if (Platform.OS === 'web') {
        const prevLen = prevMessageLenRef.current;
        const curLen = props.messages.length;
        prevMessageLenRef.current = curLen;

        if (!settledRef.current) {
            // Skip initial batch load (mount / reopen) — no animation
            settledRef.current = prevLen > 0 || curLen > 0;
        } else if (curLen > prevLen) {
            // Check if newest message is from the agent (inverted: index 0 = newest)
            const newest = props.messages[0];
            const isAgentMessage = newest && newest.kind !== 'user-text';

            const node = webScrollNodeRef.current;
            // Also animate when a scroll animation is already running —
            // scrollTop may be > 150 mid-lerp but we're conceptually "at bottom".
            const isAnimating = scrollAnimRef.current !== 0;
            if (node && (node.scrollTop < 150 || isAnimating) && isAgentMessage) {
                preChangeScrollHeightRef.current = node.scrollHeight;
            } else {
                preChangeScrollHeightRef.current = 0;
            }
        }
    }

    // Grab the DOM scroll element, disable browser scroll anchoring,
    // and snap to bottom (scrollTop=0 in inverted list = newest messages).
    React.useEffect(() => {
        if (Platform.OS !== 'web') return;
        const node = (listRef.current as any)?.getScrollableNode?.() ?? null;
        if (node) {
            node.style.overflowAnchor = 'none';
            node.scrollTop = 0; // Snap to newest messages immediately
            webScrollNodeRef.current = node;
        }
        return () => {
            if (scrollAnimRef.current) {
                cancelAnimationFrame(scrollAnimRef.current);
                scrollAnimRef.current = 0;
            }
        };
    }, []);

    // Start or continue the scroll-to-0 animation loop (web only).
    // Exponential decay handles rapid messages naturally — new diffs
    // just add to scrollTop and the running loop picks them up.
    // Reads webScrollNodeRef.current inside the loop to avoid stale closures.
    const ensureAnimating = useCallback(() => {
        if (scrollAnimRef.current) return; // already running
        const step = () => {
            const node = webScrollNodeRef.current;
            if (!node) { scrollAnimRef.current = 0; return; }
            const pos = node.scrollTop;
            if (pos <= 1) {
                node.scrollTop = 0;
                scrollAnimRef.current = 0;
                return;
            }
            node.scrollTop = pos * (1 - LERP_FACTOR);
            scrollAnimRef.current = requestAnimationFrame(step);
        };
        scrollAnimRef.current = requestAnimationFrame(step);
    }, []);

    // Web: adjust scrollTop BEFORE the browser paints.
    // 1. Initial load: snap scrollTop=0 immediately (no animation)
    // 2. During render: captured pre-change scrollHeight (only on length increase)
    // 3. Here (after React commits DOM, before paint): compute diff, offset scrollTop
    // 4. Start lerp animation to reveal new message
    React.useLayoutEffect(() => {
        if (Platform.OS !== 'web') return;

        // One-time snap to bottom on initial load — no animation.
        // In inverted FlatList, scrollTop=0 = newest messages visible.
        if (!initialSnapDoneRef.current) {
            const node = webScrollNodeRef.current
                ?? (listRef.current as any)?.getScrollableNode?.() ?? null;
            if (node && props.messages.length > 0) {
                node.scrollTop = 0;
                if (!webScrollNodeRef.current) {
                    node.style.overflowAnchor = 'none';
                    webScrollNodeRef.current = node;
                }
                initialSnapDoneRef.current = true;
                return; // Skip animation on this exact snap render only
            }
        }

        const savedHeight = preChangeScrollHeightRef.current;
        // Always reset after consuming — prevents stale values on re-renders
        preChangeScrollHeightRef.current = 0;
        if (savedHeight === 0) return;

        const node = webScrollNodeRef.current;
        if (!node) return;

        const diff = node.scrollHeight - savedHeight;
        if (diff <= 0) return;

        // Offset scrollTop so existing messages stay visually pinned.
        // New message is hidden below the visual viewport (scaleY-1).
        node.scrollTop += diff;

        // Animate toward 0 to reveal new message sliding up.
        ensureAnimating();
    }); // no deps — must run on every render to catch the captured state

    const handleScroll = useCallback((e: any) => {
        // In an inverted FlatList, contentOffset.y ≈ 0 means newest messages visible
        isNearBottomRef.current = e.nativeEvent.contentOffset.y < 150;
    }, []);

    // Native: maintainVisibleContentPosition keeps old content stable,
    // we just animate to offset 0 to reveal the new message.
    const handleContentSizeChange = useCallback((_w: number, h: number) => {
        if (Platform.OS === 'web') return;
        if (isNearBottomRef.current) {
            listRef.current?.scrollToOffset({ offset: 0, animated: true });
        }
    }, []);

    const keyExtractor = useCallback((item: any) => item.id, []);
    const renderItem = useCallback(({ item }: { item: any }) => (
        <MessageView message={item} metadata={props.metadata} sessionId={props.sessionId} />
    ), [props.metadata, props.sessionId]);
    return (
        <FlatList
            ref={listRef}
            data={props.messages}
            inverted={true}
            keyExtractor={keyExtractor}
            onScroll={handleScroll}
            onContentSizeChange={handleContentSizeChange}
            scrollEventThrottle={100}
            maintainVisibleContentPosition={
                Platform.OS !== 'web' ? { minIndexForVisible: 0 } : undefined
            }
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            renderItem={renderItem}
            ListHeaderComponent={<ListFooter sessionId={props.sessionId} />}
            ListFooterComponent={<ListHeader />}
        />
    )
});
