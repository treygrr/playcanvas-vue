import type { InjectionKey } from 'vue';

import type { GltfContextValue } from './types.ts';

/**
 * Injection key for Gltf
 * Provides access to the hierarchy cache and rule registration
 */
export const GltfKey: InjectionKey<GltfContextValue> = Symbol('pc-gltf');
