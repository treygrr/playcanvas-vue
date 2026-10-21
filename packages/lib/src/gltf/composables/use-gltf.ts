import { inject } from 'vue';

import { GltfKey } from '../context.ts';
import type { GltfContextValue } from '../types.ts';

/**
 * Composable to access the Gltf context
 * Provides access to the hierarchy cache and utilities
 *
 * @returns The Gltf context value
 * @throws Error if used outside of a Gltf component
 *
 * @example
 * ```ts
 * const { hierarchyCache, rootEntity } = useGltf();
 * ```
 */
export function useGltf(): GltfContextValue {
    const context = inject(GltfKey, null);

    if (!context) {
        throw new Error('useGltf must be used within a <Gltf> component');
    }

    return context;
}
