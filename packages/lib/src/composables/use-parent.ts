import type { Entity } from 'playcanvas';
import { inject, markRaw, provide } from 'vue';

import { ParentKey } from '../contexts/keys.ts';

/**
 * This composable returns the parent entity.
 * @returns {Entity} parent - The parent entity.
 *
 * @example
 * const parent = useParent();
 */
export const useParent = (): Entity => {
    const parent = inject(ParentKey, undefined);
    if (parent === undefined) {
        throw new Error('`useParent` must be used within an Application or Entity component');
    }
    return parent;
};

/**
 * Makes `entity` the parent of every engine component and entity below the calling component.
 * @private
 */
export const provideParent = (entity: Entity): void => {
    provide(ParentKey, markRaw(entity));
};
