import type { Asset, ContainerResource, Entity as PcEntity } from 'playcanvas';
import type { PropType, SlotsType, VNode } from 'vue';
import { defineComponent, h, shallowRef, watch } from 'vue';

import type { EntityExposed } from './Entity.ts';
import { Entity } from './Entity.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the public prop declaration
export interface ContainerProps {
    /** The container asset to render, eg from `useModel()` */
    asset: Asset;
}

/**
 * Renders a PlayCanvas container asset (a GLB/glTF) as an entity hierarchy.
 * Other attributes, such as `position`, are passed on to the wrapping `<Entity>`.
 *
 * @example
 * const { asset } = useModel('model.glb');
 * // <Container v-if="asset" :asset="asset" :position="[0, 1, 0]" />
 */
export const Container = defineComponent(
    (props: ContainerProps, { slots }) => {
        const entityRef = shallowRef<EntityExposed | null>(null);

        watch(
            [() => props.asset, () => entityRef.value?.entity],
            ([asset, entity], _prev, onCleanup) => {
                if (!entity || !asset?.resource) return;

                const resource = asset.resource as ContainerResource;
                const assetEntity: PcEntity = resource.instantiateRenderEntity();
                entity.addChild(assetEntity);

                onCleanup(() => {
                    // Don't destroy the underlying resource as it may be used by other components
                    assetEntity.destroy();
                });
            },
            { immediate: true }
        );

        return () => (props.asset?.resource ? h(Entity, { ref: entityRef }, slots) : null);
    },
    {
        name: 'Container',
        props: { asset: { type: Object as PropType<Asset>, required: true } },
        slots: Object as SlotsType<{ default?: () => VNode[] }>
    }
);
