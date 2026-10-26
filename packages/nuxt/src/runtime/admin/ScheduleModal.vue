<script setup lang="ts">
/** Schedules a version to go live at a time, replacing any other scheduled release */
import { computed, ref, watch } from 'vue';

import type { AdminVersion } from './api';
import { versionName } from './api';
import { useProject } from './project';

const props = defineProps<{ version: AdminVersion | null }>();
const open = defineModel<boolean>('open', { default: false });

const { api, slug, project, busy, update } = useProject();
const at = ref('');

watch(open, (isOpen) => {
    if (isOpen) at.value = '';
});

const replaces = computed(() => {
    const scheduled = project.value?.scheduledRelease;
    return scheduled && scheduled.versionId !== props.version?.id ? scheduled : null;
});

async function schedule() {
    if (!props.version || !at.value) return;
    const iso = new Date(at.value).toISOString();
    const done = await update(
        { scheduledRelease: { versionId: props.version.id, at: iso } },
        `${versionName(props.version)} is scheduled.`
    );
    if (done) open.value = false;
}
</script>

<template>
    <UModal
        v-model:open="open"
        :title="`Schedule ${version ? versionName(version) : 'a release'}`"
        description="It goes live on its own at this time. Until then, the live version stays as it is."
    >
        <template #body>
            <form id="playcanvas-schedule" class="space-y-4" @submit.prevent="schedule">
                <UFormField label="Goes live at" required help="In your time zone.">
                    <UInput v-model="at" type="datetime-local" required class="w-full" />
                </UFormField>
                <UAlert
                    v-if="replaces"
                    color="warning"
                    variant="subtle"
                    icon="i-lucide-calendar-clock"
                    title="This replaces the release already scheduled."
                />
                <p v-if="version && api.playUrl(slug, version.previewToken)" class="text-sm text-muted">
                    Check it first with its
                    <ULink
                        :to="api.playUrl(slug, version.previewToken)!"
                        target="_blank"
                        class="text-primary hover:underline"
                    >
                        preview link</ULink
                    >.
                </p>
            </form>
        </template>

        <template #footer>
            <div class="flex w-full justify-end gap-2">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
                <UButton
                    type="submit"
                    form="playcanvas-schedule"
                    label="Schedule"
                    icon="i-lucide-calendar-clock"
                    :disabled="!at"
                    :loading="busy === 'update'"
                />
            </div>
        </template>
    </UModal>
</template>
