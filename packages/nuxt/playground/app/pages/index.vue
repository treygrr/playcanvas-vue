<script setup lang="ts">
import { Entity, Modify } from '@treygrr/playcanvas-vue';
import { Light, Render } from '@treygrr/playcanvas-vue/components';
</script>

<template>
    <main>
        <h1>PlayCanvas in Nuxt</h1>
        <p>
            Drop an Editor "Download" zip in <code>playground/playcanvas/</code>, then it plays below and at
            <NuxtLink to="/play/my-first-project">/play/my-first-project</NuxtLink>.
        </p>

        <PlayCanvasScene project="my-first-project" class="scene" keyboard-target="canvas" tabindex="0">
            <template #loading><p class="status">Loading…</p></template>
            <template #error="{ error }"
                ><p class="status">{{ error.message }}</p></template
            >

            <!-- Vue content mixed into the Editor scene -->
            <Entity name="Marker" :position="[0, 1.5, 0]" :scale="[0.3, 0.3, 0.3]">
                <Render type="cone" />
                <Light type="omni" color="orange" :range="4" />
            </Entity>
            <Modify.Node path="**.Light">
                <Modify.Light :intensity="(value: number) => value * 1.5" />
            </Modify.Node>
        </PlayCanvasScene>
    </main>
</template>

<style>
body {
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #f4f4f5;
}

main {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px 16px;
}

.scene {
    display: block;
    height: 480px !important;
    border-radius: 12px;
    background: #283538;
    outline: none;
}

.status {
    display: grid;
    place-items: center;
    height: 480px;
    margin: 0;
    border-radius: 12px;
    background: #283538;
    color: #fff;
}
</style>
