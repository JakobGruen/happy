/**
 * Maps file path extensions to programming language identifiers.
 * Used by syntax highlighting components to determine the language
 * from a file path rather than content-based detection.
 */

const EXTENSION_MAP: Record<string, string> = {
    // JavaScript
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascript',

    // TypeScript
    '.ts': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.tsx': 'typescript',

    // Python
    '.py': 'python',
    '.pyi': 'python',

    // Data formats
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.xml': 'xml',
    '.svg': 'xml',

    // Web
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'css',
    '.less': 'css',

    // Shell
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.env': 'shell',

    // Systems
    '.go': 'go',
    '.rs': 'rust',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.hpp': 'cpp',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.java': 'java',
    '.zig': 'zig',

    // Other
    '.rb': 'ruby',
    '.php': 'php',
    '.sql': 'sql',
    '.md': 'markdown',
    '.mdx': 'markdown',
    '.prisma': 'prisma',
    '.graphql': 'graphql',
    '.gql': 'graphql',
    '.jl': 'julia',
    '.lua': 'lua',
    '.r': 'r',
    '.ex': 'elixir',
    '.exs': 'elixir',
};

/** Name-based patterns matched against the filename (no directory components). */
const NAME_PATTERNS: Array<{ test: (filename: string) => boolean; language: string }> = [
    { test: (name) => name === 'Dockerfile' || name.startsWith('Dockerfile.'), language: 'dockerfile' },
    { test: (name) => name === 'Makefile', language: 'makefile' },
];

/**
 * Determines the programming language from a file path based on its extension
 * or filename. Returns `null` for unknown or missing extensions.
 *
 * @param path - File path (absolute, relative, or just a filename)
 * @returns Language identifier string or `null`
 */
export function languageFromPath(path: string): string | null {
    if (!path) return null;

    // Extract the filename (last segment after any slash)
    const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    const filename = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;

    if (!filename) return null;

    // Check name-based patterns first (Dockerfile, Makefile)
    for (const pattern of NAME_PATTERNS) {
        if (pattern.test(filename)) {
            return pattern.language;
        }
    }

    // Find the last dot for the extension
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex < 0) return null; // No dot at all

    // For dotfiles (dot at position 0), treat the whole filename as extension
    // e.g. ".env" → ext ".env"; for normal files use last dot segment
    const ext = (dotIndex === 0 ? filename : filename.slice(dotIndex)).toLowerCase();
    return EXTENSION_MAP[ext] ?? null;
}
