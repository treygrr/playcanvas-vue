import type { Entity } from 'playcanvas';
import type { PropType, SlotsType, VNode } from 'vue';
import { defineComponent, h, markRaw, shallowRef, watch } from 'vue';

import { useApp } from '../composables/use-app.ts';
import { provideParent } from '../composables/use-parent.ts';
import { ModifyRules, provideModifyScope } from '../gltf/modify-scope.ts';

import type { EditorManifest } from './manifest.ts';
import { loadEditorProject } from './load-editor-project.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the public prop declaration
export interface EditorSceneProps {
    /** The manifest of the export, see `createEditorManifest()` */
    manifest: EditorManifest;
    /** The base URL the export is served from */
    base: string;
    /** The name or URL of the scene to load. Defaults to the first scene */
    scene?: string;
    /**
     * Apply the project's canvas fill and resolution settings, instead of the application's.
     * @default false
     */
    useProjectCanvasSettings?: boolean;
}

/**
 * Loads a scene from a PlayCanvas Editor export into the surrounding `<Application>`.
 *
 * Children render once the scene has loaded, as children of its root entity. Use `<Modify.Node>`
 * to change entities from the scene, and `useEntity()` to find them.
 *
 * @example
 * <Application v-bind="editorApplicationProps(manifest, base)">
 *   <EditorScene :manifest="manifest" :base="base">
 *     <Modify.Node path="Root.Ball">
 *       <Modify.Render :cast-shadows="false" />
 *     </Modify.Node>
 *   </EditorScene>
 * </Application>
 */
export const EditorScene = defineComponent(
    (props: EditorSceneProps, { slots, emit }) => {
        const app = useApp();
        const root = shallowRef<Entity | null>(null);
        const error = shallowRef<Error | null>(null);

        provideModifyScope(root);

        watch(
            () => [props.manifest, props.base, props.scene] as const,
            ([manifest, base, scene], _prev, onCleanup) => {
                let cancelled = false;
                let loaded: Entity | null = null;
                error.value = null;

                onCleanup(() => {
                    cancelled = true;
                    root.value = null;
                    loaded?.destroy();
                });

                loadEditorProject(app, manifest, {
                    base,
                    scene,
                    useProjectCanvasSettings: props.useProjectCanvasSettings
                })
                    .then((entity) => {
                        if (cancelled) {
                            entity.destroy();
                            return;
                        }
                        loaded = markRaw(entity);
                        root.value = loaded;
                        emit('loaded', loaded);
                    })
                    .catch((err: Error) => {
                        if (cancelled) return;
                        error.value = err;
                        emit('error', err);
                    });
            },
            { immediate: true }
        );

        return () => {
            if (error.value) return slots.error?.({ error: error.value });
            if (!root.value) return slots.loading?.();

            return [h(SceneChildren, { key: root.value.getGuid(), parent: root.value }, slots), h(ModifyRules)];
        };
    },
    {
        name: 'EditorScene',
        props: {
            manifest: { type: Object as PropType<EditorManifest>, required: true },
            base: { type: String, required: true },
            scene: { type: String, default: undefined },
            useProjectCanvasSettings: { type: Boolean, default: false }
        },
        emits: {
            loaded: (root: Entity) => Boolean(root),
            error: (error: Error) => error instanceof Error
        },
        slots: Object as SlotsType<{
            default?: () => VNode[];
            loading?: () => VNode[];
            error?: (props: { error: Error }) => VNode[];
        }>
    }
);

/**
 * Renders its slot with `parent` as the parent entity.
 */
const SceneChildren = defineComponent(
    (props: { parent: Entity }, { slots }) => {
        provideParent(props.parent);
        return () => slots.default?.();
    },
    { name: 'EditorSceneChildren', props: ['parent'] }
);
