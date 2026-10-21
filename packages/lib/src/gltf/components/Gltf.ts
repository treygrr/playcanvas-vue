import type { Asset, ContainerResource, Entity } from 'playcanvas';
import type { PropType, SlotsType, VNode } from 'vue';
import { computed, defineComponent, h, markRaw, provide, shallowRef, watch } from 'vue';

import { useParent } from '../../composables/use-parent.ts';
import { GltfKey } from '../context.ts';
import type { Rule, MergedRule, ModifyComponentAction } from '../types.ts';
import { ActionType } from '../types.ts';
import type { EntityMetadata } from '../utils/path-matcher.ts';
import { PathMatcher } from '../utils/path-matcher.ts';
import { useGltf } from '../composables/use-gltf.ts';

import { RuleProcessor } from './RuleProcessor.ts';

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
 * Renders a RuleProcessor per matched entity. This is a separate component, so registering a rule
 * re-renders only the processors, and not the <Modify.Node> components in the Gltf slot.
 */
const GltfRules = defineComponent(
    () => {
        const { mergedRules, hierarchyCache } = useGltf();

        return () =>
            Array.from(mergedRules.value.entries()).map(([guid, rule]) => {
                const metadata = hierarchyCache.value.get(guid);
                if (!metadata) return null;

                return h(RuleProcessor, {
                    key: guid,
                    entity: metadata.entity,
                    rule,
                    originalChildGUIDs: metadata.originalChildGUIDs ?? []
                });
            });
    },
    { name: 'GltfRules' }
);

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
        const hierarchyCache = shallowRef<Map<string, EntityMetadata>>(new Map());
        const rules = new Map<string, Rule>();
        const rulesVersion = shallowRef(0);
        const pathMatcher = new PathMatcher();

        // Instantiate asset and build hierarchy cache
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

                // Build hierarchy cache
                const cache = new Map<string, EntityMetadata>();
                buildHierarchyCache(entity, '', cache);

                rootEntity.value = markRaw(entity);
                hierarchyCache.value = cache;

                onCleanup(() => {
                    entity.destroy();
                    rootEntity.value = null;
                    hierarchyCache.value = new Map();
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

        // Process rules and resolve conflicts
        const mergedRules = computed(() => {
            // Re-process when rules are registered or unregistered
            void rulesVersion.value;

            const cache = hierarchyCache.value;
            const merged = new Map<string, MergedRule>();
            if (!rootEntity.value || cache.size === 0) return merged;

            // For each entity in the hierarchy
            for (const [guid, metadata] of cache.entries()) {
                // Find all rules that match this entity
                const matchingRules = [...rules.values()].filter((rule) => pathMatcher.matches(rule.path, metadata));

                // If no rules match, skip
                if (matchingRules.length === 0) continue;

                // Merge and resolve conflicts
                merged.set(guid, mergeRules(guid, matchingRules));
            }

            return merged;
        });

        provide(GltfKey, {
            hierarchyCache,
            rootEntity,
            pathMatcher,
            mergedRules,
            registerRule: (rule: Rule) => {
                rules.set(rule.id, rule);
                rulesVersion.value++;
            },
            unregisterRule: (ruleId: string) => {
                if (rules.delete(ruleId)) rulesVersion.value++;
            }
        });

        // Don't render anything until instantiated
        return () => (rootEntity.value ? [slots.default?.(), h(GltfRules)] : null);
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

/**
 * Builds a hierarchy cache by traversing the entity tree
 */
function buildHierarchyCache(entity: Entity, parentPath: string, cache: Map<string, EntityMetadata>): void {
    const path = parentPath ? `${parentPath}.${entity.name}` : entity.name;
    const guid = entity.getGuid();

    const originalChildGUIDs = entity.children.map((child) => (child as Entity).getGuid());

    cache.set(guid, {
        entity,
        path,
        guid,
        name: entity.name,
        originalChildGUIDs
    });

    // Recursively process children
    for (const child of entity.children) {
        buildHierarchyCache(child as Entity, path, cache);
    }
}

/**
 * Merges multiple rules for the same entity and resolves conflicts
 */
function mergeRules(entityGuid: string, rules: Rule[]): MergedRule {
    const merged: MergedRule = {
        entityGuid,
        clearChildren: false,
        componentActions: new Map(),
        addChildren: []
    };

    // Sort rules by specificity (highest first)
    const sortedRules = [...rules].sort((a, b) => b.specificity - a.specificity);

    // Process each rule
    for (const rule of sortedRules) {
        for (const action of rule.actions) {
            switch (action.type) {
                case ActionType.CLEAR_CHILDREN:
                    // First rule with clearChildren wins
                    if (!merged.clearChildren) {
                        merged.clearChildren = true;
                    }
                    break;

                case ActionType.ADD_CHILDREN: {
                    // Collect all additions
                    const addAction = action as { children: VNode[] };
                    merged.addChildren.push(...addAction.children);
                    break;
                }

                case ActionType.MODIFY_COMPONENT: {
                    // For component actions, highest specificity wins per component type
                    const componentAction = action as ModifyComponentAction;
                    if (!merged.componentActions.has(componentAction.componentType)) {
                        merged.componentActions.set(componentAction.componentType, action);
                    }
                    break;
                }
            }
        }
    }

    return merged;
}
