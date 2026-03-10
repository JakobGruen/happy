import * as React from "react";
import { View, Text, Pressable, Platform } from "react-native";
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { MarkdownView } from "./markdown/MarkdownView";
import { t } from '@/text';
import { Message, UserTextMessage, AgentTextMessage, ToolCallMessage } from "@/sync/typesMessage";
import { Metadata } from "@/sync/storageTypes";
import { layout } from "./layout";
import { ToolView } from "./tools/ToolView";
import { AgentEvent } from "@/sync/typesRaw";
import { sync } from '@/sync/sync';
import { Option } from './markdown/MarkdownView';
import { useSetting } from "@/sync/storage";
import { useRouter } from 'expo-router';

export const MessageView = (props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}) => {
  return (
    <View style={styles.messageContainer} renderToHardwareTextureAndroid={true}>
      <View style={styles.messageContent}>
        <RenderBlock
          message={props.message}
          metadata={props.metadata}
          sessionId={props.sessionId}
          getMessageById={props.getMessageById}
        />
      </View>
    </View>
  );
};

// RenderBlock function that dispatches to the correct component based on message kind
function RenderBlock(props: {
  message: Message;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}): React.ReactElement {
  switch (props.message.kind) {
    case 'user-text':
      return <UserTextBlock message={props.message} sessionId={props.sessionId} />;

    case 'agent-text':
      return <AgentTextBlock message={props.message} sessionId={props.sessionId} />;

    case 'tool-call':
      return <ToolCallBlock
        message={props.message}
        metadata={props.metadata}
        sessionId={props.sessionId}
        getMessageById={props.getMessageById}
      />;

    case 'agent-event':
      return <AgentEventBlock event={props.message.event} metadata={props.metadata} />;


    default:
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = props.message;
      throw new Error(`Unknown message kind: ${_exhaustive}`);
  }
}

function UserTextBlock(props: {
  message: UserTextMessage;
  sessionId: string;
}) {
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title);
  }, [props.sessionId]);

  if (props.message.commandName) {
    return <CommandMessageBlock message={props.message} sessionId={props.sessionId} />;
  }

  const images = props.message.imageAttachments;

  return (
    <View style={styles.userMessageContainer}>
      <View style={styles.userMessageBubble}>
        {images && images.length > 0 && (
          <View style={styles.userImageRow}>
            {images.map((img, i) => (
              <Image
                key={i}
                source={{ uri: `data:${img.mediaType};base64,${img.data}` }}
                style={{ width: 200, height: 150, borderRadius: 8 }}
                contentFit="cover"
              />
            ))}
          </View>
        )}
        {props.message.text ? (
          <MarkdownView markdown={props.message.displayText || props.message.text} onOptionPress={handleOptionPress} />
        ) : null}
      </View>
    </View>
  );
}

function CommandMessageBlock(props: {
  message: UserTextMessage;
  sessionId: string;
}) {
  const router = useRouter();

  const handlePress = React.useCallback(() => {
    router.push(`/session/${props.sessionId}/message/${props.message.id}`);
  }, [props.sessionId, props.message.id, router]);

  return (
    <View style={commandStyles.container}>
      <Pressable onPress={handlePress} style={commandStyles.header}>
        <View style={commandStyles.headerLeft}>
          <Ionicons name="sparkles-outline" size={18} style={commandStyles.icon} />
          <Text style={commandStyles.title} numberOfLines={1}>
            {props.message.commandName}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} style={commandStyles.chevron} />
      </Pressable>
    </View>
  );
}

function AgentTextBlock(props: {
  message: AgentTextMessage;
  sessionId: string;
}) {
  const experiments = useSetting('experiments');
  const handleOptionPress = React.useCallback((option: Option) => {
    sync.sendMessage(props.sessionId, option.title);
  }, [props.sessionId]);

  // Hide thinking messages unless experiments is enabled
  if (props.message.isThinking && !experiments) {
    return null;
  }

  return (
    <View style={[styles.agentMessageContainer, props.message.isThinking && { opacity: 0.3 }]}>
      <MarkdownView markdown={props.message.text} onOptionPress={handleOptionPress} />
    </View>
  );
}

function AgentEventBlock(props: {
  event: AgentEvent;
  metadata: Metadata | null;
}) {
  if (props.event.type === 'switch') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{t('message.switchedToMode', { mode: props.event.mode })}</Text>
      </View>
    );
  }
  if (props.event.type === 'message') {
    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>{props.event.message}</Text>
      </View>
    );
  }
  if (props.event.type === 'ready') {
    const { durationMs, numTurns, costUsd } = props.event;
    // Don't render anything if no stats available
    if (durationMs == null && numTurns == null && costUsd == null) return null;

    const parts: string[] = [];
    if (durationMs != null) {
      const seconds = durationMs / 1000;
      parts.push(seconds >= 60 ? `${(seconds / 60).toFixed(1)}m` : `${seconds.toFixed(1)}s`);
    }
    if (numTurns != null) {
      parts.push(`${numTurns} ${numTurns === 1 ? 'turn' : 'turns'}`);
    }
    if (costUsd != null) {
      parts.push(`$${costUsd.toFixed(3)}`);
    }

    return (
      <View style={statsStyles.container}>
        <Text style={statsStyles.text}>{parts.join(' · ')}</Text>
      </View>
    );
  }
  if (props.event.type === 'limit-reached') {
    const formatTime = (timestamp: number): string => {
      try {
        const date = new Date(timestamp * 1000); // Convert from Unix timestamp
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return t('message.unknownTime');
      }
    };

    return (
      <View style={styles.agentEventContainer}>
        <Text style={styles.agentEventText}>
          {t('message.usageLimitUntil', { time: formatTime(props.event.endsAt) })}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.agentEventContainer}>
      <Text style={styles.agentEventText}>{t('message.unknownEvent')}</Text>
    </View>
  );
}

function ToolCallBlock(props: {
  message: ToolCallMessage;
  metadata: Metadata | null;
  sessionId: string;
  getMessageById?: (id: string) => Message | null;
}) {
  if (!props.message.tool) {
    return null;
  }
  return (
    <View style={styles.toolContainer}>
      <ToolView
        tool={props.message.tool}
        metadata={props.metadata}
        messages={props.message.children}
        sessionId={props.sessionId}
        messageId={props.message.id}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  messageContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  messageContent: {
    flexDirection: 'column',
    flexGrow: 1,
    flexBasis: 0,
    maxWidth: layout.maxWidth,
  },
  userMessageContainer: {
    maxWidth: '100%',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  userMessageBubble: {
    backgroundColor: theme.colors.userMessageBackground,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '100%',
  },
  userImageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  agentMessageContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  agentEventContainer: {
    marginHorizontal: 8,
    alignItems: 'center',
    paddingVertical: 8,
  },
  agentEventText: {
    color: theme.colors.agentEventText,
    fontSize: 14,
  },
  toolContainer: {
    marginHorizontal: 8,
  },
  debugText: {
    color: theme.colors.agentEventText,
    fontSize: 12,
  },
}));

const statsStyles = StyleSheet.create((theme) => ({
  container: {
    paddingVertical: 4,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    opacity: 0.7,
  },
}));

const commandStyles = StyleSheet.create((theme) => ({
  container: {
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: theme.colors.surfaceHigh,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: theme.colors.surfaceHighest,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  icon: {
    color: theme.colors.text,
  },
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  chevron: {
    color: theme.colors.textSecondary,
  },
}));
