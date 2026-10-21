import { createError, defineEventHandler, getRouterParam, setHeaders, useStorage } from '#imports';

import { contentType } from '../utils/content-type';
import { safePathSegments } from '../utils/paths';
import { readVersionFile } from '../utils/store';

/**
 * GET <baseURL>/files/<slug>/<version>/<path>
 *
 * A file of a CMS project version. Versions never change, so files are cached as immutable.
 */
export default defineEventHandler(async (event) => {
    const segments = safePathSegments(getRouterParam(event, '_') ?? '');
    const [slug, version, ...rest] = segments ?? [];
    const path = rest.join('/');

    if (!slug || !version || !path) throw createError({ statusCode: 404 });

    const data = await readVersionFile(useStorage('playcanvas'), slug, version, path);
    if (!data) throw createError({ statusCode: 404 });

    const type = contentType(path);
    setHeaders(event, {
        'content-type': type,
        'content-length': data.length,
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        // Exports can hold HTML assets. Served from this site, they mustn't run as its pages
        ...(type === 'text/html' || type === 'image/svg+xml' ? { 'content-security-policy': 'sandbox' } : {})
    });

    return data;
});
