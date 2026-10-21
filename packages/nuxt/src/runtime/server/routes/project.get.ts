import {
    createError,
    defineEventHandler,
    getQuery,
    getRouterParam,
    setHeader,
    useRuntimeConfig,
    useStorage
} from '#imports';

import { resolveVersion } from '../utils/records';
import { getProject, toPublicProject } from '../utils/store';

/**
 * GET <baseURL>/projects/<slug>.json
 *
 * Which version of a CMS project to show, and how to load it. Projects made from zips in the repo
 * are static files at the same URL, which are served before this route.
 */
export default defineEventHandler(async (event) => {
    const name = getRouterParam(event, 'slug') ?? '';
    if (!name.endsWith('.json')) throw createError({ statusCode: 404 });

    const slug = decodeURIComponent(name.slice(0, -'.json'.length));
    const { preview } = getQuery(event);
    const { baseURL } = useRuntimeConfig().public.playcanvas as { baseURL: string };

    const project = await getProject(useStorage('playcanvas'), slug);
    const version = project && resolveVersion(project, { preview: typeof preview === 'string' ? preview : null });

    if (!project || !version) {
        throw createError({ statusCode: 404, statusMessage: `There is no PlayCanvas project "${slug}"` });
    }

    // Always check for a newer live version. Previews are private to whoever has the link
    setHeader(event, 'cache-control', preview ? 'private, no-store' : 'no-cache');

    return toPublicProject(project, version, baseURL);
});
