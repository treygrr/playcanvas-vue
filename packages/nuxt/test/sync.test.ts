import { createStorage } from 'unstorage';
import { describe, it, expect, vi } from 'vitest';

import type { PlayCanvasApp, PlayCanvasClient } from '../src/runtime/server/utils/playcanvas-api.ts';
import { PlayCanvasApiError } from '../src/runtime/server/utils/playcanvas-api.ts';
import type { ProjectRecord } from '../src/runtime/server/utils/records.ts';
import { createProjectRecord } from '../src/runtime/server/utils/records.ts';
import { getProject, saveProject } from '../src/runtime/server/utils/store.ts';
import { isSyncDue, syncAllProjects, syncProject, syncProjectOnce } from '../src/runtime/server/utils/sync.ts';

import { buildFiles, fakeHosting, publishedApp } from './helpers.ts';

// Three publishes, newest first, like the API returns them
const v3 = publishedApp(3, 'ccc', {
    version: '3.0',
    created_at: '2026-10-03T00:00:00Z',
    completed_at: '2026-10-03T00:01:00Z'
});
const v2 = publishedApp(2, 'bbb', {
    version: '2.0',
    created_at: '2026-10-02T00:00:00Z',
    completed_at: '2026-10-02T00:01:00Z'
});
const v1 = publishedApp(1, 'aaa', {
    version: '1.0',
    created_at: '2026-10-01T00:00:00Z',
    completed_at: '2026-10-01T00:01:00Z'
});

const hosting = () => fakeHosting({ aaa: buildFiles(), bbb: buildFiles(), ccc: buildFiles() });

const fakeClient = (apps: PlayCanvasApp[], primary: PlayCanvasApp | null = null): PlayCanvasClient =>
    ({
        listApps: vi.fn(async () => apps),
        getPrimaryApp: vi.fn(async () => primary)
    }) as unknown as PlayCanvasClient;

const setup = async (overrides: Partial<ProjectRecord> = {}) => {
    const storage = createStorage();
    await saveProject(storage, { ...createProjectRecord('game', 'Game', { projectId: 1625489 }), ...overrides });
    return storage;
};

const statuses = async (storage: ReturnType<typeof createStorage>) =>
    Object.fromEntries((await getProject(storage, 'game'))!.versions.map((v) => [v.id, v.status]));

