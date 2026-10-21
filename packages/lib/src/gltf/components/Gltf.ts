import type { Asset, ContainerResource, Entity } from 'playcanvas';
import type { PropType, SlotsType, VNode } from 'vue';
import { defineComponent, h, markRaw, shallowRef, watch } from 'vue';

import { useParent } from '../../composables/use-parent.ts';
import { ModifyRules, provideModifyScope } from '../modify-scope.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the public component declaration
export interface GltfProps {
    /**
     * The GLTF asset loaded via useModel
     */
    asset: Asset;

    /**
     * Whether to render the GLTF scene visuals
     * @default true
     */
    render?: boolean;
}

/**
 * Root component for GLTF scene modification system
 *
 * Provides:
 * - Instantiation of GLTF assets
 * - Hierarchy cache for entity lookups
 * - Rule collection and conflict resolution
 * - Batched modification application
 * - Optional rendering of GLTF visuals
 *
 * @example
 * ```vue
 * <script setup>
 * const { asset } = useModel('model.glb');
 * </script>
 *
 * <template>
 *   <Gltf v-if="asset" :asset="asset" :key="asset.id">
 *     <Modify.Node path="head.*[light]">
 *       <Modify.Light remove />
 *     </Modify.Node>
 *   </Gltf>
 * </template>
 * ```
 *
 * @example
 * ```vue
 * <!-- Don't render visuals, only process modifications -->
 * <Gltf :asset="asset" :render="false">
 *   <Modify.Node path="**[light]">
 *     <Modify.Light remove />
 *   </Modify.Node>
 * </Gltf>
 * ```
 */
export const Gltf = defineComponent(
    (props: GltfProps, { slots }) => {
        const parent = useParent();
        const rootEntity = shallowRef<Entity | null>(null);

        // Instantiate the asset
        watch(
            () => props.asset,
            (asset, _prev, onCleanup) => {
                if (!asset || !asset.resource || !parent) return;

                // Instantiate the render entity
                const resource = asset.resource as ContainerResource | undefined;
                if (!resource || typeof resource.instantiateRenderEntity !== 'function') {
                    console.error('Asset resource does not have instantiateRenderEntity method');
                    return;
                }
                const entity = resource.instantiateRenderEntity();

                if (!entity) {
                    console.error('Failed to instantiate GLTF asset');
                    return;
                }

                rootEntity.value = markRaw(entity);

                onCleanup(() => {
                    entity.destroy();
                    rootEntity.value = null;
                });
            },
            { immediate: true }
        );

        // Add root entity to parent scene
        watch(
            [rootEntity, () => props.render],
            ([entity, render], _prev, onCleanup) => {
                if (!entity || !parent || !render) return;

                parent.addChild(entity);

                onCleanup(() => {
                    // Only remove if still a child (the asset cleanup destroys it)
                    if (entity.parent === parent) {
                        parent.removeChild(entity);
                    }
                });
            },
            { immediate: true }
        );

        provideModifyScope(rootEntity);

        // Don't render anything until instantiated
        return () => (rootEntity.value ? [slots.default?.(), h(ModifyRules)] : null);
    },
    {
        name: 'Gltf',
        props: {
            asset: { type: Object as PropType<Asset>, required: true },
            render: { type: Boolean, default: true }
        },
        slots: Object as SlotsType<{ default?: () => VNode[] }>
    }
);
