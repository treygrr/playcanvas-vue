import type { Storage } from 'unstorage';

import type { PlayCanvasApp, PlayCanvasClient } from './playcanvas-api';
import { PlayCanvasApiError } from './playcanvas-api';
import type { ImportOptions } from './published-app';
import { appVersionId, importPublishedApp } from './published-app';
import type { ProjectRecord, VersionRecord } from './records';
import { createToken } from './records';
import { getProject, listProjects, updateProject } from './store';

export type SyncOptions = ImportOptions & {
    /** Defaults to the current time */
    now?: Date;
};

export type SyncResult = {
    slug: string;
    /** Version ids imported by this sync */
    imported: string[];
    /** Version ids whose import failed */
    failed: string[];
    /** The version made live by auto-release, if any */
    released: string | null;
    error?: string;
};

const MAX_ATTEMPTS = 5;
/** An import still marked as importing after this long was interrupted, eg by a restart */
const STALE_IMPORT_MS = 30 * 60_000;

/** Whether a failed or interrupted import should be tried again: up to 5 times, backing off from 5 minutes */
function shouldRetry(version: VersionRecord, now: Date): boolean {
    const attempts = version.attempts ?? 0;
    if (attempts >= MAX_ATTEMPTS) return false;
    const last = version.lastAttemptAt ? Date.parse(version.lastAttemptAt) : 0;
    if (version.status === 'importing') return now.getTime() - last > STALE_IMPORT_MS;
    return now.getTime() - last > 5 * 60_000 * 2 ** (attempts - 1);
}

/** A version record for a published app that hasn't been downloaded */
function availableVersion(app: PlayCanvasApp): VersionRecord {
    return {
        id: appVersionId(app),
        label: app.version,
        releaseNotes: app.release_notes,
        origin: { type: 'app', appId: app.id },
        status: 'available',
        createdAt: app.completed_at ?? app.created_at,
        previewToken: createToken(),
        title: app.name
    };
}

/** Replaces a version in a project, keeping its preview token so preview links keep working */
export function putVersion(project: ProjectRecord, version: VersionRecord): void {
    const existing = project.versions.find((v) => v.id === version.id);
    const merged = existing ? { ...version, previewToken: existing.previewToken } : version;
    project.versions = [...project.versions.filter((v) => v.id !== version.id), merged];
}

/**
 * Brings a tracked PlayCanvas project up to date:
 *
 * 1. Every published app is recorded as a version. Only the primary app and the newest app are
 *    downloaded; older ones stay `available`, to import on demand.
 * 2. Failed and interrupted imports are retried, with backoff.
 * 3. With auto-release on and the project not pinned, the primary app (or newest, without one)
 *    goes live once it's ready.
 *
 * Changes are saved as they happen, re-reading the project each time so that edits made meanwhile,
 * eg in the admin, aren't overwritten.
 */
export async function syncProject(
    storage: Storage,
    client: PlayCanvasClient,
    slug: string,
    options: SyncOptions = {}
): Promise<SyncResult> {
    const result: SyncResult = { slug, imported: [], failed: [], released: null };
    const now = options.now ?? new Date();

    const project = await getProject(storage, slug);
    if (!project?.playcanvas) return { ...result, error: 'not a PlayCanvas project' };
    const { projectId } = project.playcanvas;

    let apps: PlayCanvasApp[];
    let primary: PlayCanvasApp | null;
    try {
        [apps, primary] = await Promise.all([client.listApps(projectId), client.getPrimaryApp(projectId)]);
    } catch (error) {
        await updateProject(storage, slug, (p) => {
            p.lastSyncAt = now.toISOString();
        });
        const message = error instanceof PlayCanvasApiError ? error.message : String(error);
        return { ...result, error: message };
    }

    // Only finished builds can be imported
    apps = apps.filter((app) => app.completed_at);
    const newest = apps[0] ?? null;
    const target = primary && apps.some((app) => app.id === primary!.id) ? primary : newest;

    // 1. Record every published app
    await updateProject(storage, slug, (p) => {
        for (const app of apps) {
            if (!p.versions.some((v) => v.id === appVersionId(app))) p.versions.push(availableVersion(app));
        }
        p.lastSyncAt = now.toISOString();
    });

    // 2. Import the target and newest apps, and retry failures
    const wanted = new Set([target, newest].filter(Boolean).map((app) => appVersionId(app!)));
    const current = (await getProject(storage, slug))!;
    const toImport = apps.filter((app) => {
        const version = current.versions.find((v) => v.id === appVersionId(app));
        if (!version || version.status === 'ready') return false;
        if (version.status === 'available') return wanted.has(version.id);
        return shouldRetry(version, now);
    });

    for (const app of toImport) {
        const id = appVersionId(app);
        const started = await updateProject(storage, slug, (p) => {
            const version = p.versions.find((v) => v.id === id)!;
            version.status = 'importing';
            version.attempts = (version.attempts ?? 0) + 1;
            version.lastAttemptAt = new Date().toISOString();
            delete version.error;
        });
        if (!started) return { ...result, error: 'the project was deleted during sync' };

        try {
            const imported = await importPublishedApp(storage, { ...started, versions: [] }, app, options);
            await updateProject(storage, slug, (p) => putVersion(p, imported));
            result.imported.push(id);
        } catch (error) {
            await updateProject(storage, slug, (p) => {
                const version = p.versions.find((v) => v.id === id);
                if (!version) return;
                version.status = 'failed';
                version.error = error instanceof Error ? error.message : String(error);
            });
            result.failed.push(id);
        }
    }

    // 3. Auto-release
    if (target) {
        const targetId = appVersionId(target);
        await updateProject(storage, slug, (p) => {
            const ready = p.versions.some((v) => v.id === targetId && v.status === 'ready');
            if (p.autoRelease && !p.pinned && ready && p.liveVersion !== targetId) {
                p.liveVersion = targetId;
                result.released = targetId;
            }
        });
    }

    return result;
}

/** Whether a project is due a sync */
export function isSyncDue(project: ProjectRecord, intervalSeconds: number, now = new Date()): boolean {
    if (!project.playcanvas) return false;
    if (!project.lastSyncAt) return true;
    return now.getTime() - Date.parse(project.lastSyncAt) >= intervalSeconds * 1000;
}

// Syncs in progress in this server process, so concurrent requests don't start duplicates
const running = new Map<string, Promise<SyncResult>>();

/**
 * Syncs a project, unless a sync of it is already running in this process, in which case that
 * sync's result is returned.
 */
export function syncProjectOnce(
    storage: Storage,
    client: PlayCanvasClient,
    slug: string,
    options?: SyncOptions
): Promise<SyncResult> {
    const existing = running.get(slug);
    if (existing) return existing;

    const sync = syncProject(storage, client, slug, options).finally(() => running.delete(slug));
    running.set(slug, sync);
    return sync;
}

/** Syncs every tracked PlayCanvas project, one at a time to stay well within rate limits */
export async function syncAllProjects(
    storage: Storage,
    client: PlayCanvasClient,
    options?: SyncOptions
): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    for (const project of await listProjects(storage)) {
        if (project.playcanvas) results.push(await syncProjectOnce(storage, client, project.slug, options));
    }
    return results;
}
