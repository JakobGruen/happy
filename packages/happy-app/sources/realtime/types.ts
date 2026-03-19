export interface VoiceSessionConfig {
    sessionId: string;
    initialContext?: string;
    initialState?: string;
    pipecatUrl?: string;
    voiceAssistantName?: string;
    voiceAssistantBio?: string;
    voiceAssistantSetup?: string;
}

export interface VoiceSession {
    startSession(config: VoiceSessionConfig): Promise<void>;
    endSession(): Promise<void>;
    sendTextMessage(message: string): void;
    sendContextualUpdate(update: string): void;
    sendTrigger(trigger: string): void;
    sendState(state: string): void;
    setMicEnabled(enabled: boolean): void;
}

export type ConversationStatus = 'disconnected' | 'connecting' | 'connected';
export type ConversationMode = 'speaking' | 'listening';