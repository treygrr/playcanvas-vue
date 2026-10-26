<script setup lang="ts">
/**
 * One project, in the order it's used: what's live, what needs attention, its versions, how it's released, and,
 * last, deleting it.
 */
import type { DropdownMenuItem } from '@nuxt/ui';
import { computed, provide, ref, watch } from 'vue';

import { definePageMeta, useRoute, useToast } from '#imports';

import AdminShell from './AdminShell.vue';
import CardHeader from './CardHeader.vue';
import DeleteProjectModal from './DeleteProjectModal.vue';
import ProjectRelease from './ProjectRelease.vue';
import ProjectVersions from './ProjectVersions.vue';
import { projectStatus, releaseMode, versionName } from './api';
import { projectKey, useProjectController } from './project';

definePageMeta({ layout: false });

const route = useRoute();
const slug = computed(() => String(route.params.slug));
const controller = useProjectController(slug);
const { api, project, loadError, busy, load, run, update } = controller;
provide(projectKey, controller);
const toast = useToast();

// The sidebar links between projects without leaving this page
watch(slug, () => {
    project.value = null;
    load();
});

const deleting = ref(false);

const status = computed(() => (project.value ? projectStatus(project.value) : null));
const live = computed(() => project.value?.versions.find((v) => v.id === project.value?.liveVersion) ?? null);
const scheduled = computed(() => {
    const release = project.value?.scheduledRelease;
    if (!release) return null;
    const version = project.value?.versions.find((v) => v.id === release.versionId);
    return { at: release.at, name: version ? versionName(version) : release.versionId };
});
const liveUrl = computed(() => (project.value?.liveVersion ? api.playUrl(slug.value) : null));

/** Why visitors can't play the project, and the way to fix it */
const attention = computed(() => {
    const p = project.value;
    if (!p) return null;
    if (p.unpublished) {
        return {
            title: 'Offline',
            description: 'Visitors get a 404. Preview links still work.',
            action: {
                label: 'Bring online',
                onClick: () => update({ unpublished: false }, 'The project is back online.')
            }
        };
    }
    if (p.expiresAt && Date.parse(p.expiresAt) <= Date.now()) {
        return {
            title: 'Expired',
            description: 'It went offline at its scheduled time, so visitors get a 404.',
            action: { label: 'Keep it up', onClick: () => update({ expiresAt: null }, 'The project stays up.') }
        };
    }
    if (!p.liveVersion) {
        return {
            title: 'Nothing is live yet',
            description: p.versions.some((v) => v.status === 'ready')
                ? 'Make a version live below to publish the project.'
                : 'Its versions appear below once they are imported.',
            action: null
        };
    }
    return null;
});

async function sync() {
    let summary = '';
    const synced = await run('sync', async () => {
        const { result, project: updated } = await api.sync(slug.value);
        if (result.error) throw new Error(result.error);
        summary = [
            result.imported.length ? `${result.imported.length} imported` : null,
            result.failed.length ? `${result.failed.length} failed` : null,
            result.released ? `${result.released} released` : null
        ]
            .filter(Boolean)
            .join(', ');
        return updated;
    });
    if (synced) {
        toast.add({
            title: 'Synced with PlayCanvas',
            description: summary ? `${summary}.` : 'Nothing new.',
            color: 'success',
            icon: 'i-lucide-refresh-cw'
        });
    }
}

const actions = computed<DropdownMenuItem[][]>(() =>
    [
        [
            ...(project.value?.playcanvas
                ? [
                      // In the navbar from `sm` up
                      { label: 'Sync now', icon: 'i-lucide-refresh-cw', class: 'sm:hidden', onSelect: sync },
                      {
                          label: 'Open in the Editor',
                          icon: 'i-lucide-square-arrow-out-up-right',
                          to: `https://playcanvas.com/editor/project/${project.value.playcanvas.projectId}`,
                          target: '_blank'
                      }
                  ]
                : [])
        ],
        [
            {
                label: 'Delete project',
                icon: 'i-lucide-trash-2',
                color: 'error' as const,
                onSelect: () => (deleting.value = true)
            }
        ]
    ].filter((group) => group.length)
);
</script>

