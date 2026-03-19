import { z } from 'zod';

// Context sent with voice message
export const voiceMessageContextSchema = z.object({
    sessionId: z.string(),
    logSteps: z.array(z.object({
        title: z.string(),
        summary: z.string(),
        stats: z.record(z.unknown()).optional(),
        createdAt: z.string(),
    })).default([]),
    currentStatus: z.string().optional(),
    inputContent: z.string().optional(),
    sessionState: z.object({
        model: z.string(),
        permissionMode: z.string(),
        autoApproveTools: z.boolean(),
    }),
    // Exclude AskUserQuestion — can't be answered in single-turn voice messages per design spec
    pendingPermission: z.object({
        requestId: z.string(),
        toolName: z.string(),
        toolArgs: z.string(),
    }).optional(),
    // Voice assistant personalization (sent from app settings)
    voiceAssistantName: z.string().optional(),
    voiceAssistantBio: z.string().optional(),
    voiceAssistantSetup: z.string().optional(),
});

export type VoiceMessageContext = z.infer<typeof voiceMessageContextSchema>;

// Response from voice agent
export const voiceMessageResponseSchema = z.object({
    transcript: z.string(),
    summary: z.string(),
    actions: z.array(z.object({
        tool: z.string(),
        args: z.record(z.unknown()),
        result: z.unknown(),
    })),
});

export type VoiceMessageResponse = z.infer<typeof voiceMessageResponseSchema>;

// Tool callback from voice agent → server (pure RPC proxy)
export const voiceToolCallbackSchema = z.object({
    method: z.string(),
    params: z.record(z.unknown()).optional(),
});

export type VoiceToolCallback = z.infer<typeof voiceToolCallbackSchema>;
