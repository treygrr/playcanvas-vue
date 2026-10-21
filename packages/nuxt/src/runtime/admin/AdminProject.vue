<script setup lang="ts">
/**
 * One project: its release settings, sync, and versions.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { definePageMeta, navigateTo, useRoute } from '#imports';

import type { AdminProject, AdminVersion } from './api';
import { errorMessage, formatDate, formatRelative, formatSize, useAdminApi } from './api';
import AdminShell from './AdminShell.vue';

definePageMeta({ layout: false });

const api = useAdminApi();
const route = useRoute();
const slug = computed(() => String(route.params.slug));

const project = ref<AdminProject | null>(null);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const busy = ref<string | null>(null);

async function load() {
    try {
        project.value = await api.project(slug.value);
        error.value = null;
    } catch (e) {
        error.value = errorMessage(e);
    }
}

/** Runs an action, showing its progress and errors */
async function run(name: string, action: () => Promise<AdminProject | void>, done?: string) {
    busy.value = name;
    error.value = null;
    notice.value = null;
    try {
        const updated = await action();
        if (updated) project.value = updated;
        if (done) notice.value = done;
    } catch (e) {
        error.value = errorMessage(e);
        await load();
    } finally {
        busy.value = null;
    }
}

const update = (patch: Partial<AdminProject>, done?: string) =>
    run('update', () => api.updateProject(slug.value, patch), done);

async function sync() {
    await run('sync', async () => {
        const { result, project: updated } = await api.sync(slug.value);
        if (result.error) throw new Error(result.error);
        const parts = [
            result.imported.length ? `imported ${result.imported.length}` : null,
            result.failed.length ? `${result.failed.length} failed` : null,
            result.released ? `released ${result.released}` : null
        ].filter(Boolean);
        notice.value = parts.length ? `Synced: ${parts.join(', ')}.` : 'Synced. Nothing new.';
        return updated;
    });
}

const importVersion = (version: AdminVersion) =>
    run(`import:${version.id}`, () => api.importVersion(slug.value, version.id), `Imported ${versionName(version)}.`);

const makeLive = (version: AdminVersion) => update({ liveVersion: version.id }, `${versionName(version)} is live.`);

async function remove() {
    if (!project.value) return;
    const name = project.value.title;
    if (
        !confirm(`Stop tracking "${name}" and delete its downloaded versions? The PlayCanvas project isn't affected.`)
    ) {
        return;
    }
    await run('delete', async () => {
        await api.deleteProject(slug.value);
        await navigateTo(api.config.adminRoute || '/');
    });
}

async function copyPreview(version: AdminVersion) {
    const url = api.playUrl(slug.value, version.previewToken);
    if (!url) return;
    await navigator.clipboard.writeText(new URL(url, location.origin).href);
    notice.value = `Copied the preview link for ${versionName(version)}.`;
}

const expiresInput = ref('');
watch(
    () => project.value?.expiresAt,
    (expiresAt) => {
        // datetime-local wants local time, without a zone
        const date = expiresAt ? new Date(expiresAt) : null;
        expiresInput.value = date
            ? new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
            : '';
    },
    { immediate: true }
);

// Scheduling a release
const scheduling = ref<string | null>(null);
const scheduleAt = ref('');

const startScheduling = (version: AdminVersion) => {
    scheduling.value = version.id;
    scheduleAt.value = '';
};

async function schedule(version: AdminVersion) {
    await update(
        { scheduledRelease: { versionId: version.id, at: new Date(scheduleAt.value).toISOString() } },
        `${versionName(version)} goes live ${formatDate(new Date(scheduleAt.value).toISOString())}.`
    );
    if (!error.value) scheduling.value = null;
}

const scheduledVersion = computed(() =>
    project.value?.versions.find((v) => v.id === project.value?.scheduledRelease?.versionId)
);

// Building a branch
const branches = ref<{ id: string; name: string }[] | null>(null);
const branchId = ref('');

async function loadBranches() {
    await run('branches', async () => {
        branches.value = (await api.branches(slug.value)).branches;
        branchId.value = branches.value.find((b) => b.name === 'main')?.id ?? branches.value[0]?.id ?? '';
    });
}

