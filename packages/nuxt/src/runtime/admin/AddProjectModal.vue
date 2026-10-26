<script setup lang="ts">
/**
 * Adds a PlayCanvas project by its id or Editor link. Its published apps are imported in the background, so this
 * goes straight to the new project's page, which shows them arriving.
 */
import { ref, watch } from 'vue';

import { navigateTo } from '#imports';

import { errorMessage, useAdminApi, useAdminProjects } from './api';

const open = defineModel<boolean>('open', { default: false });

const api = useAdminApi();
const { refresh } = useAdminProjects();
const projectId = ref('');
const slug = ref('');
const adding = ref(false);
const error = ref<string | null>(null);

watch(open, (isOpen) => {
    if (!isOpen) return;
    projectId.value = '';
    slug.value = '';
    error.value = null;
});

/** Accepts an id, or a URL like https://playcanvas.com/editor/project/1625489 */
const parseProjectId = (value: string) => Number(value.trim().match(/(\d+)\/?$/)?.[1] ?? NaN);

async function add() {
    const id = parseProjectId(projectId.value);
    if (!Number.isInteger(id)) {
        error.value = 'Enter a project id, or a link to the project in the Editor.';
        return;
    }
    adding.value = true;
    error.value = null;
    try {
        const project = await api.addProject(id, slug.value.trim() || undefined);
        await refresh().catch(() => undefined);
        open.value = false;
        await navigateTo(`${api.config.adminRoute}/manage/${project.slug}`);
    } catch (e) {
        error.value = errorMessage(e);
    } finally {
        adding.value = false;
    }
}
</script>

<template>
    <UModal
        v-model:open="open"
        title="Add a PlayCanvas project"
        description="Its published apps are imported automatically, and keep syncing."
    >
        <template #body>
            <form id="playcanvas-add-project" class="space-y-4" @submit.prevent="add">
                <UFormField
                    label="Project id or Editor link"
                    :error="error ?? undefined"
                    required
                    help="In the Editor's address bar: playcanvas.com/editor/project/1234567"
                >
                    <UInput
                        v-model="projectId"
                        placeholder="1234567"
                        icon="i-lucide-box"
                        autofocus
                        required
                        class="w-full"
                    />
                </UFormField>
                <UFormField
                    label="Address"
                    hint="Optional"
                    :help="`It plays at ${api.config.playRoute || ''}/${slug.trim() || 'address'}. Made from the app's name if empty.`"
                >
                    <UInput v-model="slug" placeholder="my-game" icon="i-lucide-link" class="w-full" />
                </UFormField>
            </form>
        </template>

        <template #footer>
            <div class="flex w-full justify-end gap-2">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
                <UButton type="submit" form="playcanvas-add-project" label="Add project" :loading="adding" />
            </div>
        </template>
    </UModal>
</template>
