import { useRuntimeConfig } from '#imports';

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
    lastSyncAt: string | null;
    createdAt: string;
};

export type AdminProjectSummary = Omit<AdminProject, 'versions' | 'createdAt'> & {
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

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const formatDate = (date: string | null | undefined) => (date ? dateFormat.format(new Date(date)) : '—');

/** eg "5 minutes ago" */
export function formatRelative(date: string | null | undefined): string {
    if (!date) return 'never';
    const seconds = (Date.parse(date) - Date.now()) / 1000;
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ['day', 86_400],
        ['hour', 3_600],
        ['minute', 60]
    ];
    for (const [unit, size] of units) {
        if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
    }
    return 'just now';
}

export function formatSize(bytes: number | undefined): string {
    if (!bytes) return '—';
    const mb = bytes / 1024 / 1024;
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}
