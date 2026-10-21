<script setup lang="ts">
import { Entity } from '@treygrr/playcanvas-vue';
import type { SyntheticMouseEvent } from '@treygrr/playcanvas-vue';
import { Render } from '@treygrr/playcanvas-vue/components';
import { useAppEvent, useMaterial } from '@treygrr/playcanvas-vue/composables';
import { ref } from 'vue';

const props = defineProps<{ x: number; speed: number }>();

const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa'];
const colorIndex = ref(0);
const hovered = ref(false);
const rotation = ref<[number, number, number]>([0, 0, 0]);

const material = useMaterial(() => ({
    diffuse: colors[colorIndex.value],
    emissive: hovered.value ? '#333333' : '#000000'
}));

useAppEvent('update', (dt) => {
    rotation.value = [0, rotation.value[1] + dt * props.speed, 0];
});

const onClick = (event: SyntheticMouseEvent) => {
    event.stopPropagation();
    colorIndex.value = (colorIndex.value + 1) % colors.length;
};
</script>

<template>
    <Entity
        :position="[props.x, 0, 0]"
        :rotation="rotation"
        @click="onClick"
        @pointerover="hovered = true"
        @pointerout="hovered = false"
    >
        <Render type="box" :material="material" cast-shadows />
    </Entity>
</template>
