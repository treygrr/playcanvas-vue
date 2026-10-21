import type { Entity } from 'playcanvas';
import type { ComputedRef, ShallowRef, VNode } from 'vue';

import type { CameraProps } from '../components/Camera.ts';
import type { LightProps } from '../components/Light.ts';
import type { RenderProps } from '../components/Render.ts';

import type { PathPredicate, EntityMetadata, PathMatcher } from './utils/path-matcher.ts';

/**
 * Supported component types for modification
 */
export type SupportedComponentType = 'light' | 'render' | 'camera';

/**
 * Action types for entity modifications
 */
export enum ActionType {
    ADD_CHILDREN = 'add_children',
    CLEAR_CHILDREN = 'clear_children',
    MODIFY_COMPONENT = 'modify_component'
}

/**
 * Base action interface
 */
/* eslint-disable @typescript-eslint/consistent-type-definitions -- preserve the public gltf declarations */
export interface BaseAction {
    type: ActionType;
    ruleId: string;
    specificity: number;
}

/**
 * Action to add children to an entity
 */
export interface AddChildrenAction extends BaseAction {
    type: ActionType.ADD_CHILDREN;
    children: VNode[];
}

/**
 * Action to clear all children from an entity
 */
export interface ClearChildrenAction extends BaseAction {
    type: ActionType.CLEAR_CHILDREN;
}

/**
 * Action to modify an existing component with prop merging
 */
export interface ModifyComponentAction extends BaseAction {
    type: ActionType.MODIFY_COMPONENT;
    componentType: SupportedComponentType;
    props: Record<string, unknown>;
}

/**
 * Union type for all actions
 */
export type Action = AddChildrenAction | ClearChildrenAction | ModifyComponentAction;

/**
 * Rule definition from Modify.Node
 */
export interface Rule {
    id: string;
    path: string | PathPredicate;
    actions: Action[];
    specificity: number;
}

/**
 * Merged rule after conflict resolution
 */
export interface MergedRule {
    entityGuid: string;
    clearChildren: boolean;
    componentActions: Map<SupportedComponentType, Action>; // componentType -> winning action
    addChildren: VNode[];
}

/**
 * Context provided by Gltf
 */
export interface GltfContextValue {
    hierarchyCache: ShallowRef<Map<string, EntityMetadata>>;
    rootEntity: ShallowRef<Entity | null>;
    pathMatcher: PathMatcher;
    registerRule: (rule: Rule) => void;
    unregisterRule: (ruleId: string) => void;
    /** @private The rules after conflict resolution, keyed by entity GUID */
    mergedRules: ComputedRef<Map<string, MergedRule>>;
}

/**
 * Helper type to allow both values and functional updates
 */
type PropOrUpdater<T> = T | ((current: T) => T);

/**
 * Helper to make all props accept either values or updater functions
 */
type WithUpdaters<T> = {
    [K in keyof T]?: PropOrUpdater<NonNullable<T[K]>>;
};

/**
 * Props for Modify.Light component
 */
export interface ModifyLightProps extends Partial<WithUpdaters<LightProps>> {
    remove?: boolean;
}

/**
 * Props for Modify.Render component
 */
export interface ModifyRenderProps extends Partial<WithUpdaters<RenderProps>> {
    remove?: boolean;
}

/**
 * Props for Modify.Camera component
 */
export interface ModifyCameraProps extends Partial<WithUpdaters<CameraProps>> {
    remove?: boolean;
}

/**
 * Props for node modification
 */
export interface ModifyNodeProps {
    path: string | PathPredicate;
    clearChildren?: boolean;
}
/* eslint-enable @typescript-eslint/consistent-type-definitions */
