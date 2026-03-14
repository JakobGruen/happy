import type { Session } from './storageTypes';
import type { PermissionModeKey } from '@/components/PermissionModeSelector';

function isSandboxEnabled(metadata: Session['metadata'] | null | undefined): boolean {
    const sandbox = metadata?.sandbox;
    return !!sandbox && typeof sandbox === 'object' && (sandbox as { enabled?: unknown }).enabled === true;
}

export function resolveMessageModeMeta(
    session: Pick<Session, 'permissionMode' | 'modelMode' | 'metadata' | 'autoApproveTools'>,
): { permissionMode: PermissionModeKey; model: string | null; autoApproveTools?: boolean } {
    const sandboxEnabled = isSandboxEnabled(session.metadata);
    const permissionMode: PermissionModeKey =
        session.permissionMode && session.permissionMode !== 'default'
            ? session.permissionMode
            : (sandboxEnabled ? 'bypassPermissions' : 'default');

    // Always send the selected model code (sonnet, opus, haiku, etc.)
    // Filter out legacy 'default' values from old persisted state
    const model = (session.modelMode && session.modelMode !== 'default') ? session.modelMode : null;

    return {
        permissionMode,
        model,
        ...(session.autoApproveTools ? { autoApproveTools: true } : {}),
    };
}
