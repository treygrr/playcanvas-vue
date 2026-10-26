<script setup lang="ts">
/** Stops tracking a project and deletes its downloaded versions. The PlayCanvas project itself isn't touched. */
import { ref, watch } from 'vue';

import { navigateTo } from '#imports';

import { useProject } from './project';

const open = defineModel<boolean>('open', { default: false });

const { api, slug, project, busy, run } = useProject();
const confirmation = ref('');

watch(open, () => {
    confirmation.value = '';
});

async function remove() {
    await run('delete', async () => {
        await api.deleteProject(slug.value);
        open.value = false;
        await navigateTo(api.config.adminRoute || '/');
    });
}
</script>

<template>
    <UModal
        v-model:open="open"
        :title="`Delete ${project?.title ?? slug}?`"
        description="Visitors can no longer play it, and its downloaded versions are deleted from this server. The project in PlayCanvas isn't affected, and you can add it again later."
    >
        <template #body>
            <UFormField :label="`Type ${slug} to confirm`">
                <UInput v-model="confirmation" :placeholder="slug" autocomplete="off" class="w-full" />
            </UFormField>
        </template>

        <template #footer>
            <div class="flex w-full justify-end gap-2">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
                <UButton
                    label="Delete project"
                    color="error"
                    icon="i-lucide-trash-2"
                    :disabled="confirmation !== slug"
                    :loading="busy === 'delete'"
                    @click="remove"
                />
            </div>
        </template>
    </UModal>
</template>
