import type { Application } from 'playcanvas';
import { inject } from 'vue';

import { AppKey } from '../contexts/keys.ts';

/**
 * This composable returns the PlayCanvas application instance.
 * @returns {Application} app - The application instance.
 *
 * @example
 * const app = useApp();
 */
export const useApp = (): Application => {
    const app = inject(AppKey, null);
    if (!app) {
        throw new Error('`useApp` must be used within an Application component');
    }
    return app;
};
