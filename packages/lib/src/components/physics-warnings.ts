import { watch } from 'vue';

import { usePhysics } from '../contexts/physics.ts';
import { warnOnce } from '../utils/validation.ts';

/**
 * Warns when a physics component is used without physics enabled, or when physics failed to load.
 * @param name The component name, eg `RigidBody`.
 * @param example A usage example of the component, eg `<RigidBody type="box" />`.
 * @returns The physics state.
 * @private
 */
export function usePhysicsWarnings(name: string, example: string) {
    const physics = usePhysics();

    watch(
        () => [physics.isPhysicsEnabled, physics.physicsError] as const,
        ([isPhysicsEnabled, physicsError]) => {
            if (!isPhysicsEnabled) {
                warnOnce(
                    `The \`<${name}>\` component requires physics to be enabled.\n\n` +
                        'To fix this:\n' +
                        '1. Add the `use-physics` prop to your root Application component:\n' +
                        '   <Application use-physics>\n' +
                        '     <Entity>\n' +
                        `       ${example}\n` +
                        '     </Entity>\n' +
                        '   </Application>\n\n' +
                        '2. Make sure you have the required dependencies installed:\n' +
                        '   npm install sync-ammo\n\n' +
                        'For more information, see: https://developer.playcanvas.com/user-manual/playcanvas-react/guide/physics'
                );
            }

            if (physicsError) {
                warnOnce(
                    `Physics initialization failed: ${physicsError.message}\n\n` +
                        'To fix this:\n' +
                        '1. Install the required dependency:\n' +
                        '   npm install sync-ammo\n\n' +
                        '2. Make sure your bundler is configured to handle WASM files\n\n' +
                        '3. Check that your server is configured to serve .wasm files with the correct MIME type\n\n' +
                        'For more information, see: https://developer.playcanvas.com/user-manual/playcanvas-react/guide/physics#troubleshooting'
                );
            }
        },
        { immediate: true }
    );

    return physics;
}
