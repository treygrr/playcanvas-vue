<script setup lang="ts">
/** A card's title and description, with its action on the right: UPageCard's own header can't hold an action */
defineProps<{ title: string; description?: string }>();
defineSlots<{ default?: () => unknown }>();
</script>

<template>
    <div class="flex w-full flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1 basis-64">
            <h2 class="text-base font-semibold text-pretty text-highlighted">{{ title }}</h2>
            <p v-if="description" class="mt-1 text-[15px] text-pretty text-muted">{{ description }}</p>
        </div>
        <slot />
    </div>
</template>
