import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { ItemGroup } from '@/components/ItemGroup';
import { Item } from '@/components/Item';
import { Ionicons } from '@expo/vector-icons';
import { machineBash } from '@/sync/ops';
import { Modal } from '@/modal';
import { t } from '@/text';
import { useAllSessions } from '@/sync/storage';
import { getWorktreeBasePath, isWorktreePath } from '@/utils/worktreeUtils';
import { useHappyAction } from '@/hooks/useHappyAction';

interface WorktreeInfo {
    path: string;
    branch: string;
    head: string;
    bare: boolean;
}

interface RepoWorktrees {
    repoPath: string;
    repoName: string;
    worktrees: WorktreeInfo[];
}

interface WorktreeListSectionProps {
    machineId: string;
    isOnline: boolean;
}

/**
 * Discovers git worktrees across known repo paths on a machine.
 * Scans recent session paths, detects repos with .dev/worktree/ children,
 * and runs `git worktree list --porcelain` to enumerate them.
 */
export function WorktreeListSection({ machineId, isOnline }: WorktreeListSectionProps) {
    const sessions = useAllSessions();
    const [repoWorktrees, setRepoWorktrees] = useState<RepoWorktrees[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasLoaded, setHasLoaded] = useState(false);

    // Collect unique repo paths from sessions that have worktrees
    const repoPaths = useMemo(() => {
        const paths = new Set<string>();
        sessions.forEach(session => {
            const sessionPath = session.metadata?.path;
            if (!sessionPath || session.metadata?.machineId !== machineId) return;

            // If session is in a worktree, extract base repo
            if (isWorktreePath(sessionPath)) {
                const base = getWorktreeBasePath(sessionPath);
                if (base) paths.add(base);
            }
        });
        return Array.from(paths);
    }, [sessions, machineId]);

    const fetchWorktrees = useCallback(async () => {
        if (!isOnline || repoPaths.length === 0) return;

        setLoading(true);
        try {
            const results: RepoWorktrees[] = [];

            for (const repoPath of repoPaths) {
                const result = await machineBash(
                    machineId,
                    'git worktree list --porcelain',
                    repoPath
                );

                if (!result.success) continue;

                const worktrees = parsePorcelainOutput(result.stdout);
                // Filter out the main worktree (bare = false, path = repoPath)
                const nonMain = worktrees.filter(wt =>
                    !wt.bare && wt.path !== repoPath
                );

                if (nonMain.length > 0) {
                    const segments = repoPath.split('/').filter(Boolean);
                    results.push({
                        repoPath,
                        repoName: segments[segments.length - 1] || repoPath,
                        worktrees: nonMain,
                    });
                }
            }

            setRepoWorktrees(results);
        } finally {
            setLoading(false);
            setHasLoaded(true);
        }
    }, [machineId, isOnline, repoPaths]);

    useEffect(() => {
        if (isOnline && repoPaths.length > 0 && !hasLoaded) {
            fetchWorktrees();
        }
    }, [isOnline, repoPaths, hasLoaded, fetchWorktrees]);

    // Check if any active session uses a given worktree path
    const isWorktreeInUse = useCallback((worktreePath: string) => {
        return sessions.some(s =>
            s.active && s.metadata?.path === worktreePath
        );
    }, [sessions]);

    if (!isOnline || repoPaths.length === 0) return null;
    if (hasLoaded && repoWorktrees.length === 0) return null;

    return (
        <>
            {loading && !hasLoaded && (
                <ItemGroup title={t('machine.worktrees.title')}>
                    <Item
                        title=""
                        leftElement={<ActivityIndicator size="small" />}
                        showChevron={false}
                    />
                </ItemGroup>
            )}
            {repoWorktrees.map(repo => (
                <ItemGroup key={repo.repoPath} title={`${t('machine.worktrees.title')} — ${repo.repoName}`}>
                    {repo.worktrees.map(wt => (
                        <WorktreeItem
                            key={wt.path}
                            worktree={wt}
                            machineId={machineId}
                            repoPath={repo.repoPath}
                            inUse={isWorktreeInUse(wt.path)}
                            onDeleted={fetchWorktrees}
                        />
                    ))}
                </ItemGroup>
            ))}
        </>
    );
}

function WorktreeItem({ worktree, machineId, repoPath, inUse, onDeleted }: {
    worktree: WorktreeInfo;
    machineId: string;
    repoPath: string;
    inUse: boolean;
    onDeleted: () => void;
}) {
    const [, performDelete] = useHappyAction(async () => {
        const result = await machineBash(
            machineId,
            `git worktree remove "${worktree.path}"`,
            repoPath
        );
        if (!result.success) {
            // Try with --force if regular remove fails
            const forceResult = await machineBash(
                machineId,
                `git worktree remove --force "${worktree.path}"`,
                repoPath
            );
            if (!forceResult.success) {
                throw new Error(forceResult.stderr || 'Failed to remove worktree');
            }
        }
        onDeleted();
    });

    const handleDelete = useCallback(() => {
        if (inUse) {
            Modal.alert(
                t('machine.worktrees.deleteConfirm'),
                t('machine.worktrees.deleteWarning'),
                [{ text: t('common.ok'), style: 'cancel' }]
            );
            return;
        }
        Modal.alert(
            t('machine.worktrees.deleteConfirm'),
            worktree.branch,
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: performDelete,
                },
            ]
        );
    }, [inUse, worktree.branch, performDelete]);

    // Extract short path (relative to repo)
    const shortPath = worktree.path.startsWith(repoPath)
        ? worktree.path.slice(repoPath.length + 1)
        : worktree.path;

    return (
        <Item
            title={worktree.branch || shortPath}
            subtitle={worktree.branch ? shortPath : undefined}
            detail={worktree.head.slice(0, 7)}
            detailStyle={{ fontFamily: 'Menlo', fontSize: 11 }}
            leftElement={
                <Ionicons
                    name="git-branch-outline"
                    size={20}
                    color={inUse ? '#007AFF' : '#8E8E93'}
                />
            }
            showChevron={false}
            onPress={handleDelete}
        />
    );
}

/** Parse `git worktree list --porcelain` output into structured data */
function parsePorcelainOutput(output: string): WorktreeInfo[] {
    const worktrees: WorktreeInfo[] = [];
    const blocks = output.trim().split('\n\n');

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        const wt: WorktreeInfo = { path: '', branch: '', head: '', bare: false };

        for (const line of lines) {
            if (line.startsWith('worktree ')) {
                wt.path = line.slice('worktree '.length);
            } else if (line.startsWith('HEAD ')) {
                wt.head = line.slice('HEAD '.length);
            } else if (line.startsWith('branch ')) {
                // "branch refs/heads/feature-x" → "feature-x"
                const ref = line.slice('branch '.length);
                wt.branch = ref.replace('refs/heads/', '');
            } else if (line === 'bare') {
                wt.bare = true;
            }
        }

        if (wt.path) {
            worktrees.push(wt);
        }
    }

    return worktrees;
}
