<script setup lang="ts">
/**
 * The admin's home: every tracked PlayCanvas project at a glance, and adding new ones.
 */
import type { TableColumn, TableRow } from '@nuxt/ui';
import { ref, watch } from 'vue';

import { definePageMeta, navigateTo, useRoute } from '#imports';

import AddProjectModal from './AddProjectModal.vue';
import AdminShell from './AdminShell.vue';
import type { AdminProjectSummary } from './api';
import { errorMessage, projectStatus, releaseMode, useAdminApi, useAdminProjects } from './api';

definePageMeta({ layout: false });

const api = useAdminApi();
const route = useRoute();
const { projects, repo, refresh } = useAdminProjects();
const loadError = ref<string | null>(null);
// ?add=1, from search
const adding = ref(route.query.add === '1');

watch(
    () => route.query.add,
    (add) => {
        if (add === '1') adding.value = true;
    }
);
watch(adding, (open) => {
    if (!open && route.query.add) navigateTo({ query: { ...route.query, add: undefined } }, { replace: true });
});

async function load() {
    try {
        await refresh();
        loadError.value = null;
    } catch (error) {
        loadError.value = errorMessage(error);
    }
}

const manage = (slug: string) => `${api.config.adminRoute}/manage/${slug}`;
const openRow = (_event: Event, row: TableRow<AdminProjectSummary>) => navigateTo(manage(row.original.slug));

// Phones get the project and its status; the rest is on its page
const wide = { class: { th: 'hidden md:table-cell', td: 'hidden md:table-cell' } };
const columns: TableColumn<AdminProjectSummary>[] = [
    { accessorKey: 'title', header: 'Project' },
    { id: 'status', header: 'Status' },
    { id: 'live', header: 'Live version', meta: wide },
    { id: 'release', header: 'Release', meta: wide },
    { accessorKey: 'lastSyncAt', header: 'Last synced', meta: wide },
    { id: 'actions', header: '', meta: { class: { td: 'text-right whitespace-nowrap' } } }
];
</script>

<template>
    <AdminShell @authenticated="load">
        <UDashboardPanel id="playcanvas-projects">
            <template #header>
                <UDashboardNavbar title="Projects">
                    <template #leading>
                        <UDashboardSidebarCollapse />
                    </template>
                    <template #right>
                        <UButton label="Add project" icon="i-lucide-plus" @click="adding = true" />
                    </template>
                </UDashboardNavbar>
            </template>

            <template #body>
                <div class="flex flex-col gap-6 w-full lg:max-w-5xl mx-auto">
                    <UAlert
                        v-if="loadError"
                        color="error"
                        variant="subtle"
                        icon="i-lucide-circle-alert"
                        title="Couldn't load the projects"
                        :description="loadError"
                    />

                    <div v-else-if="!projects" class="space-y-3">
                        <USkeleton class="h-10 w-full" />
                        <USkeleton class="h-16 w-full" />
                        <USkeleton class="h-16 w-full" />
                    </div>

                    <UEmpty
                        v-else-if="projects.length === 0"
                        icon="i-lucide-box"
                        title="No projects yet"
                        description="Add a PlayCanvas project, and its published builds are imported onto this server, ready to release."
                        :actions="[{ label: 'Add a project', icon: 'i-lucide-plus', onClick: () => (adding = true) }]"
                    />

                    <UTable
                        v-else
                        :data="projects"
                        :columns="columns"
                        class="rounded-lg border border-default"
                        :ui="{ th: 'text-xs font-medium text-muted', td: 'py-3' }"
                        :on-select="openRow"
                    >
                        <template #title-cell="{ row }">
                            <ULink :to="manage(row.original.slug)" class="font-medium text-highlighted hover:underline">
                                {{ row.original.title }}
                            </ULink>
                            <p class="font-mono text-xs text-muted">/{{ row.original.slug }}</p>
                        </template>

                        <template #status-cell="{ row }">
                            <div class="flex flex-wrap gap-1.5">
                                <UBadge
                                    :label="projectStatus(row.original).label"
                                    :color="projectStatus(row.original).color"
                                    :icon="projectStatus(row.original).icon"
                                    variant="subtle"
                                />
                                <UBadge
                                    v-if="row.original.importing"
                                    :label="`Importing ${row.original.importing}`"
                                    icon="i-lucide-loader-circle"
                                    color="info"
                                    variant="outline"
                                />
                                <UBadge
                                    v-if="row.original.failed"
                                    :label="`${row.original.failed} failed`"
                                    icon="i-lucide-triangle-alert"
                                    color="error"
                                    variant="outline"
                                />
                            </div>
                        </template>

                        <template #live-cell="{ row }">
                            <span v-if="row.original.liveVersion" class="text-highlighted">
                                {{ row.original.liveLabel ?? row.original.liveVersion }}
                            </span>
                            <span v-else class="text-dimmed">—</span>
                        </template>

                        <template #release-cell="{ row }">
                            <span class="inline-flex items-center gap-1.5 text-muted">
                                <UIcon :name="releaseMode(row.original).icon" class="size-4" />
                                {{ releaseMode(row.original).label }}
                            </span>
                        </template>

                        <template #lastSyncAt-cell="{ row }">
                            <NuxtTime
                                v-if="row.original.playcanvas && row.original.lastSyncAt"
                                :datetime="row.original.lastSyncAt"
                                relative
                                class="text-muted"
                            />
                            <span v-else class="text-dimmed">{{ row.original.playcanvas ? 'Never' : '—' }}</span>
                        </template>

                        <template #actions-cell="{ row }">
                            <UButton
                                v-if="row.original.liveVersion && api.playUrl(row.original.slug)"
                                :to="api.playUrl(row.original.slug)!"
                                target="_blank"
                                icon="i-lucide-external-link"
                                color="neutral"
                                variant="ghost"
                                aria-label="Play"
                                @click.stop
                            />
                            <UIcon name="i-lucide-chevron-right" class="size-4 align-middle text-dimmed" />
                        </template>
                    </UTable>

                    <UPageCard
                        v-if="repo.length"
                        title="From the repo"
                        description="Zips in the app's playcanvas/ folder. They're released with each deploy, so there's nothing to manage here."
                        variant="subtle"
                    >
                        <ul class="divide-y divide-default">
                            <li
                                v-for="project in repo"
                                :key="project.slug"
                                class="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                            >
                                <UIcon name="i-lucide-file-archive" class="size-5 shrink-0 text-muted" />
                                <div class="min-w-0 flex-1">
                                    <p class="truncate font-medium text-highlighted">{{ project.title }}</p>
                                    <p class="truncate font-mono text-xs text-muted">
                                        /{{ project.slug }} · {{ project.version }}
                                    </p>
                                </div>
                                <UButton
                                    v-if="api.playUrl(project.slug)"
                                    :to="api.playUrl(project.slug)!"
                                    target="_blank"
                                    label="Play"
                                    trailing-icon="i-lucide-external-link"
                                    color="neutral"
                                    variant="outline"
                                    size="sm"
                                />
                            </li>
                        </ul>
                    </UPageCard>
                </div>
            </template>
        </UDashboardPanel>

        <AddProjectModal v-model:open="adding" />
    </AdminShell>
</template>
