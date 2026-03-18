import { getCurrentRealtimeSessionId, getVoiceSession, isVoiceSessionStarted } from '../RealtimeSession';
import {
    formatNewLogSteps,
    formatNewMessages,
    formatNewSingleMessage,
    formatPermissionRequest,
    formatReadyEvent,
    formatSessionFocus,
    formatSessionFull,
    formatSessionOffline,
    formatSessionOnline
} from './contextFormatters';
import { startFlow, cleanup as cleanupVoiceQuestionBridge } from '../voiceQuestionBridge';
import { storage } from '@/sync/storage';
import { getAllCommands } from '@/sync/suggestionCommands';
import { Message } from '@/sync/typesMessage';
import { VOICE_CONFIG } from '../voiceConfig';
import type { Session } from '@/sync/storageTypes';
import { buildSessionState } from './voiceState';

/**
 * Centralized voice assistant hooks for multi-session context updates.
 * These hooks route app events to the voice assistant with formatted context updates.
 */

interface SessionMetadata {
    summary?: { text?: string };
    path?: string;
    machineId?: string;
    [key: string]: any;
}

/** Returns true only if the given sessionId matches the active voice session */
function isVoiceSession(sessionId: string): boolean {
    const voiceSessionId = getCurrentRealtimeSessionId();
    const match = voiceSessionId !== null && sessionId === voiceSessionId;
    if (!match && voiceSessionId !== null && VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.warn(`🎤 Voice: BLOCKED cross-session event (voice=${voiceSessionId}, incoming=${sessionId})`);
    }
    return match;
}

let shownSessions = new Set<string>();
let lastFocusSession: string | null = null;

// Debounce state for contextual updates
let pendingContextUpdate: string | null = null;
let contextDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Tool input storage for get_tool_details requests from voice agent
let toolInputStore: Map<string, { toolName: string; input: any; description: string | null }> = new Map();
let lastKnownLogStepKeys: Set<string> = new Set();
let lastKnownStatus: string | null = null;

// --- Progress tracking state ---
let progressIsWorking = false;
let progressLastUpdateAt = 0;
let progressNewMessageCount = 0;
let progressRecentSummaries: string[] = [];
let progressTimer: ReturnType<typeof setInterval> | null = null;
let progressTurnCompleteDelay: ReturnType<typeof setTimeout> | null = null;

function resetProgressState() {
    progressIsWorking = false;
    progressLastUpdateAt = 0;
    progressNewMessageCount = 0;
    progressRecentSummaries = [];
    if (progressTimer) {
        clearInterval(progressTimer);
        progressTimer = null;
    }
    if (progressTurnCompleteDelay) {
        clearTimeout(progressTurnCompleteDelay);
        progressTurnCompleteDelay = null;
    }
}

function storeToolInput(message: Message) {
    if (message.kind !== 'tool-call') return;
    const toolId = message.id;
    toolInputStore.set(toolId, {
        toolName: message.tool.name,
        input: message.tool.input,
        description: message.tool.description ?? null,
    });
    // Cap the store size
    if (toolInputStore.size > VOICE_CONFIG.MAX_TOOL_INPUT_STORE) {
        const oldest = toolInputStore.keys().next().value;
        if (oldest) toolInputStore.delete(oldest);
    }
}

function getMessageSummary(message: Message): string | null {
    if (message.kind === 'agent-text') {
        const preview = message.text.length > 80 ? message.text.slice(0, 80) + '...' : message.text;
        return `Claude said: "${preview}"`;
    } else if (message.kind === 'tool-call') {
        const desc = message.tool.description || message.tool.name;
        return `Using tool: ${desc}`;
    }
    return null;
}

/** Read the user's progress update interval setting (0 = disabled) */
function getProgressIntervalMs(): number {
    const seconds = storage.getState().settings.voiceProgressUpdateInterval;
    return seconds * 1000;
}

