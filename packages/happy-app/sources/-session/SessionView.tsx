import { AgentContentView } from '@/components/AgentContentView';
import { AgentInput } from '@/components/AgentInput';
import { PermissionModalOrchestrator } from '@/components/tools/PermissionModalOrchestrator';
import { isClaudeFlavor } from '@/components/tools/permissionUtils';
import {
    getAvailableModels,
    getAvailablePermissionModes,
    getAvailableEffortModes,
    getDefaultModelKey,
    getDefaultPermissionModeKey,
    getDefaultEffortKey,
    resolveCurrentOption,
} from '@/components/modelModeOptions';
import type { EffortMode } from '@/components/modelModeOptions';
import { getSuggestions } from '@/components/autocomplete/suggestions';
import { ChatHeaderView } from '@/components/ChatHeaderView';
import { ChatList } from '@/components/ChatList';
import { Deferred } from '@/components/Deferred';
import { EmptyMessages } from '@/components/EmptyMessages';
import { VoiceAssistantStatusBar } from '@/components/VoiceAssistantStatusBar';
import { useDraft } from '@/hooks/useDraft';
import { useImageAttachment } from '@/hooks/useImageAttachment';
import { Modal } from '@/modal';
import { voiceHooks, sendSessionState } from '@/realtime/hooks/voiceHooks';
import { startRealtimeSession, stopRealtimeSession } from '@/realtime/RealtimeSession';
import { buildSessionState } from '@/realtime/hooks/voiceState';
import { buildVoiceMessageContext } from '@/realtime/voiceMessageContext';
import { sendVoiceMessage, processVoiceMessageActions } from '@/sync/apiVoiceMessage';
import { randomUUID } from 'expo-crypto';
import { VoiceMessageBubble } from '@/components/voice/VoiceMessageBubble';
import { gitStatusSync } from '@/sync/gitStatusSync';
import { sessionAbort } from '@/sync/ops';
import { storage, useIsDataReady, useLocalSetting, useRealtimeStatus, useSessionMessages, useSessionUsage, useSetting } from '@/sync/storage';
import { useSession } from '@/sync/storage';
import { Session } from '@/sync/storageTypes';
import { apiSocket } from '@/sync/apiSocket';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { tracking, trackMessageSent } from '@/track';
import { isRunningOnMac } from '@/utils/platform';
import { useDeviceType, useHeaderHeight, useIsLandscape, useIsTablet } from '@/utils/responsive';
import { formatPathRelativeToHome, getSessionAvatarId, getSessionName, useSessionStatus } from '@/utils/sessionUtils';
import { isVersionSupported, MINIMUM_CLI_VERSION } from '@/utils/versionUtils';
import { useCanReactivateSession } from '@/hooks/useCanReactivateSession';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { useMemo } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnistyles } from 'react-native-unistyles';
import type { ModelMode, PermissionMode } from '@/components/PermissionModeSelector';
import { LogStepList } from '@/components/LogStepList';
import { SwipeablePager, PAGER_SPRING_CONFIG } from '@/components/SwipeablePager';
import { useSharedValue, withSpring } from 'react-native-reanimated';

