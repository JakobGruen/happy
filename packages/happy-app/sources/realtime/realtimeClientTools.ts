import { z } from 'zod';
import { sync } from '@/sync/sync';
import { sessionAllow, sessionDeny } from '@/sync/ops';
import { storage } from '@/sync/storage';
import { trackPermissionResponse } from '@/track';
import { getCurrentRealtimeSessionId } from './RealtimeSession';

/**
 * Static client tools for the realtime voice interface.
 * These tools allow the voice assistant to interact with Claude Code.
 */
export const realtimeClientTools = {
    /**
     * Send a message to Claude Code
     */
    messageClaudeCode: async (parameters: unknown) => {
        // Parse and validate the message parameter using Zod
        const messageSchema = z.object({
            message: z.string().min(1, 'Message cannot be empty')
        });
        const parsedMessage = messageSchema.safeParse(parameters);

        if (!parsedMessage.success) {
            console.error('❌ Invalid message parameter:', parsedMessage.error);
            return "error (invalid message parameter)";
        }

        const message = parsedMessage.data.message;
        const sessionId = getCurrentRealtimeSessionId();
        
        if (!sessionId) {
            console.error('❌ No active session');
            return "error (no active session)";
        }
        
        console.log('🔍 messageClaudeCode called with:', message);
        console.log('📤 Sending message to session:', sessionId);
        sync.sendMessage(sessionId, message);
        return `Message delivered to Claude Code: "${message}". Briefly tell the user what you asked Claude to do and that it's working on it.`;
    },

    /**
     * Process a permission request from Claude Code
     */
    processPermissionRequest: async (parameters: unknown) => {
        const messageSchema = z.object({
            decision: z.enum(['allow', 'deny']),
            mode: z.enum(['default', 'acceptEdits', 'bypassPermissions']).optional()
        });
        const parsedMessage = messageSchema.safeParse(parameters);

        if (!parsedMessage.success) {
            console.error('❌ Invalid permission parameter:', parsedMessage.error);
            return "error (invalid parameter, expected decision: 'allow'|'deny', optional mode: 'default'|'acceptEdits'|'bypassPermissions')";
        }

        const { decision, mode } = parsedMessage.data;
        const sessionId = getCurrentRealtimeSessionId();

        if (!sessionId) {
            console.error('❌ No active session');
            return "error (no active session)";
        }

        console.log('🔍 processPermissionRequest called with:', decision, mode ? `mode=${mode}` : '');

        // Get the current session to check for permission requests
        const session = storage.getState().sessions[sessionId];
        const requests = session?.agentState?.requests;

        if (!requests || Object.keys(requests).length === 0) {
            console.error('❌ No active permission request');
            return "error (no active permission request)";
        }

        const requestId = Object.keys(requests)[0];

        try {
            if (decision === 'allow') {
                await sessionAllow(sessionId, requestId, mode);
                trackPermissionResponse(true);
            } else {
                await sessionDeny(sessionId, requestId, mode);
                trackPermissionResponse(false);
            }
            const modeMsg = mode ? ` Mode switched to ${mode}.` : '';
            return `Permission ${decision}ed.${modeMsg} Briefly confirm to the user.`;
        } catch (error) {
            console.error('❌ Failed to process permission:', error);
            return `error (failed to ${decision} permission)`;
        }
    }
};