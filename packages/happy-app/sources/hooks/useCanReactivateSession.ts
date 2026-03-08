import * as React from 'react';
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
 */
export function useCanReactivateSession(session: Session, opts?: { onSuccess?: () => void }) {
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
        opts?.onSuccess?.();
    });

    return { canReactivate, reactivating, performReactivate };
}
