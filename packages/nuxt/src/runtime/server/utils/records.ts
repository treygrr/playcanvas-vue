import type { EditorManifest } from '@treygrr/playcanvas-vue/editor/manifest';

/**
 * Where a version's files came from.
 */
export type VersionOrigin =
    /** A published app, copied from PlayCanvas hosting */
    | { type: 'app'; appId: number }
    /** A build of a branch, made with the app download API */
    | { type: 'branch'; branchId: string; jobId: number }
    /** A zip uploaded or added by hand */
    | { type: 'zip'; name: string };

/**
 * - `available`: known from PlayCanvas, but its files haven't been downloaded
 * - `importing`: its files are being downloaded
 * - `ready`: stored, and can be shown
 * - `failed`: the import failed, see `error`. Retried by later syncs
 */
export type VersionStatus = 'available' | 'importing' | 'ready' | 'failed';

/**
 * One version of a project. Its files are stored under its id, and never change once ready.
 */
export type VersionRecord = {
    /** A content hash for zips, or eg `app-786530` for published apps */
    id: string;
    /** The version label, eg from the Editor's publish dialog */
    label: string | null;
    releaseNotes: string | null;
    origin: VersionOrigin;
    status: VersionStatus;
    /** Why the import failed */
    error?: string;
    /** How many times importing has been tried */
    attempts?: number;
    /** When the last import attempt started, as an ISO date */
    lastAttemptAt?: string;
    /** When the version was published or built, as an ISO date */
    createdAt: string;
    /** When the version finished importing, as an ISO date */
    importedAt?: string;
    /** The total size of the version's files, in bytes */
    size?: number;
    /** A secret for preview links, which show this version even when it isn't live */
    previewToken: string;
    title?: string;
    engineVersion?: string | null;
    manifest?: EditorManifest;
};

/**
 * A project managed by the CMS: its PlayCanvas source, its versions, and which one is live.
 */
export type ProjectRecord = {
    slug: string;
    title: string;
    /** The PlayCanvas project this mirrors, or null for projects made from zips */
    playcanvas: { projectId: number; branchId?: string } | null;
    versions: VersionRecord[];
    /** The id of the live version, or null when no version is live yet */
    liveVersion: string | null;
    /**
     * Make the PlayCanvas primary app (or newest app, without one) live automatically once imported
     * @default false
     */
    autoRelease: boolean;
    /** Keep the live version as is, even with auto-release on, eg after a rollback */
    pinned?: boolean;
    /** Take the project offline, without removing it */
    unpublished: boolean;
    /** Take the project offline at this time, as an ISO date */
    expiresAt: string | null;
    /** When PlayCanvas was last checked for new published apps, as an ISO date */
    lastSyncAt: string | null;
    createdAt: string;
};

export type ResolveOptions = {
    /** A preview token from the URL */
    preview?: string | null;
    /** Defaults to the current time */
    now?: Date;
};

/**
 * Which version a visitor sees: the version a valid preview token belongs to, or else the live
 * version, unless the project is unpublished or has expired. Only ready versions are ever shown.
 *
 * @param project The project.
 * @param options A preview token, and the current time.
 * @returns The version to show, or null if the project isn't available.
 */
export function resolveVersion(project: ProjectRecord, options: ResolveOptions = {}): VersionRecord | null {
    const { preview, now = new Date() } = options;
    const ready = project.versions.filter((version) => version.status === 'ready');

    // Preview links work while a project is offline, so it can be checked before going live
    if (preview) {
        const previewed = ready.find((version) => timingSafeEqual(version.previewToken, preview));
        if (previewed) return previewed;
    }

    if (project.unpublished) return null;
    if (project.expiresAt && new Date(project.expiresAt) <= now) return null;

    return ready.find((version) => version.id === project.liveVersion) ?? null;
}

/**
 * Compares two strings in time independent of where they differ, so tokens can't be guessed
 * character by character.
 */
export function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return difference === 0;
}

/**
 * A random token for preview links.
 */
export function createToken(): string {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(18));
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * A new project, with no versions.
 */
export function createProjectRecord(
    slug: string,
    title: string,
    playcanvas: ProjectRecord['playcanvas'] = null
): ProjectRecord {
    return {
        slug,
        title,
        playcanvas,
        versions: [],
        liveVersion: null,
        autoRelease: false,
        pinned: false,
        unpublished: false,
        expiresAt: null,
        lastSyncAt: null,
        createdAt: new Date().toISOString()
    };
}
