<script setup lang="ts">
/**
 * A full-window page for a PlayCanvas project, at `/play/<slug>` by default.
 */
import { computed } from 'vue';

import { createError, useFetch, useHead, useRoute, useRuntimeConfig } from '#imports';

import { projectUrl } from '../project-url';
import type { PlayCanvasProject } from '../types';

const route = useRoute();
const slug = computed(() => String(route.params.slug));
const { baseURL } = useRuntimeConfig().public.playcanvas as { baseURL: string };

// Fetched on the server too, for a real 404 status and the page title
const { data: project, error } = await useFetch<PlayCanvasProject>(() => projectUrl(baseURL, slug.value));

if (error.value || !project.value) {
    throw createError({
        statusCode: 404,
        statusMessage: `There is no PlayCanvas project "${slug.value}"`,
        fatal: true
    });
}

useHead({ title: () => project.value?.title ?? slug.value });
</script>

<template>
    <div class="playcanvas-page">
        <PlayCanvasScene :project="slug" use-project-canvas-settings tabindex="0">
            <template #loading>
                <p class="playcanvas-page__status">Loading {{ project?.title }}…</p>
            </template>
            <template #error="{ error: loadError }">
                <p class="playcanvas-page__status">{{ loadError.message }}</p>
            </template>
        </PlayCanvasScene>
    </div>
</template>

<style scoped>
.playcanvas-page {
    position: fixed;
    inset: 0;
    overflow: hidden;
    background: #283538;
}

.playcanvas-page :deep(canvas) {
    display: block;
    outline: none;
}

.playcanvas-page__status {
    display: grid;
    place-items: center;
    height: 100%;
    margin: 0;
    color: #fff;
    font-family: system-ui, sans-serif;
}
</style>
