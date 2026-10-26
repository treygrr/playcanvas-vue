<script setup lang="ts">
/** How a project's live version is chosen, and whether visitors can play it */
import { ref, watch } from 'vue';

import CardHeader from './CardHeader.vue';
import { toLocalInput } from './api';
import { useProject } from './project';

const { project, busy, update } = useProject();

const expiresAt = ref('');
watch(
    () => project.value?.expiresAt,
    (value) => {
        expiresAt.value = toLocalInput(value);
    },
    { immediate: true }
);

const setAutoRelease = (on: boolean) =>
    update({ autoRelease: on, pinned: false }, on ? 'New builds go live automatically.' : 'You choose what goes live.');

const setPinned = (on: boolean) =>
    update({ pinned: on }, on ? 'The live version is pinned.' : 'Automatic releases are back on.');

const setOffline = (on: boolean) =>
    update({ unpublished: on }, on ? 'The project is offline.' : 'The project is back online.');

const saveExpiry = () =>
    update({ expiresAt: new Date(expiresAt.value).toISOString() }, 'The project goes offline then.');
</script>

<template>
    <UPageCard v-if="project" variant="subtle" :ui="{ container: 'gap-y-4' }">
        <CardHeader
            title="Release settings"
            description="How the live version is chosen, and when visitors can play it."
        />
        <div class="divide-y divide-default -my-2">
            <div class="py-3">
                <USwitch
                    :model-value="project.autoRelease"
                    :disabled="busy !== null"
                    label="Release automatically"
                    description="New builds go live as soon as they're imported: the Editor's primary app, or the newest without one."
                    @update:model-value="setAutoRelease"
                />
                <USwitch
                    v-if="project.autoRelease"
                    :model-value="project.pinned"
                    :disabled="busy !== null"
                    label="Pin the live version"
                    description="Pause automatic releases and keep the current version live. Making a version live by hand pins it."
                    class="mt-3 ms-11"
                    @update:model-value="setPinned"
                />
            </div>

            <div class="py-3">
                <USwitch
                    :model-value="project.unpublished"
                    :disabled="busy !== null"
                    color="warning"
                    label="Take offline"
                    description="Hide the project from visitors, who get a 404. Preview links keep working."
                    @update:model-value="setOffline"
                />
            </div>

            <form class="flex flex-wrap items-end gap-3 py-3" @submit.prevent="saveExpiry">
                <UFormField
                    label="Go offline automatically"
                    description="At this time, in your time zone. Leave it empty to keep the project up."
                    class="min-w-64 flex-1"
                >
                    <UInput v-model="expiresAt" type="datetime-local" class="w-full" />
                </UFormField>
                <UButton
                    type="submit"
                    label="Save"
                    color="neutral"
                    variant="outline"
                    :disabled="busy !== null || !expiresAt || expiresAt === toLocalInput(project.expiresAt)"
                />
                <UButton
                    v-if="project.expiresAt"
                    label="Clear"
                    color="neutral"
                    variant="ghost"
                    :disabled="busy !== null"
                    @click="update({ expiresAt: null }, 'The project stays up.')"
                />
            </form>
        </div>
    </UPageCard>
</template>
