import * as React from 'react';
import { useSession, useSessionMessages } from "@/sync/storage";
import { ActivityIndicator, FlatList, Platform, View } from 'react-native';
import { useCallback } from 'react';
import { useHeaderHeight } from '@/utils/responsive';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageView } from './MessageView';
import { init as initAnimationQueue } from './messageAnimationQueue';
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

const ChatListInternal = React.memo((props: {
    metadata: Metadata | null,
    sessionId: string,
    messages: Message[],
}) => {
    const listRef = React.useRef<FlatList>(null);
    const prevCountRef = React.useRef(props.messages.length);
    const scrollOffsetRef = React.useRef(0);

    // Init animation queue synchronously (before children mount) so isReady() is
    // false during initial render — messages appear instantly instead of enqueuing.
    const animInitRef = React.useRef(false);
    if (!animInitRef.current) {
        animInitRef.current = true;
        initAnimationQueue();
    }

    // Smooth scroll to bottom when new messages arrive, only if already near bottom
    React.useEffect(() => {
        if (props.messages.length > prevCountRef.current && scrollOffsetRef.current < 150) {
            setTimeout(() => {
                listRef.current?.scrollToOffset({ offset: 0, animated: true });
            }, 50);
        }
        prevCountRef.current = props.messages.length;
    }, [props.messages.length]);

    const handleScroll = useCallback((e: any) => {
        scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
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
            scrollEventThrottle={100}
            maintainVisibleContentPosition={{
                minIndexForVisible: 0,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            renderItem={renderItem}
            ListHeaderComponent={<ListFooter sessionId={props.sessionId} />}
            ListFooterComponent={<ListHeader />}
        />
    )
});