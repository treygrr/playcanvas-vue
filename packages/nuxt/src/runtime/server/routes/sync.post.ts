import { createError, defineEventHandler, getHeader, readBody, useRuntimeConfig, useStorage } from '#imports';

import { usePlayCanvasClient } from '../utils/context';
import { timingSafeEqual } from '../utils/records';
import { syncAllProjects, syncProjectOnce } from '../utils/sync';

/**
 * POST <baseURL>/api/sync
 *
 * Syncs tracked PlayCanvas projects with their published apps, for cron jobs and CI. Send the secret
 * from NUXT_PLAYCANVAS_SYNC_SECRET as a bearer token. Disabled when no secret is set.
 *
 * Body (optional): `{ "slug": "my-game" }` to sync one project.
 */
export default defineEventHandler(async (event) => {
    const { syncSecret } = useRuntimeConfig().playcanvas as { syncSecret?: string };
    if (!syncSecret) throw createError({ statusCode: 404 });

    const token = getHeader(event, 'authorization')?.match(/^Bearer (.+)$/)?.[1] ?? '';
    if (!timingSafeEqual(token, syncSecret)) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });

    const body = await readBody<{ slug?: string } | undefined>(event).catch(() => undefined);
    const storage = useStorage('playcanvas');
    const client = usePlayCanvasClient();

    const results = body?.slug
        ? [await syncProjectOnce(storage, client, body.slug)]
        : await syncAllProjects(storage, client);

    return { results };
});
