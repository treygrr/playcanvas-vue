<script setup lang="ts">
/**
 * Plays a PlayCanvas Editor project from the `playcanvas/` folder, by its slug.
 * Attributes are passed on to the `<Application>`, so `class`, `style` and application props work.
 * Children are added to the loaded scene, and can modify it with `<Modify.Node>`.
 *
 * @example
 * <PlayCanvasScene project="my-first-project" class="h-96">
 *   <template #loading>Loading…</template>
 * </PlayCanvasScene>
 */
import { EditorProject } from '@treygrr/playcanvas-vue';
import type { Entity } from 'playcanvas';
import { shallowRef, watch } from 'vue';

import { useRuntimeConfig } from '#imports';

import { projectUrl } from '../project-url';
import type { PlayCanvasProject, PlayCanvasProjectSlug } from '../types';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
    defineProps<{
        /** The project slug: the zip file name, eg "my-first-project" for "My First Project.zip" */
        project: PlayCanvasProjectSlug;
        /** The name of the scene to load. Defaults to the project's first scene */
        scene?: string;
        /** Fill the window using the project's canvas settings, like the Editor launch page */
        useProjectCanvasSettings?: boolean;
        /** A preview token, to show a version that isn't live */
        preview?: string;
    }>(),
    { scene: undefined, useProjectCanvasSettings: false, preview: undefined }
);

const emit = defineEmits<{
    /** The project info was fetched */
    project: [project: PlayCanvasProject];
    /** The scene loaded, with its root entity */
    loaded: [root: Entity];
    error: [error: Error];
}>();

defineSlots<{
    default?: () => unknown;
    loading?: () => unknown;
    error?: (props: { error: Error }) => unknown;
}>();

const { baseURL } = useRuntimeConfig().public.playcanvas as { baseURL: string };

const project = shallowRef<PlayCanvasProject | null>(null);
const error = shallowRef<Error | null>(null);

watch(
    () => [props.project, props.preview] as const,
    async ([slug, preview], _prev, onCleanup) => {
        let cancelled = false;
        onCleanup(() => {
            cancelled = true;
        });

        project.value = null;
        error.value = null;

        try {
            const response = await fetch(projectUrl(baseURL, slug, preview));
            if (response.status === 404) throw new Error(`There is no PlayCanvas project "${slug}"`);
            if (!response.ok) throw new Error(`Failed to load PlayCanvas project "${slug}": ${response.status}`);
            const data = (await response.json()) as PlayCanvasProject;
            if (cancelled) return;
            project.value = data;
            emit('project', data);
        } catch (err) {
            if (cancelled) return;
            error.value = err instanceof Error ? err : new Error(String(err));
            emit('error', error.value);
        }
    },
    { immediate: true }
);
</script>

<template>
    <slot v-if="error" name="error" :error="error" />
    <EditorProject
        v-else-if="project"
        :key="`${project.slug}@${project.version}`"
        v-bind="$attrs"
        :src="project.base"
        :manifest="project.manifest"
        :scene="scene"
        :use-project-canvas-settings="useProjectCanvasSettings"
        @loaded="emit('loaded', $event)"
        @error="emit('error', $event)"
    >
        <template v-if="$slots.default" #default><slot /></template>
        <template v-if="$slots.loading" #loading><slot name="loading" /></template>
        <template v-if="$slots.error" #error="{ error: loadError }"><slot name="error" :error="loadError" /></template>
    </EditorProject>
    <slot v-else name="loading" />
</template>