export const SessionView = React.memo((props: { id: string }) => {
    const sessionId = props.id;
    const router = useRouter();
    const session = useSession(sessionId);
    const isDataReady = useIsDataReady();
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const isLandscape = useIsLandscape();
    const deviceType = useDeviceType();
    const headerHeight = useHeaderHeight();
    const realtimeStatus = useRealtimeStatus();
    const isTablet = useIsTablet();

    // Compute header props based on session state
    const headerProps = useMemo(() => {
        if (!isDataReady) {
            // Loading state - show empty header
            return {
                title: '',
                subtitle: undefined,
                avatarId: undefined,
                onAvatarPress: undefined,
                isConnected: false,
                flavor: null
            };
        }

        if (!session) {
            // Deleted state - show deleted message in header
            return {
                title: t('errors.sessionDeleted'),
                subtitle: undefined,
                avatarId: undefined,
                onAvatarPress: undefined,
                isConnected: false,
                flavor: null
            };
        }

        // Normal state - show session info
        const isConnected = session.presence === 'online';
        return {
            title: getSessionName(session),
            subtitle: session.metadata?.path ? formatPathRelativeToHome(session.metadata.path, session.metadata?.homeDir) : undefined,
            avatarId: getSessionAvatarId(session),
            onAvatarPress: () => router.push(`/session/${sessionId}/info`),
            isConnected: isConnected,
            flavor: session.metadata?.flavor || null,
            tintColor: isConnected ? '#000' : '#8E8E93'
        };
    }, [session, isDataReady, sessionId, router]);

    return (
        <>
            {/* Status bar shadow for landscape mode */}
            {isLandscape && deviceType === 'phone' && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: safeArea.top,
                    backgroundColor: theme.colors.surface,
                    zIndex: 1000,
                    shadowColor: theme.colors.shadow.color,
                    shadowOffset: {
                        width: 0,
                        height: 2,
                    },
                    shadowOpacity: theme.colors.shadow.opacity,
                    shadowRadius: 3,
                    elevation: 5,
                }} />
            )}

            {/* Header - always shown on desktop/Mac, hidden in landscape mode only on actual phones */}
            {!(isLandscape && deviceType === 'phone' && Platform.OS !== 'web') && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000
                }}>
                    <ChatHeaderView
                        {...headerProps}
                        onBackPress={() => router.back()}
                    />
                    {/* Voice status bar below header - not on tablet (shown in sidebar) */}
                    {!isTablet && realtimeStatus !== 'disconnected' && (
                        <VoiceAssistantStatusBar variant="full" />
                    )}
                </View>
            )}

            {/* Content based on state */}
            <View style={{ flex: 1, paddingTop: !(isLandscape && deviceType === 'phone' && Platform.OS !== 'web') ? safeArea.top + headerHeight + (!isTablet && realtimeStatus !== 'disconnected' ? 48 : 0) : 0 }}>
                {!isDataReady ? (
                    // Loading state
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                ) : !session ? (
                    // Deleted state
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="trash-outline" size={48} color={theme.colors.textSecondary} />
                        <Text style={{ color: theme.colors.text, fontSize: 20, marginTop: 16, fontWeight: '600' }}>{t('errors.sessionDeleted')}</Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 15, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>{t('errors.sessionDeletedDescription')}</Text>
                    </View>
                ) : (
                    // Normal session view
                    <SessionViewLoaded key={sessionId} sessionId={sessionId} session={session} />
                )}
            </View>
        </>
    );
});


