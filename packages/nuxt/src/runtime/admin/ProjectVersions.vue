<script setup lang="ts">
/**
 * A project's versions, newest first. Each has one main action for where it is (import it, make it live) and the rest
 * in its menu: schedule it, preview it, copy its preview link.
 */
import type { DropdownMenuItem } from '@nuxt/ui';
import { ref } from 'vue';

import { useToast } from '#imports';

import BuildBranchModal from './BuildBranchModal.vue';
import CardHeader from './CardHeader.vue';
import ScheduleModal from './ScheduleModal.vue';
import type { AdminVersion, Status } from './api';
import { formatSize, versionName, versionOrigin } from './api';
import { useProject } from './project';

const { api, slug, project, busy, run } = useProject();
const toast = useToast();

const scheduling = ref<AdminVersion | null>(null);
const scheduleOpen = ref(false);
const buildOpen = ref(false);

const isLive = (version: AdminVersion) => project.value?.liveVersion === version.id;
const isScheduled = (version: AdminVersion) => project.value?.scheduledRelease?.versionId === version.id;
const canImport = (version: AdminVersion) =>
    (version.status === 'available' || version.status === 'failed') && version.origin.type === 'app';

function badge(version: AdminVersion): Status | null {
    if (isLive(version)) return { label: 'Live', color: 'success', icon: 'i-lucide-radio' };
    if (isScheduled(version)) return { label: 'Scheduled', color: 'info', icon: 'i-lucide-calendar-clock' };
    return (
        {
            available: { label: 'Not downloaded', color: 'neutral', icon: 'i-lucide-cloud' },
            importing: {
                label: version.origin.type === 'branch' ? 'Building' : 'Importing',
                color: 'info',
                icon: 'i-lucide-loader-circle'
            },
            ready: null,
            failed: { label: 'Failed', color: 'error', icon: 'i-lucide-triangle-alert' }
        } as const
    )[version.status];
}

const makeLive = (version: AdminVersion) =>
    run(
        `live:${version.id}`,
        () => api.updateProject(slug.value, { liveVersion: version.id }),
        `${versionName(version)} is live.`
    );

const importVersion = (version: AdminVersion) =>
    run(`import:${version.id}`, () => api.importVersion(slug.value, version.id), `Importing ${versionName(version)}.`);

async function copyPreview(version: AdminVersion) {
    const url = api.playUrl(slug.value, version.previewToken);
    if (!url) return;
    await navigator.clipboard.writeText(new URL(url, location.origin).href);
    toast.add({ title: `Copied the preview link for ${versionName(version)}.`, icon: 'i-lucide-link' });
}

function menu(version: AdminVersion): DropdownMenuItem[][] {
    const preview = api.playUrl(slug.value, version.previewToken);
    const ready = version.status === 'ready';
    return [
        [
            ...(ready && !isLive(version)
                ? [
                      {
                          label: isScheduled(version) ? 'Change the schedule' : 'Schedule release',
                          icon: 'i-lucide-calendar-clock',
                          onSelect: () => {
                              scheduling.value = version;
                              scheduleOpen.value = true;
                          }
                      }
                  ]
                : []),
            ...(ready && preview
                ? [
                      { label: 'Open preview', icon: 'i-lucide-external-link', to: preview, target: '_blank' },
                      { label: 'Copy preview link', icon: 'i-lucide-link', onSelect: () => copyPreview(version) }
                  ]
                : [])
        ]
    ].filter((group) => group.length);
}
</script>

<template>
    <UPageCard variant="subtle" :ui="{ container: 'gap-y-4' }">
        <CardHeader
            title="Versions"
            description="Builds imported from PlayCanvas. Make one live, schedule it, or share its preview link before it is."
        >
            <UButton
                v-if="project?.playcanvas"
                label="Build a branch"
                icon="i-lucide-git-branch"
                color="neutral"
                variant="outline"
                size="sm"
                @click="buildOpen = true"
            />
        </CardHeader>

        <UEmpty
            v-if="project && project.versions.length === 0"
            icon="i-lucide-package-open"
            title="No versions yet"
            :description="
                project.playcanvas
                    ? 'Publish the project in the PlayCanvas Editor, then sync. New builds are imported automatically.'
                    : 'This project has no builds.'
            "
            variant="naked"
        />

        <ul v-else-if="project" class="divide-y divide-default -my-2">
            <li v-for="version in project.versions" :key="version.id" class="flex flex-wrap items-start gap-3 py-3">
                <UIcon
                    :name="versionOrigin(version).icon"
                    class="mt-0.5 size-5 shrink-0"
                    :class="isLive(version) ? 'text-success' : 'text-muted'"
                />

                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="font-medium text-highlighted">{{ versionName(version) }}</span>
                        <UBadge
                            v-if="badge(version)"
                            :label="badge(version)!.label"
                            :color="badge(version)!.color"
                            :icon="badge(version)!.icon"
                            :ui="version.status === 'importing' ? { leadingIcon: 'animate-spin' } : undefined"
                            variant="subtle"
                            size="sm"
                        />
                    </div>
                    <p class="text-sm text-muted">
                        {{ versionOrigin(version).label }} ·
                        <NuxtTime :datetime="version.createdAt" date-style="medium" time-style="short" />
                        <template v-if="version.size"> · {{ formatSize(version.size) }}</template>
                    </p>
                    <p v-if="version.releaseNotes" class="mt-1.5 whitespace-pre-line text-sm text-default">
                        {{ version.releaseNotes }}
                    </p>
                    <p v-if="version.error" class="mt-1.5 text-sm text-error">{{ version.error }}</p>
                </div>

                <div class="flex items-center gap-1.5">
                    <UButton
                        v-if="version.status === 'ready' && !isLive(version)"
                        label="Make live"
                        size="sm"
                        :loading="busy === `live:${version.id}`"
                        :disabled="busy !== null"
                        @click="makeLive(version)"
                    />
                    <UButton
                        v-else-if="canImport(version)"
                        :label="version.status === 'failed' ? 'Retry' : 'Import'"
                        icon="i-lucide-download"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :loading="busy === `import:${version.id}`"
                        :disabled="busy !== null"
                        @click="importVersion(version)"
                    />
                    <UDropdownMenu v-if="menu(version).length" :items="menu(version)" :content="{ align: 'end' }">
                        <UButton
                            icon="i-lucide-ellipsis-vertical"
                            color="neutral"
                            variant="ghost"
                            size="sm"
                            :aria-label="`More for ${versionName(version)}`"
                        />
                    </UDropdownMenu>
                </div>
            </li>
        </ul>

        <ScheduleModal v-model:open="scheduleOpen" :version="scheduling" />
        <BuildBranchModal v-if="project?.playcanvas" v-model:open="buildOpen" />
    </UPageCard>
</template>
