// Components
export { Gltf } from './components/Gltf.ts';
export type { GltfProps } from './components/Gltf.ts';
export { Modify } from './components/Modify.ts';

// Composables
export { useEntity } from './composables/use-entity.ts';

// Types
export type {
    Rule,
    Action,
    MergedRule,
    ModifyNodeProps,
    ModifyLightProps,
    ModifyRenderProps,
    ModifyCameraProps
} from './types.ts';

export type { PathPredicate, EntityMetadata } from './utils/path-matcher.ts';
