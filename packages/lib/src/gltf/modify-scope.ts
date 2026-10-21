import type { Entity } from 'playcanvas';
import { Entity as PcEntity } from 'playcanvas';
import type { ShallowRef, VNode } from 'vue';
import { computed, defineComponent, h, provide, shallowRef } from 'vue';

import { RuleProcessor } from './components/RuleProcessor.ts';
import { useGltf } from './composables/use-gltf.ts';
import { GltfKey } from './context.ts';
import type { Rule, MergedRule, ModifyComponentAction } from './types.ts';
import { ActionType } from './types.ts';
import type { EntityMetadata } from './utils/path-matcher.ts';
import { PathMatcher } from './utils/path-matcher.ts';

/**
 * Lets `<Modify.Node>` rules and `useEntity()` target the hierarchy under `rootEntity`.
 * Call it in the setup of the component that owns the hierarchy, and render `<ModifyRules>` alongside its slot.
 *
 * @param rootEntity The root of the hierarchy to modify, or null while it isn't available.
 * @private
 */
export function provideModifyScope(rootEntity: ShallowRef<Entity | null>): void {
    const rules = new Map<string, Rule>();
    const rulesVersion = shallowRef(0);
    const pathMatcher = new PathMatcher();

    // Rules match against the hierarchy as it was when the root became available
    const hierarchyCache = computed(() => {
        const cache = new Map<string, EntityMetadata>();
        if (rootEntity.value) buildHierarchyCache(rootEntity.value, '', cache);
        return cache;
    });

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
}

/**
 * Renders a RuleProcessor per matched entity. This is a separate component, so registering a rule
 * re-renders only the processors, and not the <Modify.Node> components that define the rules.
 * @private
 */
export const ModifyRules = defineComponent(
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
    { name: 'ModifyRules' }
);

/**
 * Builds a hierarchy cache by traversing the entity tree
 */
function buildHierarchyCache(entity: Entity, parentPath: string, cache: Map<string, EntityMetadata>): void {
    const path = parentPath ? `${parentPath}.${entity.name}` : entity.name;
    const guid = entity.getGuid();

    // Hierarchies can hold plain graph nodes, which have no GUID and can't be modified
    const childEntities = entity.children.filter((child): child is Entity => child instanceof PcEntity);
    const originalChildGUIDs = childEntities.map((child) => child.getGuid());

    cache.set(guid, {
        entity,
        path,
        guid,
        name: entity.name,
        originalChildGUIDs
    });

    // Recursively process children
    for (const child of childEntities) {
        buildHierarchyCache(child, path, cache);
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
