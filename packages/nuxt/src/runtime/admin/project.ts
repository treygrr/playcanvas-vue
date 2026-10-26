import type { InjectionKey, Ref } from 'vue';
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';

import { useToast } from '#imports';

import type { AdminProject } from './api';
import { errorMessage, useAdminApi, useAdminProjects } from './api';

/**
 * One project's state and actions, for its page and the sections in it: the page creates it and provides it, the
 * sections inject it. Every change goes through `run`, which shows a toast and keeps the sidebar's list current.
 */
export function useProjectController(slug: Ref<string>) {
    const api = useAdminApi();
    const toast = useToast();
    const { refresh: refreshList } = useAdminProjects();

    const project = ref<AdminProject | null>(null);
    const loadError = ref<string | null>(null);
    /** The action running, eg 'sync' or 'import:<id>', so its button shows progress and others wait */
    const busy = ref<string | null>(null);

    async function load() {
        try {
            project.value = await api.project(slug.value);
            loadError.value = null;
        } catch (error) {
            loadError.value = errorMessage(error);
        }
    }

    /** Runs an action, then says how it went */
    async function run(name: string, action: () => Promise<AdminProject | void>, done?: string) {
        busy.value = name;
        try {
            const updated = await action();
            if (updated) project.value = updated;
            if (done) toast.add({ title: done, color: 'success', icon: 'i-lucide-circle-check' });
            refreshList().catch(() => undefined);
            return true;
        } catch (error) {
            toast.add({ title: errorMessage(error), color: 'error', icon: 'i-lucide-circle-alert' });
            await load();
            return false;
        } finally {
            busy.value = null;
        }
    }

    const update = (patch: Partial<AdminProject>, done?: string) =>
        run('update', () => api.updateProject(slug.value, patch), done);

    // Refresh while imports run, and while a newly added project waits for its first sync
    const importing = computed(() => {
        const p = project.value;
        if (!p) return false;
        const waitingForFirstSync =
            p.playcanvas && !p.versions.length && Date.now() - Date.parse(p.createdAt) < 120_000;
        return Boolean(waitingForFirstSync || p.versions.some((v) => v.status === 'importing'));
    });
    let timer: ReturnType<typeof setInterval> | undefined;
    watch(importing, (isImporting) => {
        clearInterval(timer);
        if (isImporting) timer = setInterval(load, 3000);
    });
    onBeforeUnmount(() => clearInterval(timer));

    return { api, slug, project, loadError, busy, importing, load, run, update };
}

export type ProjectController = ReturnType<typeof useProjectController>;

export const projectKey: InjectionKey<ProjectController> = Symbol('playcanvas-admin-project');

/** The project of the page the section is on */
export function useProject(): ProjectController {
    const controller = inject(projectKey);
    if (!controller) throw new Error('[playcanvas] useProject() is for the sections of a project page');
    return controller;
}
