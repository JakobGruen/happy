/**
 * Content analysis utilities for determining content type and size
 */

interface ContentAnalysis {
    type: string;
    size: number;
    isJSON: boolean;
}

export function analyzeContent(content: string): ContentAnalysis {
    const size = content.length;

    // Try to detect content type
    let type = 'text';
    let isJSON = false;

    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
        try {
            JSON.parse(content);
            type = 'json';
            isJSON = true;
        } catch {
            // Not valid JSON
        }
    }

    if (content.includes('<') && content.includes('>')) {
        type = 'html';
    }

    if (content.includes('```')) {
        type = 'code';
    }

    return { type, size, isJSON };
}

export function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
}
