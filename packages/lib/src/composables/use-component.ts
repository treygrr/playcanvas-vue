import type { Application, Component, Entity } from 'playcanvas';
import type { MaybeRefOrGetter, ShallowRef } from 'vue';
import { markRaw, shallowRef, toValue, watch, watchEffect } from 'vue';

import type { Schema } from '../utils/validation.ts';
import { applyProps } from '../utils/validation.ts';

import { useApp } from './use-app.ts';
import { useParent } from './use-parent.ts';

/**
 * Adds a component of type `ctype` to the parent entity, and keeps its properties in sync with `props`.
 * The component is removed when `ctype` becomes `null` or the calling component unmounts.
 *
 * @param ctype The component type, eg `'render'`. Pass `null` to not add a component (yet).
 * @param props A getter returning the props to apply. Reactive reads inside it are tracked.
 * @param schema The schema used to apply the props.
 * @returns A shallow ref to the engine component, or `null` when it hasn't been added.
 *
 * @example
 * useComponent('camera', () => ({ fov: props.fov }), cameraSchema);
 */
export function useComponent<T, InstanceType>(
    ctype: MaybeRefOrGetter<string | null>,
    props: () => T,
    schema: Schema<T, InstanceType>
): ShallowRef<Component | null> {
    const parent: Entity = useParent();
    const app: Application = useApp();
    const component = shallowRef<Component | null>(null);

    watch(
        () => toValue(ctype),
        (type, _prev, onCleanup) => {
            if (!type) return;

            const comp = parent.addComponent(type);
            component.value = comp ? markRaw(comp) : null;

            onCleanup(() => {
                component.value = null;

                if (!app || !app.root) return;

                type SystemKeys = keyof typeof app.systems;
                if (comp && app.systems[type as SystemKeys] && parent.c[type]) {
                    parent.removeComponent(type);
                }
            });
        },
        { immediate: true }
    );

    // Update component props
    watchEffect(() => {
        const nextProps = props() as Record<string, unknown>;
        const comp = component.value;
        if (!comp) return;

        const filteredProps = Object.fromEntries(Object.entries(nextProps).filter(([key]) => key in comp));

        applyProps(comp as InstanceType, schema, filteredProps as Record<keyof Component, unknown>);
    });

    return component;
}
