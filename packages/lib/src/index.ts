export { Application, ApplicationWithoutCanvas } from './Application.ts';
export type { ApplicationProps, ApplicationWithoutCanvasProps } from './Application.ts';
export { Container } from './Container.ts';
export type { ContainerProps } from './Container.ts';
export { Entity } from './Entity.ts';
export type { EntityProps, EntityExposed } from './Entity.ts';

// GLTF Scene Modification API
export { Gltf, Modify, useEntity } from './gltf/index.ts';

export type {
    GltfProps,
    Rule,
    Action,
    MergedRule,
    ModifyNodeProps,
    ModifyLightProps,
    ModifyRenderProps,
    ModifyCameraProps,
    PathPredicate,
    EntityMetadata
} from './gltf/index.ts';

export type { SyntheticMouseEvent, SyntheticPointerEvent } from './utils/synthetic-event.ts';

// PlayCanvas Editor exports
export {
    EditorProject,
    EditorScene,
    editorApplicationProps,
    loadEditorProject,
    createEditorManifest
} from './editor/index.ts';
export type {
    EditorProjectProps,
    EditorSceneProps,
    LoadEditorProjectOptions,
    EditorConfig,
    EditorManifest,
    EditorModule
} from './editor/index.ts';
