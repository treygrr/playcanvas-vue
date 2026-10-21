/**
 * A published app of a PlayCanvas project.
 * @see https://developer.playcanvas.com/user-manual/api/app-get/
 */
export type PlayCanvasApp = {
    id: number;
    project_id: number;
    owner_id: number;
    name: string;
    description: string | null;
    version: string | null;
    release_notes: string | null;
    thumbnails: { s: string; m: string; l: string; xl: string } | null;
    size: number;
    views: number;
    completed_at: string | null;
    created_at: string;
    modified_at: string;
    url: string;
};

export type PlayCanvasScene = { id: number; projectId: number; name: string; created: string; modified: string };

export type PlayCanvasBranch = {
    id: string;
    projectId: number;
    name: string;
    closed: boolean;
    permanent: boolean;
    latestCheckpointId: string | null;
};

export type PlayCanvasJob<Data = Record<string, unknown>> = {
    id: number;
    status: 'running' | 'complete' | 'error';
    messages: string[];
    created_at: string;
    modified_at: string;
    data: Data;
};

export type DownloadAppOptions = {
    projectId: number;
    name: string;
    /** Scene ids. The first is the initial scene */
    scenes: number[];
    branchId?: string;
    version?: string;
    releaseNotes?: string;
    engineVersion?: string;
};

export class PlayCanvasApiError extends Error {
    constructor(
        message: string,
        /** The HTTP status, or 0 if the request failed */
        public readonly status: number,
        /** For 429 responses, how long until the rate limit resets */
        public readonly retryAfterSeconds?: number
    ) {
        super(message);
        this.name = 'PlayCanvasApiError';
    }
}

export type PlayCanvasClientOptions = {
    token: string;
    /** @default 'https://playcanvas.com/api' */
    apiURL?: string;
    fetch?: typeof fetch;
};

/**
 * Seconds until the rate limit resets, from either the `ratelimit` header (`limit=120, remaining=0, reset=42`)
 * or `X-RateLimit-Reset` (epoch seconds).
 */
const retryAfter = (headers: Headers): number | undefined => {
    const reset = headers.get('ratelimit')?.match(/reset=(\d+)/)?.[1];
    if (reset) return Number(reset);
    const epoch = Number(headers.get('x-ratelimit-reset'));
    return epoch ? Math.max(0, Math.ceil(epoch - Date.now() / 1000)) : undefined;
};

/**
 * A client for the parts of the PlayCanvas REST API the CMS uses. The token is only ever sent to the API.
 * @see https://developer.playcanvas.com/user-manual/api/
 */
export function createPlayCanvasClient({
    token,
    apiURL = 'https://playcanvas.com/api',
    fetch: fetchFn = globalThis.fetch
}: PlayCanvasClientOptions) {
    if (!token) {
        throw new PlayCanvasApiError(
            'No PlayCanvas API token. Set NUXT_PLAYCANVAS_TOKEN to a token from your PlayCanvas account page.',
            401
        );
    }

    const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
        let response: Response;
        try {
            response = await fetchFn(`${apiURL}${path}`, {
                ...init,
                headers: {
                    authorization: `Bearer ${token}`,
                    ...(init.body ? { 'content-type': 'application/json' } : {}),
                    ...init.headers
                }
            });
        } catch (error) {
            throw new PlayCanvasApiError(`PlayCanvas API request failed: ${(error as Error).message}`, 0);
        }

        if (!response.ok) {
            const reason =
                {
                    401: 'the API token is invalid or revoked',
                    403: "the API token can't access this",
                    404: 'not found',
                    429: 'rate limited'
                }[response.status] ?? response.statusText;
            throw new PlayCanvasApiError(
                `PlayCanvas API ${init.method ?? 'GET'} ${path}: ${response.status} ${reason}`,
                response.status,
                response.status === 429 ? retryAfter(response.headers) : undefined
            );
        }

        return (await response.json()) as T;
    };

    return {
        /** All published apps of a project, newest first */
        async listApps(projectId: number): Promise<PlayCanvasApp[]> {
            const apps: PlayCanvasApp[] = [];
            const limit = 50;
            for (let skip = 0; ; skip += limit) {
                const page = await request<{ result: PlayCanvasApp[]; pagination?: { total?: number } }>(
                    `/projects/${projectId}/apps?skip=${skip}&limit=${limit}`
                );
                apps.push(...page.result);
                if (page.result.length < limit || apps.length >= (page.pagination?.total ?? Infinity)) break;
            }
            return apps.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        },

        /** The project's primary app, or null if it has none */
        async getPrimaryApp(projectId: number): Promise<PlayCanvasApp | null> {
            try {
                return await request<PlayCanvasApp>(`/projects/${projectId}/app`);
            } catch (error) {
                if (error instanceof PlayCanvasApiError && error.status === 404) return null;
                throw error;
            }
        },

        getApp: (appId: number) => request<PlayCanvasApp>(`/apps/${appId}`),

        listScenes: async (projectId: number) =>
            (await request<{ result: PlayCanvasScene[] }>(`/projects/${projectId}/scenes`)).result,

        listBranches: async (projectId: number) =>
            (await request<{ result: PlayCanvasBranch[] }>(`/projects/${projectId}/branches`)).result,

        /** Starts building a downloadable app. This route has a strict rate limit */
        downloadApp: (options: DownloadAppOptions) =>
            request<PlayCanvasJob>('/apps/download', {
                method: 'POST',
                body: JSON.stringify({
                    project_id: options.projectId,
                    name: options.name,
                    scenes: options.scenes,
                    branch_id: options.branchId,
                    version: options.version,
                    release_notes: options.releaseNotes,
                    engine_version: options.engineVersion,
                    format: 'static',
                    scripts_concatenate: true
                })
            }),

        getJob: <Data = Record<string, unknown>>(jobId: number) => request<PlayCanvasJob<Data>>(`/jobs/${jobId}`)
    };
}

export type PlayCanvasClient = ReturnType<typeof createPlayCanvasClient>;
