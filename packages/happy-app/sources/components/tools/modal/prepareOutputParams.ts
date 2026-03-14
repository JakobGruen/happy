/**
 * Converts a tool's result (unknown) into a Record<string, any> suitable
 * for rendering through VerticalParameterStack — the same component
 * used for the INPUT tab.
 *
 * Rules:
 *  - Object with keys → use keys directly
 *  - JSON string that parses to object → unpack parsed keys
 *  - Plain string → { result: <unescaped string> }
 *  - Array / number / boolean → { result: stringified value }
 *  - null / undefined → null (caller should show empty state)
 */
export function prepareOutputParams(
    result: unknown,
): Record<string, any> | null {
    if (result === null || result === undefined) return null;

    // Already an object with keys → use directly
    if (typeof result === 'object' && !Array.isArray(result)) {
        const obj = result as Record<string, any>;
        if (Object.keys(obj).length === 0) return null;
        return obj;
    }

    // String → try JSON parse, else wrap as "result"
    if (typeof result === 'string') {
        const unescaped = unescapeString(result);

        try {
            const parsed = JSON.parse(result);
            if (
                typeof parsed === 'object' &&
                parsed !== null &&
                !Array.isArray(parsed)
            ) {
                return parsed;
            }
        } catch {
            // not JSON
        }

        return { result: unescaped };
    }

    // Arrays, numbers, booleans → wrap
    return { result: String(result) };
}

/**
 * Unescape common escaped sequences so display is human-readable.
 * Only applies to literal `\n`, `\t` etc. in the string value.
 */
function unescapeString(s: string): string {
    // Only unescape if the string contains literal backslash-n etc.
    // (not actual newlines, which are already fine)
    if (!s.includes('\\n') && !s.includes('\\t')) return s;

    return s
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
}
