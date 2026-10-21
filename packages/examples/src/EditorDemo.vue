<script setup lang="ts">
/**
 * Plays a PlayCanvas Editor export. Unzip a "Download" build from the Editor into
 * public/exports/<name>/ and open /editor.html?project=<name>.
 */
import { EditorProject, Entity, Modify } from '@treygrr/playcanvas-vue';
import { Light, Render } from '@treygrr/playcanvas-vue/components';

const project = new URLSearchParams(location.search).get('project') ?? 'my-first-project';
</script>

<template>
    <EditorProject :src="`/exports/${project}/`" keyboard-target="window">
        <template #loading
            ><p class="status">Loading {{ project }}…</p></template
        >
        <template #error="{ error }">
            <p class="status">Could not load {{ project }}: {{ error.message }}</p>
        </template>

        <!-- Vue content mixed into the Editor scene -->
        <Entity name="Marker" :position="[0, 1.5, 0]" :scale="[0.3, 0.3, 0.3]">
            <Render type="cone" />
            <Light type="omni" color="orange" :range="4" />
        </Entity>
        <Modify.Node path="**.Light">
            <Modify.Light :intensity="(value) => value * 1.5" />
        </Modify.Node>
    </EditorProject>
</template>

<style scoped>
.status {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
}
</style>
