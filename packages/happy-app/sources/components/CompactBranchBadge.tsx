import React from 'react';
import { View, Text } from 'react-native';
import { useSessionGitStatus, useSessionProjectGitStatus } from '@/sync/storage';
import { StyleSheet } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { isWorktreePath } from '@/utils/worktreeUtils';
import { t } from '@/text';

interface CompactBranchBadgeProps {
    sessionId: string;
    /** Session path — used to detect worktree sessions */
    sessionPath?: string;
}

export function CompactBranchBadge({ sessionId, sessionPath }: CompactBranchBadgeProps) {
    const styles = stylesheet;
    const projectGitStatus = useSessionProjectGitStatus(sessionId);
    const sessionGitStatus = useSessionGitStatus(sessionId);
    const gitStatus = projectGitStatus || sessionGitStatus;

    const branch = gitStatus?.branch;
    if (!branch) return null;

    const isWorktree = sessionPath ? isWorktreePath(sessionPath) : false;

    // Skip showing "main" or "master" for non-worktree sessions (not interesting)
    if (!isWorktree && (branch === 'main' || branch === 'master')) {
        return null;
    }

    const truncatedBranch = branch.length > 20 ? branch.substring(0, 20) + '…' : branch;

    return (
        <View style={[styles.container, isWorktree && styles.containerWorktree]}>
            <Ionicons
                name="git-branch-outline"
                size={10}
                color={isWorktree ? styles.worktreeText.color : styles.text.color}
            />
            <Text style={[styles.text, isWorktree && styles.worktreeText]}>
                {truncatedBranch}
            </Text>
            {isWorktree && (
                <Text style={[styles.text, styles.worktreeLabel]}>
                    {t('session.worktreeBadge')}
                </Text>
            )}
        </View>
    );
}

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceHighest,
        paddingHorizontal: 6,
        height: 16,
        borderRadius: 4,
        gap: 2,
    },
    containerWorktree: {
        backgroundColor: `${theme.colors.status.connecting}14`,
    },
    text: {
        fontSize: 10,
        fontWeight: '500',
        color: theme.colors.textSecondary,
    },
    worktreeText: {
        color: theme.colors.status.connecting,
    },
    worktreeLabel: {
        marginLeft: 2,
        fontWeight: '600',
    },
}));
