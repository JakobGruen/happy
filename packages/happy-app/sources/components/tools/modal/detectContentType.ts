export type ContentType = 'json' | 'code' | 'text';

/**
 * Detects content type for rendering in ContentFormatter.
 *
 * Detection order: JSON → Code → Plain Text
 *
 * Removed diff detection (false positives with markdown `---`;
 * diff tools now use DiffModalContent instead).
 * Removed markdown detection (rendered identically to text,
 * caused false positives on common words).
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
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return 'json';
            }
        } catch {
            // Not valid JSON, continue detection
        }
    }

    // Detect code — require multiple signals to reduce false positives
    if (looksLikeCode(str)) {
        return 'code';
    }

    return 'text';
}

/**
 * Heuristic: requires strong signals or 2+ weak signals to classify as code.
 * A single `import` or `class` in prose shouldn't trigger syntax highlighting.
 */
function looksLikeCode(str: string): boolean {
    let signals = 0;

    // Strong signals (one is enough)
    if (/=>\s*[{(]/.test(str)) return true;                    // arrow functions
    if (/\b(const|let|var)\s+\w+\s*=/.test(str)) return true; // variable declarations
    if (/\bdef\s+\w+\s*\(/.test(str)) return true;            // Python function defs
    if (/\bfunction\s+\w+\s*\(/.test(str)) return true;       // JS function defs

    // Weak signals (need 2+)
    if (/\bimport\s+/.test(str)) signals++;
    if (/\bclass\s+\w+/.test(str)) signals++;
    if (/\bif\s*\(/.test(str)) signals++;
    if (/\bfor\s*\(/.test(str)) signals++;
    if (/\bwhile\s*\(/.test(str)) signals++;
    if (/\breturn\s+/.test(str)) signals++;
    if (/[{};]\s*$/m.test(str)) signals++;

    return signals >= 2;
}
