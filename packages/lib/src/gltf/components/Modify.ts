import type { PropType, VNode } from 'vue';
import { Comment, Fragment, Text, defineComponent, onMounted, onScopeDispose, onUpdated } from 'vue';

import { normalizeVNodeProps } from '../../utils/vue-props.ts';
import { useGltf } from '../composables/use-gltf.ts';
import type {
    Rule,
    Action,
    ModifyNodeProps,
    ModifyLightProps,
    ModifyRenderProps,
    ModifyCameraProps,
    SupportedComponentType
} from '../types.ts';
import { ActionType } from '../types.ts';
import type { PathPredicate } from '../utils/path-matcher.ts';
import { defaultPathMatcher } from '../utils/path-matcher.ts';

let ruleIdCounter = 0;

// Modify.Light, Modify.Render and Modify.Camera only describe a modification. They are read by
// Modify.Node and never actually render.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches Vue's own props constraint
const createModifyComponent = <P extends Record<string, any>>(name: string) =>
    defineComponent((_props: P) => () => null, { name, inheritAttrs: false });

/**
 * Modify.Light component for modifying existing light components on matched entities
 * Must be a child of <Modify.Node>
 *
 * @example
 * ```vue
 * <!-- Remove a light component -->
 * <Modify.Light remove />
 *
 * <!-- Modify light properties -->
 * <Modify.Light color="red" :intensity="2" />
 *
 * <!-- Functional update -->
 * <Modify.Light :intensity="(val) => val * 2" />
 * ```
 */
export const ModifyLight = createModifyComponent<ModifyLightProps>('ModifyLight');

/**
 * Modify.Render component for modifying existing render components on matched entities
 * Must be a child of <Modify.Node>
 *
 * @example
 * ```vue
 * <Modify.Render remove />
 * <Modify.Render cast-shadows receive-shadows />
 * <Modify.Render :cast-shadows="(val) => !val" />
 * ```
 */
export const ModifyRender = createModifyComponent<ModifyRenderProps>('ModifyRender');

/**
 * Modify.Camera component for modifying existing camera components on matched entities
 * Must be a child of <Modify.Node>
 *
 * @example
 * ```vue
 * <Modify.Camera remove />
 * <Modify.Camera :fov="60" :near-clip="0.1" :far-clip="1000" />
 * <Modify.Camera :fov="(val) => val + 10" />
 * ```
 */
export const ModifyCamera = createModifyComponent<ModifyCameraProps>('ModifyCamera');

const componentModifiers = new Map<unknown, SupportedComponentType>([
    [ModifyLight, 'light'],
    [ModifyRender, 'render'],
    [ModifyCamera, 'camera']
]);

/**
 * Flattens fragments (from `v-for` and `<template>`), dropping comments (from `v-if`) and whitespace
 */
const flattenVNodes = (vnodes: VNode[]): VNode[] =>
    vnodes.flatMap((vnode) => {
        if (vnode.type === Fragment) return flattenVNodes(vnode.children as VNode[]);
        if (vnode.type === Comment) return [];
        if (vnode.type === Text && !String(vnode.children).trim()) return [];
        return [vnode];
    });

/**
 * Builds a rule from the props and slot content of a Modify.Node
 */
function createRule(id: string, path: string | PathPredicate, clearChildren: boolean, children: VNode[]): Rule {
    const actions: Action[] = [];
    const addChildren: VNode[] = [];
    const specificity = defaultPathMatcher.getSpecificity(path);

    // Process children to separate Modify.* components from additions
    for (const child of flattenVNodes(children)) {
        const componentType = componentModifiers.get(child.type);

        if (componentType) {
            actions.push(createComponentAction(componentType, normalizeVNodeProps(child.props), id));
        } else {
            // This is a new child to add
            addChildren.push(child);
        }
    }

    // Add clearChildren action if specified
    if (clearChildren) {
        actions.push({ type: ActionType.CLEAR_CHILDREN, ruleId: id, specificity });
    }

    // Add children action if there are any
    if (addChildren.length > 0) {
        actions.push({ type: ActionType.ADD_CHILDREN, children: addChildren, ruleId: id, specificity });
    }

    return { id, path, actions, specificity };
}

/**
 * Creates a component modification action from component props
 */
function createComponentAction(
    componentType: SupportedComponentType,
    props: Record<string, unknown>,
    ruleId: string
): Action {
    const { remove, ...mergeProps } = props;

    // Create modify action with all props (remove will be handled in RuleProcessor)
    return {
        type: ActionType.MODIFY_COMPONENT,
        ruleId,
        componentType,
        specificity: 0, // Will be set by parent rule
        props: { remove, ...mergeProps }
    };
}

/**
 * ModifyNode component for defining entity modification rules
 * Must be a direct child of <Gltf>
 * Renders nothing - only registers rules
 *
 * @example
 * ```vue
 * <Modify.Node path="head.*[light]" clear-children>
 *   <Light color="red" />
 *   <Modify.Render :cast-shadows="false" />
 * </Modify.Node>
 * ```
 */
const ModifyNode = defineComponent(
    (props: ModifyNodeProps, { slots }) => {
        const { registerRule, unregisterRule } = useGltf();
        const ruleId = `rule-${ruleIdCounter++}`;

        // The rule is built while rendering, so reactive state used in the slot is tracked,
        // and registered once the render has committed.
        let rule: Rule | null = null;
        const register = () => {
            if (rule) registerRule(rule);
        };

        onMounted(register);
        onUpdated(register);
        onScopeDispose(() => unregisterRule(ruleId));

        return () => {
            rule = createRule(ruleId, props.path, props.clearChildren ?? false, (slots.default?.() ?? []) as VNode[]);
            return null;
        };
    },
    {
        name: 'ModifyNode',
        props: {
            path: { type: [String, Function] as PropType<string | PathPredicate>, required: true },
            clearChildren: { type: Boolean, default: false }
        }
    }
);

export { ModifyNode };

/**
 * Modify compound component
 * Provides Modify.Node, Modify.Light, Modify.Render, and Modify.Camera
 */
export const Modify = {
    Node: ModifyNode,
    Light: ModifyLight,
    Render: ModifyRender,
    Camera: ModifyCamera
};