function sendTrigger(trigger: { type: string; [key: string]: any }) {
    if (!VOICE_CONFIG.ENABLE_PROACTIVE_SPEECH) return;
    // Respect user setting: 0 = disabled
    if (getProgressIntervalMs() === 0) return;
    const voice = getVoiceSession();
    if (!voice || !isVoiceSessionStarted()) return;
    if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('🎤 Voice: Sending trigger:', trigger.type);
    }
    voice.sendTrigger(JSON.stringify(trigger));
}

export function sendSessionState(session: Pick<Session, 'id' | 'metadata' | 'autoApproveTools' | 'thinking'>) {
    const voice = getVoiceSession();
    if (!voice) return;
    const state = buildSessionState(session);
    voice.sendState(JSON.stringify(state));
}

function checkAndSendProgressUpdate(sessionId: string) {
    if (!progressIsWorking) return;
    if (!isVoiceSessionStarted()) return;

    if (progressNewMessageCount >= VOICE_CONFIG.PROGRESS_MIN_NEW_MESSAGES) {
        const summary = progressRecentSummaries.join('. ') || 'Claude is still working.';

        sendTrigger({
            type: 'progress_update',
            sessionId,
            summary,
        });

        // Reset counters for next interval
        progressLastUpdateAt = Date.now();
        progressNewMessageCount = 0;
        progressRecentSummaries = [];
    }
}

// --- End progress tracking ---

function flushContextUpdate() {
    contextDebounceTimer = null;
    if (!pendingContextUpdate) return;
    const update = pendingContextUpdate;
    pendingContextUpdate = null;

    const voice = getVoiceSession();
    if (!voice || !isVoiceSessionStarted()) return;
    if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('🎤 Voice: Sending debounced context update:', update.slice(0, 120));
    }
    voice.sendContextualUpdate(update);
}

function reportContextualUpdate(update: string | null | undefined) {
    if (!update) return;
    if (!isVoiceSessionStarted()) return;

    if (pendingContextUpdate) {
        pendingContextUpdate += '\n' + update;
    } else {
        pendingContextUpdate = update;
    }
    if (!contextDebounceTimer) {
        contextDebounceTimer = setTimeout(flushContextUpdate, VOICE_CONFIG.CONTEXT_DEBOUNCE_MS);
    }
}

function reportTextUpdate(update: string | null | undefined) {
    if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('🎤 Voice: Reporting text update:', update);
    }
    if (!update) return;
    const voice = getVoiceSession();
    if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('🎤 Voice: Voice session:', voice);
    }
    if (!voice || !isVoiceSessionStarted()) return;
    voice.sendTextMessage(update);
}

function reportSession(sessionId: string) {
    if (!isVoiceSession(sessionId)) return;
    if (shownSessions.has(sessionId)) return;
    shownSessions.add(sessionId);
    const session = storage.getState().sessions[sessionId];
    if (!session) return;
    const messages = storage.getState().sessionMessages[sessionId]?.messages ?? [];
    const contextUpdate = formatSessionFull(session, messages);
    reportContextualUpdate(contextUpdate);
}

