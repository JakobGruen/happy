export type ContentType = 'json' | 'diff' | 'code' | 'markdown' | 'text';

/**
 * Detects content type based on patterns and structure
 * Detection order: JSON → Diff → Code → Markdown → Plain Text
 */
export function detectContentType(value: unknown): ContentType {
    // Already an object (not array, not null) = JSON
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return 'json';
    }

    if (typeof value !== 'string') {
        return 'text';
    }

    const str = value as string;

    // Try to parse as JSON (for JSON strings)
    if ((str.startsWith('{') || str.startsWith('[')) && str.length > 0) {
        try {
            const parsed = JSON.parse(str);
            // Only return 'json' if it parses to an object, not array/primitive
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return 'json';
            }
        } catch {
            // Not valid JSON, continue detection
        }
    }

    // Detect diff by markers (+++ or --- or @@)
    if (/^(\+\+\+|---|@@)/m.test(str)) {
        return 'diff';
    }

    // Detect code by common patterns
    const codePatterns = [
        /\bconst\b|\blet\b|\bvar\b|\bfunction\b|\bif\s*\(|\bfor\s*\(|\bwhile\s*\(/,  // JavaScript
        /\bdef\b|\bclass\b|\bimport\b/,  // Python
        /^import\s|^package\s/,  // Java/Go
        /=>\s*\{/,  // Arrow functions
    ];
    if (codePatterns.some(pattern => pattern.test(str))) {
        return 'code';
    }

    // Detect markdown by common markers
    const markdownPatterns = [
        /^#+\s/,  // Headings
        /^[-*+]\s/,  // Lists
        /\*\*.*?\*\*|\*.*?\*|__.*?__|_.*?_/,  // Bold/italic
        /\[.*?\]\(.*?\)/,  // Links
        /^>/,  // Blockquotes
        /```/,  // Code blocks
    ];
    if (markdownPatterns.some(pattern => pattern.test(str))) {
        return 'markdown';
    }

    return 'text';
}
