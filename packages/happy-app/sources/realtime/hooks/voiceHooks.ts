import { getCurrentRealtimeSessionId, getVoiceSession, isVoiceSessionStarted } from '../RealtimeSession';
import {
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

let shownSessions = new Set<string>();
let lastFocusSession: string | null = null;

// Debounce state for contextual updates
let pendingContextUpdate: string | null = null;
let contextDebounceTimer: ReturnType<typeof setTimeout> | null = null;

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

    pendingContextUpdate = update;
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
        
        reportSession(sessionId);
        const contextUpdate = formatSessionOnline(sessionId, metadata);
        reportContextualUpdate(contextUpdate);
    },

    /**
     * Called when a session goes offline/disconnects
     */
    onSessionOffline(sessionId: string, metadata?: SessionMetadata) {
        if (VOICE_CONFIG.DISABLE_SESSION_STATUS) return;
        
        reportSession(sessionId);
        const contextUpdate = formatSessionOffline(sessionId, metadata);
        reportContextualUpdate(contextUpdate);
    },


    /**
     * Called when user navigates to/views a session
     */
    onSessionFocus(sessionId: string, metadata?: SessionMetadata) {
        if (VOICE_CONFIG.DISABLE_SESSION_FOCUS) return;
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
        
        reportSession(sessionId);
        reportContextualUpdate(formatNewMessages(sessionId, messages));
    },

    /**
     * Called when voice session starts
     */
    onVoiceStarted(sessionId: string): string {
        if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log('🎤 Voice session started for:', sessionId);
        }
        shownSessions.clear();
        let prompt = '';
        prompt += 'THIS IS AN ACTIVE SESSION: \n\n' + formatSessionFull(storage.getState().sessions[sessionId], storage.getState().sessionMessages[sessionId]?.messages ?? []);
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
        
        reportSession(sessionId);
        reportTextUpdate(formatReadyEvent(sessionId));
    },

    /**
     * Called when voice session stops
     */
    onVoiceStopped() {
        if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log('🎤 Voice session stopped');
        }
        shownSessions.clear();
        cleanupVoiceQuestionBridge();
        // Cancel any pending debounced update
        if (contextDebounceTimer) {
            clearTimeout(contextDebounceTimer);
            contextDebounceTimer = null;
        }
        pendingContextUpdate = null;
    }
};