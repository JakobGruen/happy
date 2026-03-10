import { t } from '@/text';

/**
 * Derives a human-readable label from a CC permission suggestion.
 * Inspects the shape of the opaque suggestion object to generate contextual labels.
 * Shared between PermissionFooter (inline) and PermissionSheetExpanded (sheet).
 */
export function getSuggestionLabel(suggestion: any): string {
    const destination = suggestion.destination as string | undefined;
    const destinationLabel = destination === 'session'
        ? t('permissions.forSession')
        : destination === 'localSettings'
            ? t('permissions.forLocalSettings')
            : destination === 'projectSettings'
                ? t('permissions.forProject')
                : destination === 'userSettings'
                    ? t('permissions.forAllProjects')
                    : destination === 'cliArg'
                        ? t('permissions.forSession')
                        : '';

    if ((suggestion.type === 'addRules' || suggestion.type === 'replaceRules') && Array.isArray(suggestion.rules)) {
        const rule = suggestion.rules[0];
        if (rule) {
            const ruleContent = rule.ruleContent
                ? (rule.ruleContent.length > 40 ? rule.ruleContent.slice(0, 37) + '...' : rule.ruleContent)
                : '';
            const toolLabel = ruleContent
                ? `${rule.toolName || 'tool'}(${ruleContent})`
                : rule.toolName || 'tool';
            if (suggestion.behavior === 'allow') {
                return t('permissions.allowTool', { tool: toolLabel, scope: destinationLabel });
            }
            if (suggestion.behavior === 'deny') {
                return t('permissions.denyTool', { tool: toolLabel, scope: destinationLabel });
            }
        }
    }

    if (suggestion.type === 'setMode') {
        const mode = suggestion.mode as string;
        if (mode === 'acceptEdits') {
            return t('permissions.acceptAllEdits', { scope: destinationLabel });
        }
        if (mode === 'bypassPermissions') {
            return t('permissions.bypassPermissions', { scope: destinationLabel });
        }
        if (mode === 'plan') {
            return t('permissions.planMode', { scope: destinationLabel });
        }
        return t('permissions.setMode', { mode, scope: destinationLabel });
    }

    if (suggestion.type === 'addDirectories') {
        return t('permissions.addDirectories', { scope: destinationLabel });
    }

    // Fallback for unknown suggestion shapes
    return t('permissions.applySuggestion');
}

/**
 * Check if a session flavor represents a Claude session (not Codex/Gemini).
 */
export function isClaudeFlavor(flavor: string | null | undefined): boolean {
    return flavor !== 'codex' && flavor !== 'gemini';
}
