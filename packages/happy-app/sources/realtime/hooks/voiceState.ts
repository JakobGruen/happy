import type { Session } from '@/sync/storageTypes';

export interface VoiceSessionState {
    sessionId: string;
    model: string;
    permissionMode: string;
    autoApproveTools: boolean;
}

export function buildSessionState(session: Pick<Session, 'id' | 'metadata' | 'autoApproveTools'>): VoiceSessionState {
    return {
        sessionId: session.id,
        model: session.metadata?.currentModelCode ?? 'sonnet',
        permissionMode: session.metadata?.currentOperatingModeCode ?? 'default',
        autoApproveTools: session.metadata?.autoApproveTools ?? session.autoApproveTools ?? false,
    };
}