const buildBranch = () =>
    run(
        'build',
        () => api.buildBranch(slug.value, branchId.value),
        'Building. The version appears below, and gets a preview link once it has been imported.'
    );

const versionName = (version: AdminVersion) => version.label ?? version.title ?? version.id;

const isLive = (version: AdminVersion) => project.value?.liveVersion === version.id;

const statusChip = (version: AdminVersion) =>
    ({
        available: { label: 'Not downloaded', tone: '' },
        importing: { label: version.origin.type === 'branch' ? 'Building…' : 'Importing…', tone: 'warn' },
        ready: { label: 'Ready', tone: '' },
        failed: { label: 'Failed', tone: 'bad' }
    })[version.status];

const origin = (version: AdminVersion) => {
    if (version.origin.type === 'app') return `Published app ${version.origin.appId}`;
    if (version.origin.type === 'branch') return `Branch build, job ${version.origin.jobId}`;
    return version.origin.name;
};

const offline = computed(() => {
    const p = project.value;
    if (!p) return null;
    if (p.unpublished) return 'The project is offline. Visitors get a 404; preview links still work.';
    if (p.expiresAt && Date.parse(p.expiresAt) <= Date.now()) return 'The project has expired. Visitors get a 404.';
    if (!p.liveVersion) return 'Nothing is live yet. Make a version live to publish the project.';
    return null;
});

// Refresh while imports run, and while a newly added project waits for its first sync
let timer: ReturnType<typeof setInterval> | undefined;
watch(
    () => {
        const p = project.value;
        if (!p) return false;
        const waitingForFirstSync =
            p.playcanvas && !p.versions.length && Date.now() - Date.parse(p.createdAt) < 120_000;
        return Boolean(waitingForFirstSync || p.versions.some((v) => v.status === 'importing'));
    },
    (importing) => {
        clearInterval(timer);
        if (importing) timer = setInterval(load, 3000);
    }
);

onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
    <AdminShell :title="project?.title ?? slug" @authenticated="load">
        <template #actions>
            <a
                v-if="project?.liveVersion && api.playUrl(slug)"
                class="pc-button"
                :href="api.playUrl(slug)!"
                target="_blank"
                rel="noopener"
            >
                Open live ↗
            </a>
        </template>

        <p v-if="error" class="pc-alert">{{ error }}</p>
        <p v-if="notice" class="pc-alert pc-alert--info">{{ notice }}</p>
        <p v-if="!project && !error" class="pc-muted">Loading…</p>

        <template v-if="project">
            <p v-if="offline" class="pc-alert pc-alert--info">{{ offline }}</p>

            <div v-if="project.scheduledRelease" class="pc-alert pc-alert--info pc-row">
                <span>
                    <strong>{{
                        scheduledVersion ? versionName(scheduledVersion) : project.scheduledRelease.versionId
                    }}</strong>
                    goes live {{ formatDate(project.scheduledRelease.at) }}
                    <span class="pc-muted">({{ formatRelative(project.scheduledRelease.at) }})</span>
                </span>
                <span class="pc-spacer" />
                <button
                    class="pc-button"
                    type="button"
                    :disabled="busy !== null"
                    @click="update({ scheduledRelease: null }, 'Scheduled release cancelled.')"
                >
                    Cancel
                </button>
            </div>

            <section class="pc-card">
                <div class="pc-row">
                    <div>
                        <h2>{{ project.title }}</h2>
                        <div class="pc-muted">
                            <span class="pc-code">/{{ project.slug }}</span>
                            <template v-if="project.playcanvas">
                                ·
                                <a
                                    :href="`https://playcanvas.com/editor/project/${project.playcanvas.projectId}`"
                                    target="_blank"
                                    rel="noopener"
                                >
                                    PlayCanvas project {{ project.playcanvas.projectId }} ↗
                                </a>
                            </template>
                        </div>
                    </div>
                    <span class="pc-spacer" />
                    <template v-if="project.playcanvas">
                        <span class="pc-muted">Synced {{ formatRelative(project.lastSyncAt) }}</span>
                        <button class="pc-button" type="button" :disabled="busy !== null" @click="sync">
                            {{ busy === 'sync' ? 'Syncing…' : 'Sync now' }}
                        </button>
                    </template>
                </div>
            </section>

            <section class="pc-card">
                <h2>Release</h2>
                <label class="pc-switch">
                    <input
                        type="checkbox"
                        :checked="project.autoRelease"
                        :disabled="busy !== null"
                        @change="update({ autoRelease: ($event.target as HTMLInputElement).checked, pinned: false })"
                    />
                    <span>
                        Auto-release
                        <small>
                            Make the Editor's primary app (or the newest, without one) live as soon as it's imported.
                        </small>
                    </span>
                </label>
                <label v-if="project.autoRelease" class="pc-switch">
                    <input
                        type="checkbox"
                        :checked="project.pinned"
                        :disabled="busy !== null"
                        @change="update({ pinned: ($event.target as HTMLInputElement).checked })"
                    />
                    <span>
                        Pinned
                        <small
                            >Keep the current live version, and pause auto-release. Set when you pick a version by
                            hand.</small
                        >
                    </span>
                </label>
                <label class="pc-switch">
                    <input
                        type="checkbox"
                        :checked="project.unpublished"
                        :disabled="busy !== null"
                        @change="update({ unpublished: ($event.target as HTMLInputElement).checked })"
                    />
                    <span>
                        Offline
                        <small>Hide the project from visitors. Preview links keep working.</small>
                    </span>
                </label>
                <div class="pc-row pc-expiry">
                    <label class="pc-field">
                        Take offline at
                        <input v-model="expiresInput" class="pc-input" type="datetime-local" />
                    </label>
                    <button
                        class="pc-button"
                        type="button"
                        :disabled="busy !== null || !expiresInput"
                        @click="update({ expiresAt: new Date(expiresInput).toISOString() }, 'Expiry set.')"
                    >
                        Set
                    </button>
                    <button
                        v-if="project.expiresAt"
                        class="pc-button"
                        type="button"
                        :disabled="busy !== null"
                        @click="update({ expiresAt: null }, 'Expiry cleared.')"
                    >
                        Clear
                    </button>
                    <span v-if="project.expiresAt" class="pc-muted">{{ formatDate(project.expiresAt) }}</span>
                </div>
            </section>

            <section class="pc-card">
                <h2>Versions</h2>
                <p v-if="project.versions.length === 0" class="pc-muted">
                    No versions yet. Publish the project in the PlayCanvas Editor, then sync.
                </p>
                <div v-else class="pc-table-wrap">
                    <table class="pc-table">
                        <thead>
                            <tr>
                                <th>Version</th>
                                <th>Published</th>
                                <th>Status</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="version in project.versions" :key="version.id">
                                <td>
                                    <strong>{{ versionName(version) }}</strong>
                                    <div class="pc-muted">{{ origin(version) }} · {{ formatSize(version.size) }}</div>
                                    <div v-if="version.releaseNotes" class="pc-notes">{{ version.releaseNotes }}</div>
                                    <div v-if="version.error" class="pc-error">{{ version.error }}</div>
                                </td>
                                <td class="pc-muted">{{ formatDate(version.createdAt) }}</td>
                                <td>
                                    <span v-if="isLive(version)" class="pc-chip pc-chip--good">Live</span>
                                    <span
                                        v-else-if="project.scheduledRelease?.versionId === version.id"
                                        class="pc-chip pc-chip--warn"
                                    >
                                        Scheduled
                                    </span>
                                    <span v-else :class="`pc-chip pc-chip--${statusChip(version).tone}`">
                                        {{ statusChip(version).label }}
                                    </span>
                                </td>
                                <td>
                                    <div class="pc-row pc-actions">
                                        <button
                                            v-if="version.status === 'ready' && !isLive(version)"
                                            class="pc-button pc-button--primary"
                                            type="button"
                                            :disabled="busy !== null"
                                            @click="makeLive(version)"
                                        >
                                            Make live
                                        </button>
                                        <button
                                            v-if="
                                                version.status === 'ready' &&
                                                !isLive(version) &&
                                                scheduling !== version.id
                                            "
                                            class="pc-button"
                                            type="button"
                                            :disabled="busy !== null"
                                            @click="startScheduling(version)"
                                        >
                                            Schedule
                                        </button>
                                        <form
                                            v-if="scheduling === version.id"
                                            class="pc-row pc-schedule"
                                            @submit.prevent="schedule(version)"
                                        >
                                            <input
                                                v-model="scheduleAt"
                                                class="pc-input"
                                                type="datetime-local"
                                                required
                                                aria-label="Release time"
                                            />
                                            <button
                                                class="pc-button pc-button--primary"
                                                type="submit"
                                                :disabled="!scheduleAt || busy !== null"
                                            >
                                                Schedule
                                            </button>
                                            <button class="pc-button" type="button" @click="scheduling = null">
                                                Cancel
                                            </button>
                                        </form>
                                        <button
                                            v-if="
                                                (version.status === 'available' || version.status === 'failed') &&
                                                version.origin.type === 'app'
                                            "
                                            class="pc-button"
                                            type="button"
                                            :disabled="busy !== null"
                                            @click="importVersion(version)"
                                        >
                                            {{
                                                busy === `import:${version.id}`
                                                    ? 'Importing…'
                                                    : version.status === 'failed'
                                                      ? 'Retry'
                                                      : 'Import'
                                            }}
                                        </button>
                                        <template
                                            v-if="version.status === 'ready' && api.playUrl(slug, version.previewToken)"
                                        >
                                            <a
                                                class="pc-button"
                                                :href="api.playUrl(slug, version.previewToken)!"
                                                target="_blank"
                                                rel="noopener"
                                            >
                                                Preview ↗
                                            </a>
                                            <button class="pc-button" type="button" @click="copyPreview(version)">
                                                Copy link
                                            </button>
                                        </template>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <section v-if="project.playcanvas" class="pc-card">
                <h2>Build a branch</h2>
                <p class="pc-muted">
                    Build a branch's current state, including work that isn't published, and import it as a preview
                    version. It only goes live if you make it live.
                </p>
                <button
                    v-if="!branches"
                    class="pc-button"
                    type="button"
                    :disabled="busy !== null"
                    @click="loadBranches"
                >
                    {{ busy === 'branches' ? 'Loading branches…' : 'Choose a branch' }}
                </button>
                <form v-else class="pc-row" @submit.prevent="buildBranch">
                    <label class="pc-field">
                        Branch
                        <select v-model="branchId" class="pc-input" required>
                            <option v-for="branch in branches" :key="branch.id" :value="branch.id">
                                {{ branch.name }}
                            </option>
                        </select>
                    </label>
                    <button
                        class="pc-button pc-button--primary pc-build"
                        type="submit"
                        :disabled="!branchId || busy !== null"
                    >
                        {{ busy === 'build' ? 'Starting…' : 'Build preview' }}
                    </button>
                </form>
            </section>

            <section class="pc-card">
                <h2>Delete</h2>
                <div class="pc-row">
                    <span class="pc-muted">
                        Stop tracking this project and delete its downloaded versions. The PlayCanvas project isn't
                        affected.
                    </span>
                    <span class="pc-spacer" />
                    <button class="pc-button pc-button--danger" type="button" :disabled="busy !== null" @click="remove">
                        Delete project
                    </button>
                </div>
            </section>
        </template>
    </AdminShell>
</template>

<style scoped>
.pc-expiry {
    align-items: flex-end;
    margin-top: 8px;
}

.pc-notes {
    margin-top: 4px;
    white-space: pre-line;
}

.pc-error {
    margin-top: 4px;
    color: var(--pc-bad);
    font-size: 13px;
}

.pc-actions {
    justify-content: flex-end;
}

.pc-schedule {
    flex-wrap: nowrap;
}

.pc-build {
    align-self: flex-end;
}
</style>
