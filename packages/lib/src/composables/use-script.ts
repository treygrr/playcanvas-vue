import type { Application, Entity, Script, ScriptComponent } from 'playcanvas';
import type { MaybeRefOrGetter, ShallowRef } from 'vue';
import { markRaw, shallowRef, toRaw, toValue, watch } from 'vue';

import type { SubclassOf } from '../utils/types-utils.ts';

import { useApp } from './use-app.ts';
import { useParent } from './use-parent.ts';

/**
 * This composable adds a script instance to the parent entity.
 * Changing `scriptConstructor` destroys the current instance and creates a new one.
 *
 * @param scriptConstructor - The script class, or a ref/getter returning it.
 * @param props - A getter returning the properties to assign to the script. They are passed
 * to the script on creation, and re-assigned when they change.
 * @returns A shallow ref to the script instance.
 *
 * @example
 * const rotator = useScript(Rotator, () => ({ speed: speed.value }));
 */
export const useScript = <T extends Script>(
    scriptConstructor: MaybeRefOrGetter<SubclassOf<T>>,
    props: () => Record<string, unknown> = () => ({})
): ShallowRef<T | null> => {
    const parent: Entity = useParent();
    const app: Application = useApp();
    const script = shallowRef(null) as ShallowRef<T | null>;

    const rawProps = () => Object.fromEntries(Object.entries(props()).map(([key, value]) => [key, toRaw(value)]));

    watch(
        () => toValue(scriptConstructor),
        (constructor, _prev, onCleanup) => {
            if (!app) return;

            // Ensure the parent entity has a script component
            if (!parent.script) {
                parent.addComponent('script');
            }

            // Create the script instance with the provided attributes
            const scriptComponent: ScriptComponent = parent.script as ScriptComponent;
            const scriptInstance = scriptComponent.create(constructor as unknown as typeof Script, {
                properties: rawProps(),
                preloading: false
            }) as T | null;

            script.value = scriptInstance ? markRaw(scriptInstance) : null;

            // Remove the script when the constructor changes or the component unmounts
            onCleanup(() => {
                script.value = null;

                if (app && app.root && scriptInstance) {
                    scriptComponent.destroy(constructor as unknown as Parameters<ScriptComponent['destroy']>[0]);
                }
            });
        },
        { immediate: true }
    );

    // Update script props when they change
    watch(rawProps, (nextProps) => {
        const instance = script.value;
        if (!instance) return;

        const filteredProps = Object.fromEntries(Object.entries(nextProps).filter(([key]) => key in instance));

        Object.assign(instance, filteredProps);
    });

    return script;
};
