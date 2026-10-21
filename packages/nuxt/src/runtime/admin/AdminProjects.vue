<script setup lang="ts">
/**
 * The admin's home: tracked PlayCanvas projects, and adding new ones.
 */
import { ref } from 'vue';

import { definePageMeta, navigateTo } from '#imports';

import type { AdminProjectSummary } from './api';
import { errorMessage, formatRelative, useAdminApi } from './api';
import AdminShell from './AdminShell.vue';

definePageMeta({ layout: false });

const api = useAdminApi();
const projects = ref<AdminProjectSummary[] | null>(null);
const repo = ref<{ slug: string; title: string; version: string }[]>([]);
const loadError = ref<string | null>(null);

const projectId = ref('');
const slug = ref('');
const adding = ref(false);
const addError = ref<string | null>(null);

async function load() {
    try {
        const data = await api.projects();
        projects.value = data.projects;
        repo.value = data.repo;
        loadError.value = null;
    } catch (error) {
        loadError.value = errorMessage(error);
    }
}

/** Accepts an id, or a URL like https://playcanvas.com/editor/project/1625489 */
const parseProjectId = (value: string) => Number(value.trim().match(/(\d+)\/?$/)?.[1] ?? NaN);

async function add() {
    const id = parseProjectId(projectId.value);
    if (!Number.isInteger(id)) {
        addError.value = 'Enter a project id, or a link to the project in the Editor';
        return;
    }

    adding.value = true;
    addError.value = null;
    try {
        const project = await api.addProject(id, slug.value.trim() || undefined);
        await navigateTo(`${api.config.adminRoute}/manage/${project.slug}`);
    } catch (error) {
        addError.value = errorMessage(error);
    } finally {
        adding.value = false;
    }
}

const status = (project: AdminProjectSummary) => {
    if (project.unpublished) return { label: 'Offline', tone: 'bad' };
    if (project.expiresAt && Date.parse(project.expiresAt) <= Date.now()) return { label: 'Expired', tone: 'bad' };
    if (!project.liveVersion) return { label: 'Not live', tone: 'warn' };
    return { label: 'Live', tone: 'good' };
};
</script>

<template>
    <AdminShell title="Projects" @authenticated="load">
        <p v-if="loadError" class="pc-alert">{{ loadError }}</p>

        <section class="pc-card">
            <h2>Add a PlayCanvas project</h2>
            <p class="pc-muted">
                Its published apps are imported automatically. Find the id in the Editor's address bar:
                <span class="pc-code">playcanvas.com/editor/project/<b>1234567</b></span>
            </p>
            <form class="pc-row" @submit.prevent="add">
                <label class="pc-field">
                    Project id or link
                    <input v-model="projectId" class="pc-input" inputmode="numeric" required placeholder="1234567" />
                </label>
                <label class="pc-field">
                    <span>URL slug <span class="pc-muted">(optional)</span></span>
                    <input v-model="slug" class="pc-input" placeholder="from the app name" />
                </label>
                <button class="pc-button pc-button--primary pc-add" type="submit" :disabled="adding">
                    {{ adding ? 'Adding…' : 'Add project' }}
                </button>
            </form>
            <p v-if="addError" class="pc-alert pc-add-error">{{ addError }}</p>
        </section>

        <section class="pc-card">
            <h2>Projects</h2>
            <p v-if="!projects" class="pc-muted">Loading…</p>
            <p v-else-if="projects.length === 0" class="pc-muted">No projects yet. Add one above.</p>
            <div v-else class="pc-table-wrap">
                <table class="pc-table">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Status</th>
                            <th>Live version</th>
                            <th>Release</th>
                            <th>Last sync</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="project in projects" :key="project.slug">
                            <td>
                                <a :href="`${api.config.adminRoute}/manage/${project.slug}`">
                                    <strong>{{ project.title }}</strong>
                                </a>
                                <div class="pc-muted pc-code">/{{ project.slug }}</div>
                            </td>
                            <td>
                                <div class="pc-row">
                                    <span :class="`pc-chip pc-chip--${status(project).tone}`">{{
                                        status(project).label
                                    }}</span>
                                    <span v-if="project.importing" class="pc-chip"
                                        >Importing {{ project.importing }}</span
                                    >
                                    <span v-if="project.failed" class="pc-chip pc-chip--bad"
                                        >{{ project.failed }} failed</span
                                    >
                                </div>
                            </td>
                            <td>{{ project.liveLabel ?? project.liveVersion ?? '—' }}</td>
                            <td>
                                <span v-if="project.autoRelease && project.pinned">Pinned</span>
                                <span v-else-if="project.autoRelease">Automatic</span>
                                <span v-else>Manual</span>
                            </td>
                            <td class="pc-muted">
                                {{ project.playcanvas ? formatRelative(project.lastSyncAt) : '—' }}
                            </td>
                            <td>
                                <a
                                    v-if="project.liveVersion && api.playUrl(project.slug)"
                                    class="pc-button"
                                    :href="api.playUrl(project.slug)!"
                                    target="_blank"
                                    rel="noopener"
                                >
                                    Open ↗
                                </a>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <section v-if="repo.length" class="pc-card">
            <h2>From repo zips</h2>
            <p class="pc-muted">
                These come from zips in the project's <span class="pc-code">playcanvas/</span> folder, and change with
                deploys.
            </p>
            <div class="pc-table-wrap">
                <table class="pc-table">
                    <tbody>
                        <tr v-for="project in repo" :key="project.slug">
                            <td>
                                <strong>{{ project.title }}</strong>
                                <div class="pc-muted pc-code">/{{ project.slug }}</div>
                            </td>
                            <td class="pc-muted pc-code">{{ project.version }}</td>
                            <td>
                                <a
                                    v-if="api.playUrl(project.slug)"
                                    class="pc-button"
                                    :href="api.playUrl(project.slug)!"
                                    target="_blank"
                                    rel="noopener"
                                >
                                    Open ↗
                                </a>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    </AdminShell>
</template>

<style scoped>
.pc-add {
    align-self: flex-end;
}

.pc-add-error {
    margin: 12px 0 0;
}
</style>
