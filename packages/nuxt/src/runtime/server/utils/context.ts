import { useRuntimeConfig, useStorage } from '#imports';

import { createPlayCanvasClient } from './playcanvas-api';

/** The storage mount holding CMS projects */
export const usePlayCanvasStorage = () => useStorage('playcanvas');

/**
 * A PlayCanvas API client using the server-only token from `NUXT_PLAYCANVAS_TOKEN`.
 * Throws if no token is configured.
 */
export const usePlayCanvasClient = () =>
    createPlayCanvasClient({ token: (useRuntimeConfig().playcanvas as { token?: string } | undefined)?.token ?? '' });
