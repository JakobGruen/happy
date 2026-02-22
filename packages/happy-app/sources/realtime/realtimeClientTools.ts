import { z } from 'zod';
import { sync } from '@/sync/sync';
import { sessionAbort, sessionAllow, sessionDeny } from '@/sync/ops';
import { storage } from '@/sync/storage';
import { trackPermissionResponse } from '@/track';
import { getCurrentRealtimeSessionId } from './RealtimeSession';
import { recordAnswer, confirmAndSubmit, resetFlow, isFlowActive } from './voiceQuestionBridge';

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
            const verb = decision === 'allow' ? 'allowed' : 'denied';
            return `Permission ${verb}.${modeMsg} Briefly confirm to the user.`;
        } catch (error) {
            console.error('❌ Failed to process permission:', error);
            return `error (failed to ${decision} permission)`;
        }
    },

    /**
     * Abort/interrupt the current Claude Code operation
     */
    abortClaudeCode: async () => {
        const sessionId = getCurrentRealtimeSessionId();
        if (!sessionId) {
            console.error('❌ No active session');
            return "error (no active session)";
        }

        console.log('🔍 abortClaudeCode called for session:', sessionId);

        try {
            await sessionAbort(sessionId);
            return "Claude Code interrupted. Briefly confirm to the user.";
        } catch (error) {
            console.error('❌ Failed to abort:', error);
            return "error (failed to abort)";
        }
    },

    /**
     * Answer a single question in the sequential voice flow.
     * Returns the next question text or a summary for confirmation.
     */
    answerSingleQuestion: async (parameters: unknown) => {
        const schema = z.object({
            questionIndex: z.number(),
            header: z.string(),
            selectedLabels: z.array(z.string().min(1)),
        });
        const parsed = schema.safeParse(parameters);

        if (!parsed.success) {
            console.error('❌ Invalid answerSingleQuestion parameter:', parsed.error);
            return "error (invalid parameters, expected {questionIndex, header, selectedLabels})";
        }

        if (!isFlowActive()) {
            return "error (no active question flow)";
        }

        const { questionIndex, header, selectedLabels } = parsed.data;
        console.log('🔍 answerSingleQuestion called:', questionIndex, header, selectedLabels);

        return recordAnswer(questionIndex, header, selectedLabels);
    },

    /**
     * Confirm all answers and submit to Claude Code.
     */
    confirmQuestionAnswers: async () => {
        if (!isFlowActive()) {
            return "error (no active question flow)";
        }
        return await confirmAndSubmit();
    },

    /**
     * Reject answers and restart from Q1.
     */
    rejectQuestionAnswers: async () => {
        if (!isFlowActive()) {
            return "error (no active question flow)";
        }
        return resetFlow();
    },

    /**
     * @deprecated Use answerSingleQuestion + confirmQuestionAnswers instead.
     * Kept for backward compatibility with older voice agent versions.
     */
    answerUserQuestion: async (parameters: unknown) => {
        const schema = z.object({
            answers: z.array(z.object({
                questionIndex: z.number(),
                header: z.string(),
                selectedLabels: z.array(z.string().min(1)),
            }))
        });
        const parsed = schema.safeParse(parameters);

        if (!parsed.success) {
            console.error('❌ Invalid answerUserQuestion parameter:', parsed.error);
            return "error (invalid parameters, expected answers: [{questionIndex, header, selectedLabels}])";
        }

        const sessionId = getCurrentRealtimeSessionId();
        if (!sessionId) {
            console.error('❌ No active session');
            return "error (no active session)";
        }

        console.log('🔍 answerUserQuestion called with:', JSON.stringify(parsed.data.answers));

        // Find the pending AskUserQuestion permission request
        const session = storage.getState().sessions[sessionId];
        const requests = session?.agentState?.requests;

        if (!requests || Object.keys(requests).length === 0) {
            console.error('❌ No pending question');
            return "error (no pending question)";
        }

        // Look for the AskUserQuestion request specifically
        const requestEntry = Object.entries(requests).find(
            ([_, req]) => req.tool === 'AskUserQuestion'
        );
        if (!requestEntry) {
            console.error('❌ No pending AskUserQuestion');
            return "error (no pending AskUserQuestion)";
        }
        const [requestId] = requestEntry;

        // Format answer text (same format as AskUserQuestionView)
        const responseText = parsed.data.answers
            .map(a => `${a.header}: ${a.selectedLabels.join(', ')}`)
            .join('\n');

        try {
            // 1. Approve the permission
            await sessionAllow(sessionId, requestId);
            // 2. Send the formatted answer as a message
            await sync.sendMessage(sessionId, responseText);
            trackPermissionResponse(true);
            return `Answer submitted: ${responseText}. Briefly confirm to the user.`;
        } catch (error) {
            console.error('❌ Failed to submit answer:', error);
            return "error (failed to submit answer)";
        }
    }
};