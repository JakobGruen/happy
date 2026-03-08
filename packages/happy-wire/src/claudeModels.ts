/**
 * Claude model registry — single place to update when CC adds models.
 * Shared between CLI (metadata population) and app (fallback display).
 */

interface ClaudeModelDef {
    code: string;
    value: string;
    description: string;
    patterns: RegExp[];
}

const CLAUDE_MODEL_REGISTRY: ClaudeModelDef[] = [
    { code: 'sonnet', value: 'Sonnet', description: 'Fast and capable', patterns: [/sonnet/i] },
    { code: 'opus', value: 'Opus', description: 'Most capable', patterns: [/opus/i] },
    { code: 'haiku', value: 'Haiku', description: 'Fastest', patterns: [/haiku/i] },
];

/**
 * Returns the model list for session metadata.
 */
export function getClaudeModels(): Array<{ code: string; value: string; description: string }> {
    return CLAUDE_MODEL_REGISTRY.map(({ code, value, description }) => ({ code, value, description }));
}

/**
 * Returns the operating mode list for session metadata.
 */
export function getClaudeOperatingModes(): Array<{ code: string; value: string; description: string }> {
    return [
        { code: 'default', value: 'Default', description: 'Ask for permissions' },
        { code: 'acceptEdits', value: 'Accept Edits', description: 'Auto-accept file edits' },
        { code: 'plan', value: 'Plan', description: 'Plan without executing' },
        { code: 'bypassPermissions', value: 'Bypass Permissions', description: 'Skip all permission checks' },
    ];
}

/**
 * Normalizes a full SDK model ID (e.g. 'claude-opus-4-20250514') to a shorthand code ('opus').
 * Returns the raw ID if no pattern matches — enables dynamic discovery of future models.
 */
export function normalizeModelCode(sdkModelId: string): string {
    for (const def of CLAUDE_MODEL_REGISTRY) {
        for (const pattern of def.patterns) {
            if (pattern.test(sdkModelId)) {
                return def.code;
            }
        }
    }
    return sdkModelId;
}
