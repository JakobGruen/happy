import type { Session } from '@/sync/storageTypes';
import type { VoiceMessageContext } from '@jakobgruen/happy-wire';

export function buildVoiceMessageContext(session: Session): VoiceMessageContext {
    const metadata = session.metadata;
    const logSteps = metadata?.logSteps
        ? Object.entries(metadata.logSteps).map(([_key, step]) => ({
            title: step.title,
            summary: step.summary,
            stats: step.stats as Record<string, unknown> | undefined,
            createdAt: String(step.createdAt),
        }))
        : [];

    // Get pending permission if any (exclude AskUserQuestion — can't be
    // answered in single-turn voice messages per design spec)
    const requests = session.agentState?.requests;
    const pendingEntry = requests
        ? Object.entries(requests).find(([_, r]) => r.tool !== 'AskUserQuestion')
        : undefined;

    const pendingPermission = pendingEntry
        ? {
            requestId: pendingEntry[0],
            toolName: pendingEntry[1].tool,
            toolArgs: JSON.stringify(pendingEntry[1].arguments ?? {}),
        }
        : undefined;

    return {
        sessionId: session.id,
        logSteps,
        currentStatus: metadata?.currentStatus ?? undefined,
        inputContent: undefined,
        sessionState: {
            model: metadata?.currentModelCode ?? 'sonnet',
            permissionMode: metadata?.currentOperatingModeCode ?? 'default',
            autoApproveTools: metadata?.autoApproveTools ?? session.autoApproveTools ?? false,
        },
        pendingPermission,
    };
}
