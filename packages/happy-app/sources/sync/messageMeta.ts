import type { Session } from './storageTypes';
import type { PermissionModeKey } from '@/components/PermissionModeSelector';

function isSandboxEnabled(metadata: Session['metadata'] | null | undefined): boolean {
    const sandbox = metadata?.sandbox;
    return !!sandbox && typeof sandbox === 'object' && (sandbox as { enabled?: unknown }).enabled === true;
}

export function resolveMessageModeMeta(
    session: Pick<Session, 'permissionMode' | 'modelMode' | 'effortMode' | 'metadata' | 'autoApproveTools'>,
): { permissionMode: PermissionModeKey; model: string | null; effort: string | null; autoApproveTools?: boolean } {
    const sandboxEnabled = isSandboxEnabled(session.metadata);
    const permissionMode: PermissionModeKey =
        session.permissionMode && session.permissionMode !== 'default'
            ? session.permissionMode
            : (sandboxEnabled ? 'bypassPermissions' : 'default');

    // Always send the selected model code (sonnet, opus, haiku, etc.)
    // Filter out legacy 'default' values from old persisted state
    const model = (session.modelMode && session.modelMode !== 'default') ? session.modelMode : null;

    // Send effort level code (low, medium, high)
    const effort = (session.effortMode && session.effortMode !== 'default') ? session.effortMode : null;

    return {
        permissionMode,
        model,
        effort,
        ...((session.metadata?.autoApproveTools ?? session.autoApproveTools) ? { autoApproveTools: true } : {}),
    };
}