<template>
    <AdminShell @authenticated="load">
        <UDashboardPanel id="playcanvas-project">
            <template #header>
                <UDashboardNavbar :title="project?.title ?? slug">
                    <template #leading>
                        <UDashboardSidebarCollapse />
                    </template>
                    <template #right>
                        <UButton
                            v-if="project?.playcanvas"
                            label="Sync now"
                            icon="i-lucide-refresh-cw"
                            color="neutral"
                            variant="outline"
                            :loading="busy === 'sync'"
                            :disabled="busy !== null && busy !== 'sync'"
                            class="hidden sm:inline-flex"
                            @click="sync"
                        />
                        <UButton
                            v-if="liveUrl"
                            :to="liveUrl"
                            target="_blank"
                            label="Play"
                            trailing-icon="i-lucide-external-link"
                        />
                        <UDropdownMenu v-if="project" :items="actions" :content="{ align: 'end' }">
                            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" aria-label="More" />
                        </UDropdownMenu>
                    </template>
                </UDashboardNavbar>
            </template>

            <template #body>
                <UAlert
                    v-if="loadError && !project"
                    color="error"
                    variant="subtle"
                    icon="i-lucide-circle-alert"
                    title="Couldn't load the project"
                    :description="loadError"
                >
                    <template #actions>
                        <UButton :to="api.config.adminRoute" label="All projects" color="neutral" variant="outline" />
                    </template>
                </UAlert>

                <div v-else-if="!project" class="flex flex-col gap-6 w-full lg:max-w-3xl mx-auto">
                    <USkeleton class="h-32 w-full" />
                    <USkeleton class="h-64 w-full" />
                </div>

                <div v-else class="flex flex-col gap-4 sm:gap-6 w-full lg:max-w-3xl mx-auto">
                    <!-- What visitors get now -->
                    <UPageCard variant="subtle">
                        <div class="flex flex-wrap items-start gap-4">
                            <span class="grid size-12 shrink-0 place-items-center rounded-lg bg-elevated text-muted">
                                <UIcon name="i-lucide-box" class="size-6" />
                            </span>
                            <div class="min-w-0 flex-1">
                                <p class="truncate text-lg font-semibold text-highlighted">{{ project.title }}</p>
                                <p class="truncate font-mono text-sm text-muted">
                                    {{ api.config.playRoute || '' }}/{{ project.slug }}
                                </p>
                                <div class="mt-2 flex flex-wrap gap-1.5">
                                    <UBadge
                                        v-if="status"
                                        :label="status.label"
                                        :color="status.color"
                                        :icon="status.icon"
                                        variant="subtle"
                                    />
                                    <UBadge
                                        :label="`${releaseMode(project).label} release`"
                                        :icon="releaseMode(project).icon"
                                        color="neutral"
                                        variant="outline"
                                    />
                                </div>
                            </div>
                        </div>

                        <dl class="mt-2 grid grid-cols-3 gap-x-4 gap-y-3 text-sm sm:gap-x-8">
                            <div>
                                <dt class="text-muted">Live version</dt>
                                <dd class="truncate font-medium text-highlighted">
                                    {{ live ? versionName(live) : 'None' }}
                                </dd>
                            </div>
                            <div>
                                <dt class="text-muted">Versions</dt>
                                <dd class="font-medium text-highlighted">{{ project.versions.length }}</dd>
                            </div>
                            <div>
                                <dt class="text-muted">{{ project.playcanvas ? 'Last synced' : 'Added' }}</dt>
                                <dd class="font-medium text-highlighted">
                                    <NuxtTime
                                        v-if="project.playcanvas ? project.lastSyncAt : project.createdAt"
                                        :datetime="(project.playcanvas ? project.lastSyncAt : project.createdAt)!"
                                        relative
                                    />
                                    <template v-else>Never</template>
                                </dd>
                            </div>
                        </dl>
                    </UPageCard>

                    <!-- What needs doing -->
                    <UAlert
                        v-if="attention"
                        color="warning"
                        variant="subtle"
                        icon="i-lucide-eye-off"
                        :title="attention.title"
                        :description="attention.description"
                        :actions="
                            attention.action
                                ? [
                                      {
                                          ...attention.action,
                                          color: 'warning',
                                          variant: 'outline',
                                          disabled: busy !== null
                                      }
                                  ]
                                : undefined
                        "
                    />
                    <UAlert
                        v-if="scheduled"
                        color="info"
                        variant="subtle"
                        icon="i-lucide-calendar-clock"
                        :title="`${scheduled.name} goes live`"
                        :actions="[
                            {
                                label: 'Cancel release',
                                color: 'info',
                                variant: 'outline',
                                disabled: busy !== null,
                                onClick: () => update({ scheduledRelease: null }, 'The scheduled release is cancelled.')
                            }
                        ]"
                    >
                        <template #description>
                            <NuxtTime :datetime="scheduled.at" date-style="full" time-style="short" />
                            (<NuxtTime :datetime="scheduled.at" relative />)
                        </template>
                    </UAlert>

                    <ProjectVersions />

                    <ProjectRelease />

                    <UPageCard variant="subtle">
                        <CardHeader
                            title="Delete project"
                            description="Stop tracking it here and delete its downloaded versions. The project in PlayCanvas isn't affected."
                        >
                            <UButton
                                label="Delete project"
                                icon="i-lucide-trash-2"
                                color="error"
                                variant="subtle"
                                @click="deleting = true"
                            />
                        </CardHeader>
                    </UPageCard>
                </div>
            </template>
        </UDashboardPanel>

        <DeleteProjectModal v-model:open="deleting" />
    </AdminShell>
</template>
