/**
 * Splits a URL path into decoded segments, or returns null if it could escape its folder.
 * Decoding comes first, so encoded separators like `..%2F` are caught too.
 *
 * @param path The path, with segments separated by `/`.
 */
export function safePathSegments(path: string): string[] | null {
    let decoded: string;
    try {
        decoded = decodeURIComponent(path);
    } catch {
        return null;
    }

    if (decoded.includes('\0') || decoded.includes('\\')) return null;

    const segments = decoded.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return null;

    return segments;
}
