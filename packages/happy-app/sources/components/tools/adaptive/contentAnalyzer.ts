/**
 * Content analysis utilities for adaptive tool display
 * Determines content type, size, and preview text
 */

export type ContentType = 'string' | 'json' | 'code' | 'markdown' | 'terminal' | 'binary';

export interface ContentAnalysis {
    type: ContentType;
    language?: string;
    size: number;
    isLarge: boolean;
    previewLines: string[];
    fullText: string;
    lineCount: number;
}

const CODE_EXTENSIONS = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    go: 'go',
    rust: 'rust',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    swift: 'swift',
    kt: 'kotlin',
    rb: 'ruby',
    php: 'php',
    cs: 'csharp',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'zsh',
    yaml: 'yaml',
    yml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
};

/**
 * Detect if content looks like code or markdown based on patterns
 */
function detectContentType(text: string): ContentType {
    if (!text || typeof text !== 'string') {
        return 'string';
    }

    // Try to parse as JSON
    try {
        JSON.parse(text);
        return 'json';
    } catch { }

    // Detect code patterns
    const codePatterns = [
        /^import\s/m,
        /^export\s/m,
        /^const\s+\w+\s*=/m,
        /^function\s+\w+/m,
        /^class\s+\w+/m,
        /^def\s+\w+/m,
        /^func\s+\w+/m,
        /^type\s+\w+\s*=/m,
        /^interface\s+\w+/m,
        /^enum\s+\w+/m,
        /^\$\(/m,
        /^#!/m,
        /^\s*\/\//m,
        /^\s*\/\*/m,
        /^#\s/m,
        /^--\s/m,
        /^<!--/m,
    ];

    if (codePatterns.some(pattern => pattern.test(text))) {
        return 'code';
    }

    // Detect markdown patterns
    const markdownPatterns = [
        /^#+\s/m,
        /^>\s/m,
        /^-\s/m,
        /^\*\s/m,
        /^\d+\.\s/m,
        /\*\*\w+\*\*/m,
        /__(.*?)__/m,
        /\[.+\]\(.+\)/m,
        /```/m,
    ];

    if (markdownPatterns.some(pattern => pattern.test(text))) {
        return 'markdown';
    }

    // Terminal output patterns
    if (text.match(/^\$\s|^#\s|^>\s/) || text.includes('\n$') || text.includes('\nError:')) {
        return 'terminal';
    }

    return 'string';
}

/**
 * Analyze content and return metadata for display
 */
export function analyzeContent(
    value: unknown,
    paramName?: string,
): ContentAnalysis {
    let fullText: string;

    if (typeof value === 'string') {
        fullText = value;
    } else if (typeof value === 'object' && value !== null) {
        fullText = JSON.stringify(value, null, 2);
    } else {
        fullText = String(value ?? '');
    }

    const lines = fullText.split('\n');
    const size = fullText.length;
    const lineCount = lines.length;
    const isLarge = size > 500 || lineCount > 10;

    let type = detectContentType(fullText);
    let language: string | undefined;

    // Try to infer language from parameter name or context
    if (type === 'code' && paramName) {
        const ext = paramName.split('.').pop()?.toLowerCase();
        if (ext && ext in CODE_EXTENSIONS) {
            language = (CODE_EXTENSIONS as Record<string, string>)[ext];
        }
    }

    // Get preview: first 2-3 lines for expandable content
    const previewLines = isLarge
        ? lines.slice(0, 2).filter(l => l.trim())
        : lines.slice(0, 5);

    return {
        type,
        language,
        size,
        isLarge,
        previewLines,
        fullText,
        lineCount,
    };
}

/**
 * Format file size for display
 */
export function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Get a summary badge for content
 */
export function getContentBadge(analysis: ContentAnalysis): string {
    const parts: string[] = [];

    if (analysis.type === 'json' || analysis.type === 'code') {
        if (analysis.language) {
            parts.push(analysis.language.charAt(0).toUpperCase() + analysis.language.slice(1));
        } else {
            parts.push(analysis.type.charAt(0).toUpperCase() + analysis.type.slice(1));
        }
    }

    if (analysis.isLarge) {
        parts.push(`${analysis.lineCount} lines`);
    }

    if (analysis.size > 0) {
        parts.push(formatSize(analysis.size));
    }

    return parts.join(' • ');
}
