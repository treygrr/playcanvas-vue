<script setup lang="ts">
/**
 * Builds a branch's current state, unpublished work included, into a preview version. It only goes live when someone
 * makes it live.
 */
import { computed, ref, watch } from 'vue';

import { errorMessage } from './api';
import { useProject } from './project';

const open = defineModel<boolean>('open', { default: false });

const { api, slug, busy, run } = useProject();
const branches = ref<{ id: string; name: string }[] | null>(null);
const branchId = ref<string | undefined>(undefined);
const loadError = ref<string | null>(null);

watch(open, async (isOpen) => {
    if (!isOpen || branches.value) return;
    loadError.value = null;
    try {
        branches.value = (await api.branches(slug.value)).branches;
        branchId.value = branches.value.find((b) => b.name === 'main')?.id ?? branches.value[0]?.id;
    } catch (error) {
        loadError.value = errorMessage(error);
    }
});

const items = computed(() => (branches.value ?? []).map((branch) => ({ label: branch.name, value: branch.id })));

async function build() {
    if (!branchId.value) return;
    const id = branchId.value;
    const done = await run(
        'build',
        () => api.buildBranch(slug.value, id),
        'Building. The version appears in the list, with a preview link once it has been imported.'
    );
    if (done) open.value = false;
}
</script>

<template>
    <UModal
        v-model:open="open"
        title="Build a branch preview"
        description="Builds the branch as it is now, including work that isn't published, and imports it as a version. It only goes live if you make it live."
    >
        <template #body>
            <UAlert
                v-if="loadError"
                color="error"
                variant="subtle"
                icon="i-lucide-circle-alert"
                title="Couldn't load the branches"
                :description="loadError"
            />
            <form v-else id="playcanvas-build" @submit.prevent="build">
                <UFormField label="Branch" required>
                    <USelect
                        v-model="branchId"
                        :items="items"
                        :loading="!branches"
                        placeholder="Loading branches…"
                        icon="i-lucide-git-branch"
                        class="w-full"
                    />
                </UFormField>
            </form>
        </template>

        <template #footer>
            <div class="flex w-full justify-end gap-2">
                <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
                <UButton
                    type="submit"
                    form="playcanvas-build"
                    label="Build preview"
                    icon="i-lucide-hammer"
                    :disabled="!branchId"
                    :loading="busy === 'build'"
                />
            </div>
        </template>
    </UModal>
</template>
