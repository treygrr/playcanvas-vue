<script setup lang="ts">
import { Application, Entity } from '@treygrr/playcanvas-vue';
import { Camera, Light, Render, Script } from '@treygrr/playcanvas-vue/components';
import { FILLMODE_FILL_WINDOW, RESOLUTION_AUTO } from 'playcanvas';
import { CameraControls } from 'playcanvas/scripts/esm/camera-controls.mjs';

import Spinner from './Spinner.vue';
</script>

<template>
    <Application :fill-mode="FILLMODE_FILL_WINDOW" :resolution-mode="RESOLUTION_AUTO">
        <Entity name="camera" :position="[0, 2, 8]">
            <Camera clear-color="#1d1f24" :fov="45" />
            <Script :script="CameraControls" />
        </Entity>

        <Entity name="sun" :rotation="[45, 30, 0]">
            <Light type="directional" cast-shadows :intensity="1.2" />
        </Entity>

        <Entity name="ground" :position="[0, -1, 0]" :scale="[20, 1, 20]">
            <Render type="plane" receive-shadows />
        </Entity>

        <Spinner v-for="(x, i) in [-2.5, 0, 2.5]" :key="i" :x="x" :speed="20 + i * 30" />
    </Application>
</template>
