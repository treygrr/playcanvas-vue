import type { AppBase } from 'playcanvas';
import { inject, provide, readonly, shallowReactive, watch } from 'vue';

import { PhysicsKey } from './keys.ts';

/**
 * Physics context type containing physics state information.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the public context declaration
export interface PhysicsContextType {
    /**
     * Whether physics is enabled on the application.
     */
    isPhysicsEnabled: boolean;
    /**
     * Whether the physics library has been successfully loaded.
     */
    isPhysicsLoaded: boolean;
    /**
     * The error that occurred when loading physics, if any.
     */
    physicsError: Error | null;
}

const defaultPhysics: Readonly<PhysicsContextType> = readonly({
    isPhysicsEnabled: false,
    isPhysicsLoaded: false,
    physicsError: null
});

// Track how many Application instances are using physics
let physicsInstanceCount = 0;

/**
 * Composable to access physics state. The returned object is reactive, so read
 * its fields inside a template, `computed` or `watch` to track changes.
 *
 * @returns Physics context containing physics state information
 *
 * @example
 * ```vue
 * <script setup>
 * import { usePhysics } from '@treygrr/playcanvas-vue/composables';
 * const physics = usePhysics();
 * </script>
 *
 * <template>
 *   <p v-if="physics.physicsError">Physics error: {{ physics.physicsError.message }}</p>
 *   <p v-else-if="!physics.isPhysicsLoaded">Loading physics...</p>
 * </template>
 * ```
 */
export const usePhysics = (): Readonly<PhysicsContextType> => inject(PhysicsKey, defaultPhysics);

/**
 * Loads the physics library when `enabled` is true, and provides the physics state to descendants.
 * @private
 */
export function providePhysics(app: AppBase, enabled: () => boolean): void {
    const state = shallowReactive<PhysicsContextType>({
        isPhysicsEnabled: false,
        isPhysicsLoaded: false,
        physicsError: null
    });

    watch(
        enabled,
        (isEnabled, _prev, onCleanup) => {
            state.isPhysicsEnabled = isEnabled;
            state.isPhysicsLoaded = false;
            state.physicsError = null;

            if (!isEnabled) return;

            let cancelled = false;
            let counted = false;

            const loadPhysics = async () => {
                try {
                    // @ts-expect-error The PC Physics system expects a global Ammo instance
                    if (!globalThis.Ammo) {
                        const Ammo = await import('sync-ammo');
                        // @ts-expect-error The PC Physics system expects a global Ammo instance
                        globalThis.Ammo = Ammo.default;
                    }

                    if (cancelled) return;

                    // Only initialize the library if not already done so
                    if (!app.systems.rigidbody?.dispatcher) {
                        app.systems.rigidbody?.onLibraryLoaded();
                    }

                    physicsInstanceCount++;
                    counted = true;
                    state.isPhysicsLoaded = true;
                } catch (error) {
                    if (cancelled) return;
                    state.physicsError = error instanceof Error ? error : new Error('Failed to load physics library');
                }
            };

            loadPhysics();

            onCleanup(() => {
                cancelled = true;
                if (!counted) return;
                // Only clean up Ammo if this is the last instance using physics
                physicsInstanceCount--;
                if (physicsInstanceCount === 0) {
                    // @ts-expect-error Clean up the global Ammo instance
                    if (globalThis.Ammo) delete globalThis.Ammo;
                }
            });
        },
        { immediate: true }
    );

    provide(PhysicsKey, readonly(state) as Readonly<PhysicsContextType>);
}
