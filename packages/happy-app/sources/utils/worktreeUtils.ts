/**
 * Utilities for detecting and formatting git worktree paths.
 *
 * Happy creates worktrees at `.dev/worktree/{name}` relative to the repo root.
 * Claude Code itself uses `.claude/worktrees/{name}`.
 * Both patterns are detected.
 */

const WORKTREE_PATTERNS = [
    '/.dev/worktree/',
    '/.claude/worktrees/',
];

/** Detect if a path is inside a git worktree */
export function isWorktreePath(path: string): boolean {
    return WORKTREE_PATTERNS.some(pattern => path.includes(pattern));
}

/** Extract the base repo path from a worktree path, or null if not a worktree */
export function getWorktreeBasePath(path: string): string | null {
    for (const pattern of WORKTREE_PATTERNS) {
        const idx = path.indexOf(pattern);
        if (idx !== -1) {
            return path.substring(0, idx);
        }
    }
    return null;
}

/** Extract the worktree name (last segment) from a worktree path */
export function getWorktreeName(path: string): string | null {
    for (const pattern of WORKTREE_PATTERNS) {
        const idx = path.indexOf(pattern);
        if (idx !== -1) {
            const after = path.substring(idx + pattern.length);
            // Take first segment (in case there's sub-paths)
            const name = after.split('/')[0];
            return name || null;
        }
    }
    return null;
}

/**
 * Format a worktree subtitle for display.
 * Instead of the full ugly path, show: "repo-name (branch-or-worktree-name)"
 */
export function formatWorktreeSubtitle(
    path: string,
    branch: string | null,
    homeDir?: string
): string {
    const basePath = getWorktreeBasePath(path);
    if (!basePath) return path;

    // Extract repo name from base path
    const segments = basePath.split('/').filter(Boolean);
    const repoName = segments[segments.length - 1] || basePath;

    // Use branch name if available, otherwise fall back to worktree name
    const label = branch || getWorktreeName(path) || 'worktree';

    return `${repoName} (${label})`;
}