describe('syncProject', () => {
    it('records every published app, but only downloads the newest', async () => {
        const storage = await setup();
        const { fetch } = hosting();

        const result = await syncProject(storage, fakeClient([v3, v2, v1]), 'game', { fetch });

        expect(result).toMatchObject({ imported: ['app-3'], failed: [], released: null });
        expect(await statuses(storage)).toEqual({ 'app-3': 'ready', 'app-2': 'available', 'app-1': 'available' });
        const project = (await getProject(storage, 'game'))!;
        expect(project.versions.find((v) => v.id === 'app-2')).toMatchObject({ label: '2.0', title: 'Ball Game' });
        expect(project.lastSyncAt).not.toBeNull();
    });

    it("doesn't release without auto-release", async () => {
        const storage = await setup();
        await syncProject(storage, fakeClient([v3, v2, v1]), 'game', hosting());

        expect((await getProject(storage, 'game'))!.liveVersion).toBeNull();
    });

    it('releases the newest app with auto-release', async () => {
        const storage = await setup({ autoRelease: true });

        const result = await syncProject(storage, fakeClient([v3, v2, v1]), 'game', hosting());

        expect(result.released).toBe('app-3');
        expect((await getProject(storage, 'game'))!.liveVersion).toBe('app-3');
    });

    it('follows the primary app, so an older primary is a rollback', async () => {
        const storage = await setup({ autoRelease: true, liveVersion: 'app-3' });

        await syncProject(storage, fakeClient([v3, v2, v1], v1), 'game', hosting());

        expect(await statuses(storage)).toMatchObject({ 'app-3': 'ready', 'app-1': 'ready', 'app-2': 'available' });
        expect((await getProject(storage, 'game'))!.liveVersion).toBe('app-1');
    });

    it("doesn't change a pinned project's live version", async () => {
        const storage = await setup({ autoRelease: true, pinned: true, liveVersion: 'app-1' });

        await syncProject(storage, fakeClient([v3, v2, v1]), 'game', hosting());

        expect((await getProject(storage, 'game'))!.liveVersion).toBe('app-1');
        expect(await statuses(storage)).toMatchObject({ 'app-3': 'ready' });
    });

    it('skips builds that are still running', async () => {
        const storage = await setup({ autoRelease: true });
        const running = publishedApp(4, 'ddd', { completed_at: null, created_at: '2026-10-04T00:00:00Z' });

        await syncProject(storage, fakeClient([running, v3]), 'game', hosting());

        expect(await statuses(storage)).toEqual({ 'app-3': 'ready' });
    });

    it('keeps preview tokens when a version is imported', async () => {
        const storage = await setup();
        await syncProject(storage, fakeClient([v2]), 'game', hosting());
        const token = (await getProject(storage, 'game'))!.versions.find((v) => v.id === 'app-2')!.previewToken;

        // v3 is published; v2 is no longer the newest, but stays imported with the same token
        await syncProject(storage, fakeClient([v3, v2]), 'game', hosting());

        expect((await getProject(storage, 'game'))!.versions.find((v) => v.id === 'app-2')!.previewToken).toBe(token);
    });

    it('marks failed imports, and retries them with backoff', async () => {
        const storage = await setup();
        const now = new Date('2026-10-21T00:00:00Z');
        const broken = fakeHosting({ ccc: buildFiles({ '100.json': undefined }) });

        const failed = await syncProject(storage, fakeClient([v3]), 'game', { ...broken, now });
        expect(failed.failed).toEqual(['app-3']);
        const version = (await getProject(storage, 'game'))!.versions[0]!;
        expect(version).toMatchObject({ status: 'failed', attempts: 1 });
        expect(version.error).toMatch(/failed to download 100.json/);

        // Not retried straight away…
        const soon = await syncProject(storage, fakeClient([v3]), 'game', {
            ...hosting(),
            now: new Date(Date.now() + 60_000)
        });
        expect(soon.imported).toEqual([]);

        // …but after the backoff
        const later = await syncProject(storage, fakeClient([v3]), 'game', {
            ...hosting(),
            now: new Date(Date.now() + 6 * 60_000)
        });
        expect(later.imported).toEqual(['app-3']);
        expect(await statuses(storage)).toEqual({ 'app-3': 'ready' });
    });

    it('gives up after 5 attempts', async () => {
        const storage = await setup();
        const project = (await getProject(storage, 'game'))!;
        project.versions = [
            {
                id: 'app-3',
                label: null,
                releaseNotes: null,
                origin: { type: 'app', appId: 3 },
                status: 'failed',
                createdAt: '',
                previewToken: 't',
                attempts: 5,
                lastAttemptAt: '2020-01-01T00:00:00Z'
            }
        ];
        await saveProject(storage, project);

        const result = await syncProject(storage, fakeClient([v3]), 'game', hosting());

        expect(result.imported).toEqual([]);
    });

    it('retries imports interrupted by a restart', async () => {
        const storage = await setup();
        const project = (await getProject(storage, 'game'))!;
        project.versions = [
            {
                id: 'app-3',
                label: null,
                releaseNotes: null,
                origin: { type: 'app', appId: 3 },
                status: 'importing',
                createdAt: '',
                previewToken: 't',
                attempts: 1,
                lastAttemptAt: new Date(Date.now() - 60 * 60_000).toISOString()
            }
        ];
        await saveProject(storage, project);

        const result = await syncProject(storage, fakeClient([v3]), 'game', hosting());

        expect(result.imported).toEqual(['app-3']);
    });

    it("doesn't overwrite changes saved during an import", async () => {
        const storage = await setup({ autoRelease: true });
        const { fetch } = hosting();
        let edited = false;
        const editingFetch = (async (input: string | URL, init?: RequestInit) => {
            // While the build downloads, someone takes the project offline in the admin
            if (!edited) {
                edited = true;
                const project = (await getProject(storage, 'game'))!;
                await saveProject(storage, { ...project, unpublished: true, title: 'Renamed' });
            }
            return fetch(input, init);
        }) as typeof fetch;

        await syncProject(storage, fakeClient([v3]), 'game', { fetch: editingFetch });

        const project = (await getProject(storage, 'game'))!;
        expect(project).toMatchObject({ unpublished: true, title: 'Renamed', liveVersion: 'app-3' });
    });

    it('reports API errors, and still records the attempt', async () => {
        const storage = await setup();
        const client = {
            listApps: async () => {
                throw new PlayCanvasApiError(
                    'PlayCanvas API GET /projects/1625489/apps: 401 the API token is invalid or revoked',
                    401
                );
            },
            getPrimaryApp: async () => null
        } as unknown as PlayCanvasClient;

        const result = await syncProject(storage, client, 'game');

        expect(result.error).toMatch(/token is invalid/);
        expect((await getProject(storage, 'game'))!.lastSyncAt).not.toBeNull();
    });
});

describe('syncProjectOnce', () => {
    it('shares a running sync between callers', async () => {
        const storage = await setup();
        const client = fakeClient([v3]);

        const [a, b] = await Promise.all([
            syncProjectOnce(storage, client, 'game', hosting()),
            syncProjectOnce(storage, client, 'game', hosting())
        ]);

        expect(a).toBe(b);
        expect(client.listApps).toHaveBeenCalledOnce();
    });
});

describe('syncAllProjects', () => {
    it('syncs PlayCanvas projects, skipping ones made from zips', async () => {
        const storage = await setup();
        await saveProject(storage, createProjectRecord('from-zip', 'From Zip'));

        const results = await syncAllProjects(storage, fakeClient([v3]), hosting());

        expect(results.map((r) => r.slug)).toEqual(['game']);
    });
});

describe('isSyncDue', () => {
    it('is due without a previous sync, or once the interval has passed', () => {
        const project = createProjectRecord('game', 'Game', { projectId: 1 });
        const now = new Date('2026-10-21T00:10:00Z');

        expect(isSyncDue(project, 300, now)).toBe(true);
        expect(isSyncDue({ ...project, lastSyncAt: '2026-10-21T00:08:00Z' }, 300, now)).toBe(false);
        expect(isSyncDue({ ...project, lastSyncAt: '2026-10-21T00:04:00Z' }, 300, now)).toBe(true);
        expect(isSyncDue(createProjectRecord('zip', 'Zip'), 300, now)).toBe(false);
    });
});
