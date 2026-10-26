import { useRuntimeConfig, useState } from '#imports';

export type AuthState = {
    authenticated: boolean;
    method: 'hook' | 'password' | null;
    passwordLogin: boolean;
    configured: boolean;
};

export type VersionStatus = 'available' | 'importing' | 'ready' | 'failed';

export type AdminVersion = {
    id: string;
    label: string | null;
    releaseNotes: string | null;
    origin:
        | { type: 'app'; appId: number }
        | { type: 'branch'; branchId: string; jobId: number }
        | { type: 'zip'; name: string };
    status: VersionStatus;
    error?: string;
    attempts?: number;
    createdAt: string;
    importedAt?: string;
    size?: number;
    previewToken: string;
    title?: string;
    engineVersion?: string | null;
};

export type AdminProject = {
    slug: string;
    title: string;
    playcanvas: { projectId: number } | null;
    versions: AdminVersion[];
    liveVersion: string | null;
    autoRelease: boolean;
    pinned: boolean;
    unpublished: boolean;
    expiresAt: string | null;
    scheduledRelease: { versionId: string; at: string } | null;
    lastSyncAt: string | null;
    createdAt: string;
};

export type AdminProjectSummary = Omit<AdminProject, 'versions' | 'createdAt' | 'scheduledRelease'> & {
    liveLabel: string | null;
    versions: number;
    importing: number;
    failed: number;
};

export type SyncResult = {
    slug: string;
    imported: string[];
    failed: string[];
    released: string | null;
    error?: string;
};

/** Routes are empty when disabled */
type PublicConfig = { baseURL: string; playRoute: string; adminRoute: string };

/** Reads the message from a failed admin API request */
export function errorMessage(error: unknown): string {
    const e = error as {
        data?: { statusMessage?: string; message?: string };
        statusMessage?: string;
        message?: string;
    };
    return e?.data?.statusMessage || e?.data?.message || e?.statusMessage || e?.message || 'Something went wrong';
}

export function useAdminApi() {
    const config = useRuntimeConfig().public.playcanvas as PublicConfig;

    const request = <T>(path: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {}) =>
        $fetch<T>(`${config.baseURL}/api/admin/${path}`, {
            method: options.method ?? 'GET',
            body: options.body as Record<string, unknown> | undefined,
            // Required for changes: other sites can't send it without a CORS preflight
            headers: { 'x-playcanvas-admin': '1' }
        });

    return {
        config,
        session: () => request<AuthState>('session'),
        login: (password: string) => request<AuthState>('login', { method: 'POST', body: { password } }),
        logout: () => request('logout', { method: 'POST' }),
        projects: () =>
            request<{ projects: AdminProjectSummary[]; repo: { slug: string; title: string; version: string }[] }>(
                'projects'
            ),
        addProject: (projectId: number, slug?: string) =>
            request<AdminProject>('projects', { method: 'POST', body: { projectId, slug } }),
        project: (slug: string) => request<AdminProject>(`projects/${encodeURIComponent(slug)}`),
        updateProject: (slug: string, patch: Partial<AdminProject>) =>
            request<AdminProject>(`projects/${encodeURIComponent(slug)}`, { method: 'PATCH', body: patch }),
        deleteProject: (slug: string) => request(`projects/${encodeURIComponent(slug)}`, { method: 'DELETE' }),
        sync: (slug: string) =>
            request<{ result: SyncResult; project: AdminProject }>(`projects/${encodeURIComponent(slug)}/sync`, {
                method: 'POST'
            }),
        branches: (slug: string) =>
            request<{ branches: { id: string; name: string }[]; scenes: { id: number; name: string }[] }>(
                `projects/${encodeURIComponent(slug)}/branches`
            ),
        buildBranch: (slug: string, branchId: string) =>
            request<AdminProject>(`projects/${encodeURIComponent(slug)}/builds`, {
                method: 'POST',
                body: { branchId }
            }),
        importVersion: (slug: string, id: string) =>
            request<AdminProject>(`projects/${encodeURIComponent(slug)}/versions/${encodeURIComponent(id)}/import`, {
                method: 'POST'
            }),
        /** The public page of a project, or of a version with its preview token */
        playUrl: (slug: string, previewToken?: string) =>
            config.playRoute
                ? `${config.playRoute}/${encodeURIComponent(slug)}${previewToken ? `?preview=${encodeURIComponent(previewToken)}` : ''}`
                : null
    };
}

export type RepoProject = { slug: string; title: string; version: string };

/**
 * The project list, shared by the sidebar and the projects page, so a change on one page shows in the other.
 * Loaded once logged in: `null` until then.
 */
export function useAdminProjects() {
    const api = useAdminApi();
    const projects = useState<AdminProjectSummary[] | null>('playcanvas-admin-projects', () => null);
    const repo = useState<RepoProject[]>('playcanvas-admin-repo', () => []);
    const refresh = async () => {
        const data = await api.projects();
        projects.value = data.projects;
        repo.value = data.repo;
    };
    return { projects, repo, refresh };
}

type Color = 'primary' | 'success' | 'warning' | 'error' | 'neutral' | 'info';
export type Status = { label: string; color: Color; icon: string };

/** Whether visitors can play a project, and why not */
export function projectStatus(
    project: Pick<AdminProject, 'unpublished' | 'expiresAt' | 'liveVersion'>,
    now = Date.now()
): Status {
    if (project.unpublished) return { label: 'Offline', color: 'neutral', icon: 'i-lucide-eye-off' };
    if (project.expiresAt && Date.parse(project.expiresAt) <= now) {
        return { label: 'Expired', color: 'error', icon: 'i-lucide-clock-alert' };
    }
    if (!project.liveVersion) return { label: 'Not live', color: 'warning', icon: 'i-lucide-circle-dashed' };
    return { label: 'Live', color: 'success', icon: 'i-lucide-radio' };
}

/** How a project's live version is chosen */
export function releaseMode(project: Pick<AdminProject, 'autoRelease' | 'pinned'>): Status {
    if (project.autoRelease && project.pinned) return { label: 'Pinned', color: 'neutral', icon: 'i-lucide-pin' };
    if (project.autoRelease) return { label: 'Automatic', color: 'neutral', icon: 'i-lucide-zap' };
    return { label: 'Manual', color: 'neutral', icon: 'i-lucide-hand' };
}

export const versionName = (version: AdminVersion) => version.label ?? version.title ?? version.id;

/** Where a version came from, with an icon */
export function versionOrigin(version: AdminVersion): { label: string; icon: string } {
    if (version.origin.type === 'app') {
        return { label: `Published app ${version.origin.appId}`, icon: 'i-lucide-upload-cloud' };
    }
    if (version.origin.type === 'branch') {
        return { label: `Branch build, job ${version.origin.jobId}`, icon: 'i-lucide-git-branch' };
    }
    return { label: version.origin.name, icon: 'i-lucide-file-archive' };
}

/** A `datetime-local` input's value for a date: local time, without a zone */
export const toLocalInput = (date: string | null | undefined) => {
    if (!date) return '';
    const value = new Date(date);
    return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function formatSize(bytes: number | undefined): string {
    if (!bytes) return '—';
    const mb = bytes / 1024 / 1024;
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}