export const voiceHooks = {

    /**
     * Called when a session comes online/connects
     */
    onSessionOnline(sessionId: string, metadata?: SessionMetadata) {
        if (VOICE_CONFIG.DISABLE_SESSION_STATUS) return;
        if (!isVoiceSession(sessionId)) return;

        reportSession(sessionId);
        const contextUpdate = formatSessionOnline(sessionId, metadata);
        reportContextualUpdate(contextUpdate);
    },

    /**
     * Called when a session goes offline/disconnects
     */
    onSessionOffline(sessionId: string, metadata?: SessionMetadata) {
        if (VOICE_CONFIG.DISABLE_SESSION_STATUS) return;
        if (!isVoiceSession(sessionId)) return;

        reportSession(sessionId);
        const contextUpdate = formatSessionOffline(sessionId, metadata);
        reportContextualUpdate(contextUpdate);
    },


    /**
     * Called when user navigates to/views a session
     */
    onSessionFocus(sessionId: string, metadata?: SessionMetadata) {
        if (VOICE_CONFIG.DISABLE_SESSION_FOCUS) return;
        if (!isVoiceSession(sessionId)) return;
        if (lastFocusSession === sessionId) return;
        lastFocusSession = sessionId;
        reportSession(sessionId);
        reportContextualUpdate(formatSessionFocus(sessionId, metadata));
    },

    /**
     * Called when Claude requests permission for a tool use
     */
    onPermissionRequested(sessionId: string, requestId: string, toolName: string, toolArgs: any) {
        if (VOICE_CONFIG.DISABLE_PERMISSION_REQUESTS) return;
        if (!isVoiceSession(sessionId)) return;

        reportSession(sessionId);

        // AskUserQuestion: sequential voice flow via bridge (one question at a time)
        if (toolName === 'AskUserQuestion' && toolArgs?.questions) {
            const q1Text = startFlow(sessionId, requestId, toolArgs.questions);
            reportTextUpdate(q1Text);
        } else {
            reportTextUpdate(formatPermissionRequest(sessionId, requestId, toolName, toolArgs));
        }
    },

    /**
     * Called when agent sends a message/response
     */
    onMessages(sessionId: string, messages: Message[]) {
        if (VOICE_CONFIG.DISABLE_MESSAGES) return;
        if (!isVoiceSession(sessionId)) return;

        reportSession(sessionId);

        // Store tool inputs for later retrieval via get_tool_details
        for (const msg of messages) {
            storeToolInput(msg);
        }

        // Only forward non-tool messages (agent-text, user-text) as context.
        // Tool calls are now covered by logSteps + get_tool_details on demand.
        const nonToolMessages = messages.filter(m => m.kind !== 'tool-call');
        if (nonToolMessages.length > 0) {
            reportContextualUpdate(formatNewMessages(sessionId, nonToolMessages));
        }

        // --- Progress tracking ---
        if (!VOICE_CONFIG.ENABLE_PROACTIVE_SPEECH) return;
        if (!isVoiceSessionStarted()) return;
        const intervalMs = getProgressIntervalMs();
        if (intervalMs === 0) return; // User disabled progress updates

        // Enter working state on first messages
        if (!progressIsWorking) {
            progressIsWorking = true;
            progressLastUpdateAt = Date.now();
            progressNewMessageCount = 0;
            progressRecentSummaries = [];

            // Start periodic progress check using user-configured interval
            progressTimer = setInterval(() => {
                checkAndSendProgressUpdate(sessionId);
            }, intervalMs);
        }

        // Accumulate message summaries
        progressNewMessageCount += messages.length;
        for (const msg of messages) {
            const summary = getMessageSummary(msg);
            if (summary) {
                progressRecentSummaries.push(summary);
                // Keep only last 5 summaries
                if (progressRecentSummaries.length > 5) {
                    progressRecentSummaries.shift();
                }
            }
        }
    },

    /**
     * Called when voice session starts
     */
    onVoiceStarted(sessionId: string): string {
        if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log('🎤 Voice session started for:', sessionId);
        }
        // Defensive: clear any stale state from previous session
        if (contextDebounceTimer) {
            clearTimeout(contextDebounceTimer);
            contextDebounceTimer = null;
        }
        pendingContextUpdate = null;
        lastFocusSession = null;
        shownSessions.clear();
        resetProgressState();
        toolInputStore.clear();
        lastKnownStatus = null;

        const session = storage.getState().sessions[sessionId];
        // Initialize logStep tracking with current keys
        lastKnownLogStepKeys = new Set(
            Object.keys(session?.metadata?.logSteps ?? {})
        );

        let prompt = '';
        prompt += '[BACKGROUND — do not acknowledge or discuss this context]\n\n' + formatSessionFull(storage.getState().sessions[sessionId], storage.getState().sessionMessages[sessionId]?.messages ?? []);
        shownSessions.add(sessionId);

        // Include available slash commands for the agent
        const commands = getAllCommands(sessionId);
        if (commands.length > 0) {
            prompt += '\n\nAvailable slash commands:\n';
            for (const cmd of commands) {
                prompt += `- /${cmd.command}${cmd.description ? ': ' + cmd.description : ''}\n`;
            }
        }

        return prompt;
    },

    /**
     * Called when Claude Code finishes processing (ready event)
     */
    onReady(sessionId: string) {
        if (VOICE_CONFIG.DISABLE_READY_EVENTS) return;
        if (!isVoiceSession(sessionId)) return;

        reportSession(sessionId);

        // Send ready event as context (not chat) so it enriches context without double-triggering speech
        reportContextualUpdate(formatReadyEvent(sessionId));

        // Send proactive turn-complete trigger with a small delay
        // to let context updates settle before the agent speaks
        if (VOICE_CONFIG.ENABLE_PROACTIVE_SPEECH && isVoiceSessionStarted()) {
            progressTurnCompleteDelay = setTimeout(() => {
                sendTrigger({
                    type: 'turn_complete',
                    sessionId,
                });
                progressTurnCompleteDelay = null;
            }, 500);
        }

        // Reset progress tracking — Claude is done working
        progressIsWorking = false;
        progressNewMessageCount = 0;
        progressRecentSummaries = [];
        if (progressTimer) {
            clearInterval(progressTimer);
            progressTimer = null;
        }
    },

    /**
     * Called when session metadata changes (including logStep updates)
     */
    onMetadataChanged(sessionId: string, metadata: any) {
        if (!isVoiceSession(sessionId)) return;

        // Forward ephemeral status changes
        if (metadata?.currentStatus !== undefined && metadata.currentStatus !== lastKnownStatus) {
            lastKnownStatus = metadata.currentStatus;
            if (lastKnownStatus) {
                reportContextualUpdate(`Claude is now: ${lastKnownStatus}`);
            }
        }

        if (!metadata?.logSteps) return;

        const currentKeys = new Set(Object.keys(metadata.logSteps));
        const newKeys = [...currentKeys].filter(k => !lastKnownLogStepKeys.has(k));

        if (newKeys.length === 0) return;

        // Build a record of just the new steps
        const newSteps: Record<string, any> = {};
        for (const key of newKeys) {
            newSteps[key] = metadata.logSteps[key];
        }

        lastKnownLogStepKeys = currentKeys;

        reportContextualUpdate(formatNewLogSteps(sessionId, newSteps));
    },

    /**
     * Called when session thinking state changes (CC starts/stops working)
     */
    onThinkingChanged(sessionId: string, thinking: boolean) {
        if (!isVoiceSession(sessionId)) return;

        const session = storage.getState().sessions[sessionId];
        if (!session) return;
        sendSessionState(session);
    },

    /**
     * Called when voice session stops
     */
    onVoiceStopped() {
        if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log('🎤 Voice session stopped');
        }
        shownSessions.clear();
        lastFocusSession = null;
        cleanupVoiceQuestionBridge();
        resetProgressState();
        // Cancel any pending debounced update
        if (contextDebounceTimer) {
            clearTimeout(contextDebounceTimer);
            contextDebounceTimer = null;
        }
        pendingContextUpdate = null;
        toolInputStore.clear();
        lastKnownLogStepKeys.clear();
        lastKnownStatus = null;
    }
};

export function getStoredToolInput(toolId: string): { toolName: string; input: any; description: string | null } | null {
    return toolInputStore.get(toolId) ?? null;
}

/** Get the most recent tool inputs (for when voice agent doesn't have a specific ID) */
export function getRecentToolInputs(count: number = 5): Array<{ id: string; toolName: string; input: any; description: string | null }> {
    const entries = [...toolInputStore.entries()];
    return entries.slice(-count).map(([id, data]) => ({ id, ...data }));
}
