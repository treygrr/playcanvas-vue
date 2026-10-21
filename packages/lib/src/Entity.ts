import { Entity as PcEntity } from 'playcanvas';
import type { SlotsType, VNode } from 'vue';
import { defineComponent, markRaw, onScopeDispose, watchEffect } from 'vue';

import { useApp } from './composables/use-app.ts';
import { provideParent, useParent } from './composables/use-parent.ts';
import { usePointerEventsContext } from './contexts/pointer-events.ts';
import type { SyntheticMouseEvent, SyntheticPointerEvent } from './utils/synthetic-event.ts';
import type { ComponentDefinition } from './utils/validation.ts';
import { validatePropsWithDefaults } from './utils/validation.ts';

type PointerEventCallback = (event: SyntheticPointerEvent) => void;
type MouseEventCallback = (event: SyntheticMouseEvent) => void;
type Listener<T> = T | T[];

/**
 * The pointer events an entity can listen to, mapped to the Vue prop that `@event` binds to.
 */
const pointerEventProps = [
    ['pointerdown', 'onPointerdown'],
    ['pointerup', 'onPointerup'],
    ['pointerover', 'onPointerover'],
    ['pointerout', 'onPointerout'],
    ['click', 'onClick']
] as const;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the public prop declaration
export interface EntityProps {
    /**
     * The name of the entity
     * @default "Untitled"
     */
    name?: string;

    /**
     * The local position of the entity relative to its parent.
     * @default [0, 0, 0]
     */
    position?: [number, number, number];

    /**
     * The local scale of the entity relative to its parent.
     * @default [1, 1, 1]
     */
    scale?: [number, number, number];

    /**
     * The local rotation of the entity relative to its parent.
     * The rotation is specified as euler angles in degrees.
     * @default [0, 0, 0]
     */
    rotation?: [number, number, number];

    /** Bound with `@pointerdown`. */
    onPointerdown?: Listener<PointerEventCallback>;
    /** Bound with `@pointerup`. */
    onPointerup?: Listener<PointerEventCallback>;
    /** Bound with `@pointerover`. */
    onPointerover?: Listener<PointerEventCallback>;
    /** Bound with `@pointerout`. */
    onPointerout?: Listener<PointerEventCallback>;
    /** Bound with `@click`. */
    onClick?: Listener<MouseEventCallback>;
}

/**
 * The value exposed through a template ref on `<Entity>`.
 */
export type EntityExposed = {
    /** The underlying PlayCanvas entity */
    entity: PcEntity;
};

/**
 * The Entity component is the fundamental building block of a PlayCanvas scene.
 * It represents a node in the scene graph and can have components attached to it.
 * Use a template ref to access the underlying PlayCanvas entity via `.entity`.
 *
 * @example
 * <Entity name="myEntity" :position="[0, 1, 0]">
 *   <Render type="box" />
 * </Entity>
 *
 * @example
 * // With pointer events
 * <Entity :position="[0, 1, 0]" @pointerdown="onDown" @click="onClick">
 *   <Render type="sphere" />
 * </Entity>
 */
export const Entity = defineComponent(
    (props: EntityProps, { slots, expose }) => {
        const parent = useParent();
        const app = useApp();
        const pointerEvents = usePointerEventsContext();

        // The entity lives as long as the component
        const entity = markRaw(new PcEntity(undefined, app));
        parent.addChild(entity);
        provideParent(entity);

        onScopeDispose(() => {
            parent.removeChild(entity);
            entity.destroy();
        });

        // Update entity properties when they change
        watchEffect(() => {
            const { name, position, scale, rotation } = validatePropsWithDefaults(
                {
                    name: props.name,
                    position: props.position,
                    scale: props.scale,
                    rotation: props.rotation
                },
                componentDefinition as ComponentDefinition<EntityProps, PcEntity>
            );
            entity.name = name as string;
            entity.setLocalPosition(...(position as [number, number, number]));
            entity.setLocalScale(...(scale as [number, number, number]));
            entity.setLocalEulerAngles(...(rotation as [number, number, number]));
        });

        // Pointer events
        watchEffect((onCleanup) => {
            const listeners = pointerEventProps.flatMap(([event, prop]) => {
                const value = props[prop] as Listener<(e: unknown) => void> | undefined;
                const handlers = Array.isArray(value) ? value : value ? [value] : [];
                return handlers.map((handler) => [event, handler] as const);
            });

            if (listeners.length === 0) return;

            const guid = entity.getGuid();
            pointerEvents.add(guid);
            listeners.forEach(([event, handler]) => entity.on(event, handler));

            onCleanup(() => {
                pointerEvents.delete(guid);
                listeners.forEach(([event, handler]) => entity.off(event, handler));
            });
        });

        expose({ entity } satisfies EntityExposed);

        return () => slots.default?.();
    },
    {
        name: 'Entity',
        props: {
            name: { type: String, default: undefined },
            position: { type: Array, default: undefined },
            scale: { type: Array, default: undefined },
            rotation: { type: Array, default: undefined },
            ...Object.fromEntries(
                pointerEventProps.map(([, prop]) => [prop, { type: [Function, Array], default: undefined }])
            )
        } as never,
        slots: Object as SlotsType<{ default?: () => VNode[] }>
    }
);

const componentDefinition = {
    name: 'Entity',
    apiName: 'Entity',
    schema: {
        name: {
            validate: (val: unknown) => !val || typeof val === 'string',
            errorMsg: (val: unknown) => `Invalid value for prop "name": "${val}". Expected a string or undefined.`,
            default: 'Untitled'
        },
        position: {
            validate: (val: unknown) => Array.isArray(val) && val.length === 3,
            errorMsg: (val: unknown) => `Invalid value for prop "position": "${val}". Expected an array of 3 numbers.`,
            default: [0, 0, 0]
        },
        scale: {
            validate: (val: unknown) => Array.isArray(val) && val.length === 3,
            errorMsg: (val: unknown) => `Invalid value for prop "scale": "${val}". Expected an array of 3 numbers.`,
            default: [1, 1, 1]
        },
        rotation: {
            validate: (val: unknown) => Array.isArray(val) && val.length === 3,
            errorMsg: (val: unknown) => `Invalid value for prop "rotation": "${val}". Expected an array of 3 numbers.`,
            default: [0, 0, 0]
        }
    }
};
