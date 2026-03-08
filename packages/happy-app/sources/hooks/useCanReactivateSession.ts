import * as React from 'react';
import { useMachine } from '@/sync/storage';
import { machineResumeSession } from '@/sync/ops';
import { isMachineOnline } from '@/utils/machineUtils';
import { useHappyAction } from '@/hooks/useHappyAction';
import { HappyError } from '@/utils/errors';
import { Session } from '@/sync/storageTypes';

/**
 * Determines if an archived Claude session can be reactivated on its machine,
 * and provides the action to do so.
 *
 * Conditions: session inactive, not connected, has claudeSessionId + path,
 * machine is online, flavor is 'claude'.
 */
export function useCanReactivateSession(session: Session, opts?: { onSuccess?: () => void }) {
    const machineId = session.metadata?.machineId;
    const machine = useMachine(machineId || '');

    const canReactivate = !session.active
        && session.presence !== 'online'
        && !!session.metadata?.claudeSessionId
        && !!machineId
        && !!session.metadata?.path
        && !!machine
        && isMachineOnline(machine)
        && session.metadata?.flavor === 'claude';

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
