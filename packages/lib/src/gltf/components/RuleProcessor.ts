import type { Entity, Component } from 'playcanvas';
import type { Component as VueComponent, PropType, VNode } from 'vue';
import { cloneVNode, defineComponent, isVNode, watchEffect } from 'vue';

import { Camera } from '../../components/Camera.ts';
import { Light } from '../../components/Light.ts';
import { Render } from '../../components/Render.ts';
import { provideParent } from '../../composables/use-parent.ts';
import type { ComponentDefinition, Schema } from '../../utils/validation.ts';
import { validatePropsPartial, applyProps, warnOnce } from '../../utils/validation.ts';
import type { MergedRule, ModifyComponentAction, SupportedComponentType } from '../types.ts';
import { ActionType } from '../types.ts';
import { componentSchemaRegistry } from '../utils/schema-registry.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the public component declaration
export interface RuleProcessorProps {
    entity: Entity;
    rule: MergedRule;
    originalChildGUIDs: string[];
}

// Components that can't be added to an entity which already has one of their type
const componentTypes = new Map<VueComponent, [string, SupportedComponentType]>([
    [Light, ['Light', 'light']],
    [Render, ['Render', 'render']],
    [Camera, ['Camera', 'camera']]
]);

/**
 * Internal component that applies final merged rules to entities
 * Handles component modifications and renders new children
 */
export const RuleProcessor = defineComponent(
    (props: RuleProcessorProps) => {
        // Children are rendered as children of the matched entity. The component is keyed by entity GUID,
        // so the entity never changes for an instance.
        provideParent(props.entity);

        // Store original component values to ensure functional updates always use original values
        // Map structure: componentType -> propName -> originalValue
        const originalValues = new Map<string, Map<string, unknown>>();

        // Apply modifications whenever the rule changes. This runs as an effect, so reactive state
        // read by a functional update (eg `(v) => v * factor`) re-applies it when that state changes.
        // Every step is idempotent, so re-running it is safe.
        watchEffect(() => {
            const { entity, rule } = props;

            // 1. Clear children if requested
            if (rule.clearChildren) {
                // Build a Map of current children by GUID for O(1) lookup
                const childrenByGuid = new Map<string, Entity>(
                    entity.children.map((c) => [(c as Entity).getGuid(), c as Entity])
                );

                // Find original children efficiently
                const originalChildren = props.originalChildGUIDs
                    .map((guid) => childrenByGuid.get(guid))
                    .filter((child): child is Entity => child !== undefined);

                // Now, we only destroy the original children
                originalChildren.forEach((child) => {
                    entity.removeChild(child);
                    child.destroy();
                });
            }

            // 2. First pass: Capture original values for all functional updates
            for (const [componentType, action] of rule.componentActions.entries()) {
                if (action.type !== ActionType.MODIFY_COMPONENT) continue;

                const existingComponent = entity.c?.[componentType];
                if (!existingComponent) continue;

                const { remove, ...mergeProps } = (action as ModifyComponentAction).props;

                if (remove) continue; // Skip removal actions for capturing

                // Capture original values for functional updates
                if (!originalValues.has(componentType)) {
                    originalValues.set(componentType, new Map());
                }
                const comp = existingComponent as unknown as Record<string, unknown>;
                const componentOriginals = originalValues.get(componentType)!;

                for (const propName in mergeProps) {
                    if (typeof mergeProps[propName] === 'function' && !componentOriginals.has(propName)) {
                        componentOriginals.set(propName, comp[propName]);
                    }
                }
            }

            // 3. Second pass: Apply component actions with prop merging using component schemas
            for (const [componentType, action] of rule.componentActions.entries()) {
                if (action.type !== ActionType.MODIFY_COMPONENT) continue;

                const existingComponent = entity.c?.[componentType];
                if (!existingComponent) continue;

                const { remove, ...mergeProps } = (action as ModifyComponentAction).props;

                // 'remove' prop always wins
                if (remove) {
                    entity.removeComponent(componentType);
                    continue;
                }

                // Get component definition from registry
                const componentDef = componentSchemaRegistry[componentType] as
                    ComponentDefinition<Record<string, unknown>, Component> | undefined;

                if (!componentDef || !componentDef.schema) {
                    throw new Error(
                        `No component schema found for component type "${componentType}". Component must be registered in schema registry.`
                    );
                }

                // Execute functional props and prepare for validation
                const propsToValidate: Record<string, unknown> = {};
                const comp = existingComponent as unknown as Record<string, unknown>;
                const schema = componentDef.schema as Schema<Record<string, unknown>, Component>;
                const componentOriginals = originalValues.get(componentType);

                for (const propName in mergeProps) {
                    const propValue = mergeProps[propName];

                    if (typeof propValue === 'function') {
                        // Functional update (e.g., :intensity="(val) => val * 2")
                        // Always use original value if captured, otherwise fall back to current value
                        const originalValue = componentOriginals?.get(propName);
                        const valueToUse = originalValue !== undefined ? originalValue : comp[propName];
                        propsToValidate[propName] = propValue(valueToUse);
                    } else {
                        // Direct value
                        propsToValidate[propName] = propValue;
                    }
                }

                // Validate props using component schema, without warning about unknown props
                const validatedProps = validatePropsPartial(propsToValidate, componentDef, false);

                // Apply validated props using schema's apply functions
                applyProps(existingComponent as Component, schema, validatedProps as Record<string, unknown>);
            }
        });

        // Render new children
        return () =>
            props.rule.addChildren.map((child, index) => {
                if (!isVNode(child)) return child;

                // Warn if adding a component the entity already has
                const known = componentTypes.get(child.type as VueComponent);
                if (known) {
                    const [displayName, componentType] = known;
                    if (props.entity.c?.[componentType]) {
                        warnOnce(
                            `Cannot add <${displayName}> component to entity "${props.entity.name}". ` +
                                `Entity already has a ${componentType} component. ` +
                                `Use <Modify.${displayName}> to modify the existing component, or <Modify.${displayName} remove> to remove it first.`
                        );
                    }
                }

                // Clone with a unique key, as the same vnode may be rendered for several entities
                return cloneVNode(child, { key: `${props.rule.entityGuid}:add:${index}` }) as VNode;
            });
    },
    {
        name: 'RuleProcessor',
        props: {
            entity: { type: Object as PropType<Entity>, required: true },
            rule: { type: Object as PropType<MergedRule>, required: true },
            originalChildGUIDs: { type: Array as PropType<string[]>, required: true }
        }
    }
);