function SessionViewLoaded({ sessionId, session }: { sessionId: string, session: Session }) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const safeArea = useSafeAreaInsets();
    const isLandscape = useIsLandscape();
    const deviceType = useDeviceType();
    const [message, setMessage] = React.useState('');
    const [activeView, setActiveView] = React.useState<'chat' | 'log'>('chat');
    const pageOffset = useSharedValue(0);
    // animate=true for pill tap; false when swipe already animated on the UI thread
    const handleViewChange = React.useCallback((view: 'chat' | 'log', animate = true) => {
        setActiveView(view);
        if (animate) {
            pageOffset.value = withSpring(view === 'chat' ? 0 : 1, PAGER_SPRING_CONFIG);
        }
    }, [pageOffset]);
    const realtimeStatus = useRealtimeStatus();
    const { messages, isLoaded } = useSessionMessages(sessionId);
    const acknowledgedCliVersions = useLocalSetting('acknowledgedCliVersions');

    // Check if CLI version is outdated and not already acknowledged
    const cliVersion = session.metadata?.version;
    const machineId = session.metadata?.machineId;
    const isCliOutdated = cliVersion && !isVersionSupported(cliVersion, MINIMUM_CLI_VERSION);
    const isAcknowledged = machineId && acknowledgedCliVersions[machineId] === cliVersion;
    const shouldShowCliWarning = isCliOutdated && !isAcknowledged;
    const flavor = session.metadata?.flavor;

    // Session reactivation — show banner when session is archived but can be revived
    const { canReactivate, reactivating, performReactivate } = useCanReactivateSession(session, {
        onSuccess: (newSessionId) => {
            if (newSessionId !== session.id) {
                // Fallback: new session created (reactivation fell back) — navigate to it
                router.replace(`/session/${newSessionId}`, {
                    dangerouslySingular() { return 'session'; },
                });
            }
            // else: same session reactivated in-place — stay here
            // Session's active field will flip via server update broadcast,
            // canReactivate becomes false, banner disappears, input re-enables
        },
    });
    const availableModels = React.useMemo(() => (
        getAvailableModels(flavor, session.metadata, t)
    ), [flavor, session.metadata]);
    const availableModes = React.useMemo(() => (
        getAvailablePermissionModes(flavor, session.metadata, t)
    ), [flavor, session.metadata]);

    const permissionMode = React.useMemo<PermissionMode | null>(() => (
        resolveCurrentOption(availableModes, [
            session.metadata?.currentOperatingModeCode,   // CC is source of truth
            session.permissionMode,                       // fallback before metadata arrives
            getDefaultPermissionModeKey(flavor),
        ])
    ), [availableModes, session.permissionMode, session.metadata?.currentOperatingModeCode, flavor]);

    const modelMode = React.useMemo<ModelMode | null>(() => (
        resolveCurrentOption(availableModels, [
            session.metadata?.currentModelCode,           // CC is source of truth
            session.modelMode,                            // fallback before metadata arrives
            getDefaultModelKey(flavor),
        ])
    ), [availableModels, session.modelMode, session.metadata?.currentModelCode, flavor]);
    const availableEffort = React.useMemo(() => (
        getAvailableEffortModes(flavor, session.metadata, t)
    ), [flavor, session.metadata]);
    const effortMode = React.useMemo<EffortMode | null>(() => (
        resolveCurrentOption(availableEffort, [
            session.metadata?.currentEffortCode,           // CC is source of truth
            session.effortMode,                            // fallback before metadata arrives
            getDefaultEffortKey(flavor),
        ])
    ), [availableEffort, session.effortMode, session.metadata?.currentEffortCode, flavor]);
    const sessionStatus = useSessionStatus(session);
    const sessionUsage = useSessionUsage(sessionId);
    const alwaysShowContextSize = useSetting('alwaysShowContextSize');
    const experiments = useSetting('experiments');

    // Use draft hook for auto-saving message drafts
    const { clearDraft } = useDraft(sessionId, message, setMessage);

    // Image attachment support
    const { attachments, pickImage, addRawAttachment, removeAttachment, clearAttachments } = useImageAttachment();

    // Handle dismissing CLI version warning
    const handleDismissCliWarning = React.useCallback(() => {
        if (machineId && cliVersion) {
            storage.getState().applyLocalSettings({
                acknowledgedCliVersions: {
                    ...acknowledgedCliVersions,
                    [machineId]: cliVersion
                }
            });
        }
    }, [machineId, cliVersion, acknowledgedCliVersions]);

    // Function to update permission mode — send RPC to CLI, retry if not confirmed after 2s
    const updatePermissionMode = React.useCallback((mode: PermissionMode) => {
        const sendRPC = () => apiSocket.sessionRPC(sessionId, 'switch-permission-mode', { mode: mode.key });
        sendRPC().then(() => {
            setTimeout(() => {
                const s = storage.getState().sessions[sessionId];
                if (s?.metadata?.currentOperatingModeCode !== mode.key) {
                    sendRPC().catch(() => storage.getState().updateSessionPermissionMode(sessionId, mode.key));
                }
            }, 2000);
        }).catch(() => storage.getState().updateSessionPermissionMode(sessionId, mode.key));
    }, [sessionId]);

    // Function to update model — send RPC to CLI, retry if not confirmed after 2s
    const updateModelMode = React.useCallback((mode: ModelMode) => {
        const sendRPC = () => apiSocket.sessionRPC(sessionId, 'switch-model', { model: mode.key });
        sendRPC().then(() => {
            setTimeout(() => {
                const s = storage.getState().sessions[sessionId];
                if (s?.metadata?.currentModelCode !== mode.key) {
                    sendRPC().catch(() => storage.getState().updateSessionModelMode(sessionId, mode.key));
                }
            }, 2000);
        }).catch(() => storage.getState().updateSessionModelMode(sessionId, mode.key));
    }, [sessionId]);

    // Function to update effort level — send RPC to CLI, retry if not confirmed after 2s
    const updateEffortMode = React.useCallback((mode: EffortMode) => {
        const sendRPC = () => apiSocket.sessionRPC(sessionId, 'switch-effort', { effort: mode.key });
        sendRPC().then(() => {
            setTimeout(() => {
                const s = storage.getState().sessions[sessionId];
                if (s?.metadata?.currentEffortCode !== mode.key) {
                    sendRPC().catch(() => storage.getState().updateSessionEffortMode(sessionId, mode.key));
                }
            }, 2000);
        }).catch(() => storage.getState().updateSessionEffortMode(sessionId, mode.key));
    }, [sessionId]);

    // Function to update auto-approve tools toggle — sync to CLI via same RPC
    const updateAutoApproveTools = React.useCallback((enabled: boolean) => {
        storage.getState().updateSessionAutoApproveTools(sessionId, enabled);
        const currentMode = permissionMode?.key ?? 'default';
        apiSocket.sessionRPC(sessionId, 'switch-permission-mode', { mode: currentMode, autoApproveTools: enabled }).catch(() => {});
    }, [sessionId, permissionMode]);

    // Memoize header-dependent styles to prevent re-renders
    const headerDependentStyles = React.useMemo(() => ({
        contentContainer: {
            flex: 1
        },
        flatListStyle: {
            marginTop: 0 // No marginTop needed since header is handled by parent
        },
    }), []);


    // Handle microphone button press - memoized to prevent button flashing
    const handleMicrophonePress = React.useCallback(async () => {
        if (realtimeStatus === 'connecting') {
            return; // Prevent actions during transitions
        }
        if (realtimeStatus === 'disconnected' || realtimeStatus === 'error') {
            try {
                const initialPrompt = voiceHooks.onVoiceStarted(sessionId);
                // session intentionally omitted from deps — metadata change effect sends correct state immediately after connect
                const initialState = session ? JSON.stringify(buildSessionState(session)) : undefined;
                await startRealtimeSession(sessionId, initialPrompt, initialState);
                tracking?.capture('voice_session_started', { sessionId });
            } catch (error) {
                console.error('Failed to start realtime session:', error);
                Modal.alert(t('common.error'), t('errors.voiceSessionFailed'));
                tracking?.capture('voice_session_error', { error: error instanceof Error ? error.message : 'Unknown error' });
            }
        } else if (realtimeStatus === 'connected') {
            await stopRealtimeSession();
            tracking?.capture('voice_session_stopped');

            // Notify voice assistant about voice session stop
            voiceHooks.onVoiceStopped();
        }
    }, [realtimeStatus, sessionId]);

    // Voice agent props (interactive Pipecat session — replaces old micButtonState)
    const voiceAgentProps = useMemo(() => ({
        onVoiceAgentPress: handleMicrophonePress,
        isVoiceAgentActive: realtimeStatus === 'connected' || realtimeStatus === 'connecting',
        isVoiceAgentConnecting: realtimeStatus === 'connecting',
    }), [handleMicrophonePress, realtimeStatus]);

    // Voice message props (fire-and-forget)
    const [isVoiceMessageSending, setIsVoiceMessageSending] = React.useState(false);

    const handleVoiceMessageSend = React.useCallback(async (audioUri: string) => {
        if (!session) return;
        setIsVoiceMessageSending(true);
        try {
            const context = buildVoiceMessageContext(session);
            const result = await sendVoiceMessage(audioUri, context);
            // Save to persistent storage (appears in ChatList)
            sync.saveVoiceMessage(sessionId, {
                id: randomUUID(),
                createdAt: Date.now(),
                transcript: result.transcript,
                summary: result.summary,
                actions: result.actions,
            });
            // Process deferred actions (message_claude_code, permissions, etc.)
            processVoiceMessageActions(sessionId, result.actions).catch(err => {
                console.error('[VoiceMessage] Failed to process deferred actions:', err);
            });
            tracking?.capture('voice_message_sent', {
                sessionId,
                toolCount: result.actions.length,
            });
        } catch (error) {
            console.error('[VoiceMessage] Failed:', error);
            const detail = error instanceof Error ? error.message : String(error);
            Modal.alert(t('common.error'), `${t('voiceMessage.failed')}\n\n${detail}`);
        } finally {
            setIsVoiceMessageSending(false);
        }
    }, [session, sessionId]);

    const voiceMessageProps = useMemo(() => ({
        onVoiceMessageSend: handleVoiceMessageSend,
        isVoiceMessageSending,
        isVoiceMessageEnabled: true,
    }), [handleVoiceMessageSend, isVoiceMessageSending]);

    // Trigger session visibility and initialize git status sync
    React.useLayoutEffect(() => {

        // Trigger session sync
        sync.onSessionVisible(sessionId);


        // Initialize git status sync for this session
        gitStatusSync.getSync(sessionId);
    }, [sessionId, realtimeStatus]);

    // Send session state to voice agent when metadata changes
    React.useEffect(() => {
        if (!session?.metadata) return;
        if (realtimeStatus !== 'connected') return;
        sendSessionState(session);
    }, [
        session?.metadata?.currentModelCode,
        session?.metadata?.currentOperatingModeCode,
        session?.metadata?.autoApproveTools,
        session?.autoApproveTools,
        realtimeStatus,
    ]);

    const summaryText = session.metadata?.summary?.text;

    const chatPage = (
        <Deferred>
            {messages.length > 0 && (
                <ChatList session={session} />
            )}
        </Deferred>
    );

    const logPage = <LogStepList metadata={session.metadata} />;

    let content = (
        <View style={{ flex: 1 }}>
            {summaryText && (
                <View style={{
                    paddingHorizontal: 16,
                    paddingVertical: 6,
                    marginBottom: 4,
                }}>
                    <Text style={{
                        fontSize: 13,
                        color: theme.colors.textSecondary,
                        lineHeight: 18,
                    }} numberOfLines={3}>
                        {summaryText}
                    </Text>
                </View>
            )}
            <SwipeablePager
                leftPage={chatPage}
                rightPage={logPage}
                pageOffset={pageOffset}
                onPageChange={(index) => handleViewChange(index === 0 ? 'chat' : 'log', false)}
            />
        </View>
    );
    const placeholder = activeView === 'chat' && messages.length === 0 ? (
        <>
            {isLoaded ? (
                <EmptyMessages session={session} />
            ) : (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            )}
        </>
    ) : null;

    const input = (
        <>
            {/* Reactivation banner — in-flow above input when session is archived */}
            {canReactivate && (
                <View style={{
                    backgroundColor: theme.colors.success,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {reactivating ? (
                        <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                    ) : (
                        <Ionicons name="play-circle-outline" size={16} color="#fff" style={{ marginRight: 8 }} />
                    )}
                    <Text style={{ color: '#fff', fontSize: 13, marginRight: 12 }}>
                        {t('session.sessionArchived')}
                    </Text>
                    <Pressable
                        onPress={performReactivate}
                        disabled={reactivating}
                        style={{
                            backgroundColor: 'rgba(255,255,255,0.25)',
                            borderRadius: 6,
                            paddingHorizontal: 12,
                            paddingVertical: 5,
                            opacity: reactivating ? 0.6 : 1,
                        }}
                    >
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                            {reactivating ? t('session.reactivating') : t('session.reactivateSession')}
                        </Text>
                    </Pressable>
                </View>
            )}
            {/* Voice message processing indicator (results persist in ChatList) */}
            {isVoiceMessageSending && (
                <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                    <VoiceMessageBubble isProcessing={true} />
                </View>
            )}
            <AgentInput
                placeholder={t('session.inputPlaceholder')}
                value={message}
                onChangeText={setMessage}
                sessionId={sessionId}
                permissionMode={permissionMode}
                onPermissionModeChange={updatePermissionMode}
                availableModes={availableModes}
                autoApproveTools={session.metadata?.autoApproveTools ?? session.autoApproveTools ?? false}
                onAutoApproveToolsChange={flavor === 'claude' || !flavor ? updateAutoApproveTools : undefined}
                modelMode={modelMode}
                availableModels={availableModels}
                onModelModeChange={updateModelMode}
                effortMode={effortMode}
                availableEffort={availableEffort}
                onEffortModeChange={updateEffortMode}
                metadata={session.metadata}
                isSendDisabled={!session.active}
                activeView={activeView}
                onViewChange={handleViewChange}
                pageOffset={pageOffset}
                connectionStatus={{
                    text: sessionStatus.statusText,
                    color: sessionStatus.statusColor,
                    dotColor: sessionStatus.statusDotColor,
                    isPulsing: sessionStatus.isPulsing
                }}
                attachments={attachments}
                onPickImage={pickImage}
                onRemoveAttachment={removeAttachment}
                onAddRawAttachment={addRawAttachment}
                onSend={() => {
                    if (message.trim() || attachments.length > 0) {
                        const imageData = attachments.length > 0
                            ? attachments.map(a => ({ base64: a.base64, mediaType: a.mediaType }))
                            : undefined;
                        setMessage('');
                        clearDraft();
                        clearAttachments();
                        sync.sendMessage(sessionId, message, imageData);
                        trackMessageSent();
                    }
                }}
                onVoiceAgentPress={voiceAgentProps.onVoiceAgentPress}
                isVoiceAgentActive={voiceAgentProps.isVoiceAgentActive}
                isVoiceAgentConnecting={voiceAgentProps.isVoiceAgentConnecting}
                onVoiceMessageSend={voiceMessageProps.onVoiceMessageSend}
                isVoiceMessageSending={voiceMessageProps.isVoiceMessageSending}
                isVoiceMessageEnabled={voiceMessageProps.isVoiceMessageEnabled}
                onAbort={() => sessionAbort(sessionId)}
                showAbortButton={sessionStatus.state === 'thinking' || sessionStatus.state === 'waiting'}
                onFileViewerPress={experiments ? () => router.push(`/session/${sessionId}/files`) : undefined}
                // Autocomplete configuration
                autocompletePrefixes={['@', '/']}
                autocompleteSuggestions={(query) => getSuggestions(sessionId, query)}
                usageData={sessionUsage ? {
                    inputTokens: sessionUsage.inputTokens,
                    outputTokens: sessionUsage.outputTokens,
                    cacheCreation: sessionUsage.cacheCreation,
                    cacheRead: sessionUsage.cacheRead,
                    contextSize: sessionUsage.contextSize
                } : session.latestUsage ? {
                    inputTokens: session.latestUsage.inputTokens,
                    outputTokens: session.latestUsage.outputTokens,
                    cacheCreation: session.latestUsage.cacheCreation,
                    cacheRead: session.latestUsage.cacheRead,
                    contextSize: session.latestUsage.contextSize
                } : undefined}
                alwaysShowContextSize={alwaysShowContextSize}
            />
        </>
    );


    const isClaude = isClaudeFlavor(session.metadata?.flavor);

    const wrapWithOrchestrator = (content: React.ReactNode) => {
        if (isClaude) {
            return (
                <PermissionModalOrchestrator sessionId={sessionId}>
                    {content}
                </PermissionModalOrchestrator>
            );
        }
        return content;
    };

    return wrapWithOrchestrator(
        <>
            {/* CLI Version Warning Overlay - Subtle centered pill */}
            {shouldShowCliWarning && !(isLandscape && deviceType === 'phone') && (
                <Pressable
                    onPress={handleDismissCliWarning}
                    style={{
                        position: 'absolute',
                        top: 8, // Position at top of content area (padding handled by parent)
                        alignSelf: 'center',
                        backgroundColor: '#FFF3CD',
                        borderRadius: 100, // Fully rounded pill
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        flexDirection: 'row',
                        alignItems: 'center',
                        zIndex: 998, // Below voice bar but above content
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 4,
                        elevation: 4,
                    }}
                >
                    <Ionicons name="warning-outline" size={14} color="#FF9500" style={{ marginRight: 6 }} />
                    <Text style={{
                        fontSize: 12,
                        color: '#856404',
                        fontWeight: '600'
                    }}>
                        {t('sessionInfo.cliVersionOutdated')}
                    </Text>
                    <Ionicons name="close" size={14} color="#856404" style={{ marginLeft: 8 }} />
                </Pressable>
            )}

            {/* Main content area - no padding since header is overlay */}
            <View style={{ flexBasis: 0, flexGrow: 1, paddingBottom: safeArea.bottom + ((isRunningOnMac() || Platform.OS === 'web') ? 32 : 0) }}>
                <AgentContentView
                    content={content}
                    input={input}
                    placeholder={placeholder}
                />
            </View >

            {/* Back button for landscape phone mode when header is hidden */}
            {
                isLandscape && deviceType === 'phone' && (
                    <Pressable
                        onPress={() => router.back()}
                        style={{
                            position: 'absolute',
                            top: safeArea.top + 8,
                            left: 16,
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: `rgba(${theme.dark ? '28, 23, 28' : '255, 255, 255'}, 0.9)`,
                            alignItems: 'center',
                            justifyContent: 'center',
                            ...Platform.select({
                                ios: {
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.1,
                                    shadowRadius: 4,
                                },
                                android: {
                                    elevation: 2,
                                }
                            }),
                        }}
                        hitSlop={15}
                    >
                        <Ionicons
                            name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                            size={Platform.select({ ios: 28, default: 24 })}
                            color="#000"
                        />
                    </Pressable>
                )
            }
        </>
    )
}
