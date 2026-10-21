<script setup lang="ts">
/**
 * Plays a PlayCanvas Editor export. Unzip a "Download" build from the Editor into
 * public/exports/<name>/ and open /editor.html?project=<name>, or play one from a URL with ?src=<url>.
 */
import { EditorProject, Entity, Modify } from '@treygrr/playcanvas-vue';
import { Light, Render } from '@treygrr/playcanvas-vue/components';

const params = new URLSearchParams(location.search);
const project = params.get('project') ?? 'my-first-project';
// Or any URL serving an export, eg a published app: ?src=https://playcanv.as/apps/<id>/
const src = params.get('src') ?? `/exports/${project}/`;
</script>

<template>
    <EditorProject :src="src" keyboard-target="window">
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
