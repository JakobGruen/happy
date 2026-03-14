import * as React from 'react';
import { SessionListViewItem, useSessionListViewData, useSetting } from '@/sync/storage';
import { useReactivatingIds } from '@/hooks/useReactivatingSessions';
import { Session } from '@/sync/storageTypes';

export function useVisibleSessionListViewData(): SessionListViewItem[] | null {
    const data = useSessionListViewData();
    const hideInactiveSessions = useSetting('hideInactiveSessions');
    const reactivatingIds = useReactivatingIds();

    return React.useMemo(() => {
        if (!data) {
            return data;
        }

        // If no sessions are reactivating, use the simpler path
        if (reactivatingIds.size === 0) {
            if (!hideInactiveSessions) {
                return data;
            }

            const filtered: SessionListViewItem[] = [];
            let pendingProjectGroup: SessionListViewItem | null = null;

            for (const item of data) {
                if (item.type === 'project-group') {
                    pendingProjectGroup = item;
                    continue;
                }

                if (item.type === 'session') {
                    if (item.session.active) {
                        if (pendingProjectGroup) {
                            filtered.push(pendingProjectGroup);
                            pendingProjectGroup = null;
                        }
                        filtered.push(item);
                    }
                    continue;
                }

                pendingProjectGroup = null;

                if (item.type === 'active-sessions') {
                    filtered.push(item);
                }
            }

            return filtered;
        }

        // Sessions being reactivated: move them from inactive → active section
        const reactivatingSessions: Session[] = [];
        const result: SessionListViewItem[] = [];

        // First pass: collect reactivating sessions and build filtered list
        for (const item of data) {
            if (item.type === 'session' && reactivatingIds.has(item.session.id)) {
                // Pull this session out of the inactive list
                reactivatingSessions.push(item.session);
                continue;
            }

            if (hideInactiveSessions && item.type === 'session' && !item.session.active) {
                continue;
            }

            result.push(item);
        }

        // Inject reactivating sessions into the active-sessions group
        if (reactivatingSessions.length > 0) {
            const activeIdx = result.findIndex(item => item.type === 'active-sessions');
            if (activeIdx >= 0) {
                // Merge into existing active sessions group
                const existing = result[activeIdx] as { type: 'active-sessions'; sessions: Session[] };
                result[activeIdx] = {
                    type: 'active-sessions',
                    sessions: [...existing.sessions, ...reactivatingSessions],
                };
            } else {
                // No active sessions yet — create the group at the top
                result.unshift({
                    type: 'active-sessions',
                    sessions: reactivatingSessions,
                });
            }
        }

        // Remove empty date headers (headers followed by another header or end of list)
        const cleaned: SessionListViewItem[] = [];
        for (let i = 0; i < result.length; i++) {
            const item = result[i];
            if (item.type === 'header') {
                const next = result[i + 1];
                if (!next || next.type === 'header' || next.type === 'active-sessions') {
                    continue; // Skip orphaned header
                }
            }
            cleaned.push(item);
        }

        return cleaned;
    }, [data, hideInactiveSessions, reactivatingIds]);
}
