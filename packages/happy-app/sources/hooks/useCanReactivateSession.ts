import { useMachine } from '@/sync/storage';
import { machineResumeSession } from '@/sync/ops';
import { useHappyAction } from '@/hooks/useHappyAction';
import { HappyError } from '@/utils/errors';
import { Session, Machine } from '@/sync/storageTypes';

/**
 * Pure condition check: can this session be reactivated?
 * Session must be inactive, offline, have a claudeSessionId + path,
 * machine must be online, and flavor must be 'claude'.
 */
export function canReactivateSession(session: Session, machine: Machine | null): boolean {
    return !session.active
        && session.presence !== 'online'
        && !!session.metadata?.claudeSessionId
        && !!session.metadata?.machineId
        && !!session.metadata?.path
        && !!machine
        && machine.active
        && session.metadata?.flavor === 'claude';
}

/**
 * Hook wrapper: determines reactivatability and provides the action.
 * Spawns a fresh session with Claude --resume for context continuity.
 * Calls onSuccess with the new session ID so the caller can navigate to it.
 */
export function useCanReactivateSession(session: Session, opts?: { onSuccess?: (newSessionId: string) => void }) {
    const machineId = session.metadata?.machineId;
    const machine = useMachine(machineId || '');

    const canReactivate = canReactivateSession(session, machine);

    const [reactivating, performReactivate] = useHappyAction(async () => {
        const result = await machineResumeSession({
            machineId: machineId!,
            sessionId: session.id,
            claudeSessionId: session.metadata!.claudeSessionId!,
            directory: session.metadata!.path!,
        });
        if (result.type === 'error') {
            throw new HappyError(result.errorMessage, false);
        }
        if (result.type === 'success') {
            opts?.onSuccess?.(result.sessionId);
        }
    });

    return { canReactivate, reactivating, performReactivate };
}
