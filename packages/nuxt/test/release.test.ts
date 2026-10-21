import { strToU8, zipSync } from 'fflate';
import { createStorage } from 'unstorage';
import { describe, it, expect, vi } from 'vitest';

import { buildVersionId, finishBranchBuild, startBranchBuild } from '../src/runtime/server/utils/branch-build.ts';
import type { PlayCanvasClient, PlayCanvasJob } from '../src/runtime/server/utils/playcanvas-api.ts';
import { PlayCanvasApiError } from '../src/runtime/server/utils/playcanvas-api.ts';
import type { ProjectRecord, VersionRecord } from '../src/runtime/server/utils/records.ts';
import {
    applyDueRelease,
    createProjectRecord,
    dueRelease,
    resolveVersion
} from '../src/runtime/server/utils/records.ts';
import { getProject, readVersionFile, saveProject, updateProject } from '../src/runtime/server/utils/store.ts';
import { syncProject } from '../src/runtime/server/utils/sync.ts';

const version = (id: string, status: VersionRecord['status'] = 'ready'): VersionRecord => ({
    id,
    label: id,
    releaseNotes: null,
    origin: { type: 'app', appId: 1 },
    status,
    createdAt: '2026-10-01T00:00:00.000Z',
    previewToken: `token-${id}`
});

describe('scheduled release', () => {
    const now = new Date('2026-10-21T12:00:00.000Z');
    const project = (overrides: Partial<ProjectRecord> = {}): ProjectRecord => ({
        ...createProjectRecord('game', 'Game'),
        versions: [version('v1'), version('v2'), version('v3', 'importing')],
        liveVersion: 'v1',
        ...overrides
    });

    it('shows the scheduled version from its time', () => {
        const scheduled = project({ scheduledRelease: { versionId: 'v2', at: '2026-10-21T11:59:00.000Z' } });
        expect(dueRelease(scheduled, now)).toBe('v2');
        expect(resolveVersion(scheduled, { now })?.id).toBe('v2');
    });

    it("doesn't show it early", () => {
        const scheduled = project({ scheduledRelease: { versionId: 'v2', at: '2026-10-21T12:01:00.000Z' } });
        expect(dueRelease(scheduled, now)).toBeNull();
        expect(resolveVersion(scheduled, { now })?.id).toBe('v1');
    });

    it("doesn't show a version that isn't ready", () => {
        const scheduled = project({ scheduledRelease: { versionId: 'v3', at: '2026-10-21T11:00:00.000Z' } });
        expect(resolveVersion(scheduled, { now })?.id).toBe('v1');
    });

    it('saves a due release, pinning it under auto-release', () => {
        const scheduled = project({
            autoRelease: true,
            scheduledRelease: { versionId: 'v2', at: '2026-10-21T11:00:00.000Z' }
        });

        expect(applyDueRelease(scheduled, now)).toBe(true);
        expect(scheduled).toMatchObject({ liveVersion: 'v2', scheduledRelease: null, pinned: true });
        expect(applyDueRelease(scheduled, now)).toBe(false);
    });

    it('is saved by a sync', async () => {
        const storage = createStorage();
        await saveProject(storage, {
            ...project({ scheduledRelease: { versionId: 'v2', at: '2026-10-21T11:00:00.000Z' } }),
            playcanvas: { projectId: 1 }
        });
        const client = { listApps: async () => [], getPrimaryApp: async () => null } as unknown as PlayCanvasClient;

        await syncProject(storage, client, 'game', { now });

        expect(await getProject(storage, 'game')).toMatchObject({ liveVersion: 'v2', scheduledRelease: null });
    });
});

describe('branch builds', () => {
    const exportZip = zipSync({
        'index.html': strToU8('<title>Ball Game</title>'),
        'config.json': strToU8(
            JSON.stringify({ application_properties: {}, scenes: [{ name: 'Main', url: '1.json' }], assets: {} })
        ),
        '1.json': strToU8('{"entities":{}}')
    });
    const archive = 'https://playcanvas.com/archives/abc/Ball%20Game.zip';

    /** A fake API whose build job finishes after `runningPolls` checks */
    const fakeBuilds = ({
        runningPolls = 1,
        status = 'complete' as PlayCanvasJob['status'],
        downloadUrl = archive
    } = {}) => {
        let polls = 0;
        const client = {
            listBranches: vi.fn(async () => [{ id: 'b-main', name: 'main', closed: false }]),
            listScenes: vi.fn(async () => [{ id: 11 }, { id: 12 }]),
            downloadApp: vi.fn(async () => ({ id: 77, status: 'running', messages: [], data: {} })),
            getJob: vi.fn(async () => ({
                id: 77,
                status: polls++ < runningPolls ? 'running' : status,
                messages: status === 'error' ? ['Scene 12 is broken'] : [],
                data: { download_url: downloadUrl }
            }))
        } as unknown as PlayCanvasClient;
        const fetch = vi.fn(async (input: string | URL) =>
            String(input) === archive ? new Response(exportZip as BodyInit) : new Response('', { status: 404 })
        ) as unknown as typeof globalThis.fetch;
        return { client, fetch };
    };

    const setup = async () => {
        const storage = createStorage();
        await saveProject(storage, createProjectRecord('game', 'Ball Game', { projectId: 1625489 }));
        return storage;
    };

    it('builds every scene of a branch, and imports the zip as a preview version', async () => {
        const storage = await setup();
        const { client, fetch } = fakeBuilds();

        const started = await startBranchBuild(storage, client, 'game', { branchId: 'b-main' });
        expect(started).toMatchObject({ id: buildVersionId(77), status: 'importing', label: 'main branch' });
        expect(client.downloadApp).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 1625489, branchId: 'b-main', scenes: [11, 12] })
        );

        const finished = await finishBranchBuild(storage, client, 'game', started.id, { fetch, pollMs: 1 });

        expect(finished).toMatchObject({
            id: 'branch-77',
            status: 'ready',
            label: 'main branch',
            origin: { type: 'branch', jobId: 77 }
        });
        // The preview token from the start is kept
        expect(finished!.previewToken).toBe(started.previewToken);
        expect(await readVersionFile(storage, 'game', 'branch-77', 'config.json')).not.toBeNull();
        // Branch builds never go live by themselves
        expect((await getProject(storage, 'game'))!.liveVersion).toBeNull();
    });

    it('marks failed builds', async () => {
        const storage = await setup();
        const { client, fetch } = fakeBuilds({ status: 'error' });
        const { id } = await startBranchBuild(storage, client, 'game', { branchId: 'b-main' });

        const finished = await finishBranchBuild(storage, client, 'game', id, { fetch, pollMs: 1 });

        expect(finished).toMatchObject({ status: 'failed', error: 'The build failed: Scene 12 is broken' });
    });

    it('only downloads builds from playcanvas.com', async () => {
        const storage = await setup();
        const { client, fetch } = fakeBuilds({ downloadUrl: 'https://evil.example.com/build.zip' });
        const { id } = await startBranchBuild(storage, client, 'game', { branchId: 'b-main' });

        const finished = await finishBranchBuild(storage, client, 'game', id, { fetch, pollMs: 1 });

        expect(finished).toMatchObject({ status: 'failed' });
        expect(finished!.error).toMatch(/Unexpected build download location/);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('leaves slow builds for a later sync to finish', async () => {
        const storage = await setup();
        // Running for the first check, and the first sync's check
        const { client, fetch } = fakeBuilds({ runningPolls: 2 });
        const { id } = await startBranchBuild(storage, client, 'game', { branchId: 'b-main' });

        expect(await finishBranchBuild(storage, client, 'game', id, { fetch, waitMs: 0 })).toBeNull();
        expect((await getProject(storage, 'game'))!.versions[0]!.status).toBe('importing');

        // Pretend a restart happened a while ago, then sync
        await updateProject(storage, 'game', (p) => {
            p.versions[0]!.lastAttemptAt = new Date(Date.now() - 5 * 60_000).toISOString();
        });
        const syncClient = {
            ...client,
            listApps: async () => [],
            getPrimaryApp: async () => null
        } as unknown as PlayCanvasClient;
        await syncProject(storage, syncClient, 'game', { fetch }); // still running
        const result = await syncProject(storage, syncClient, 'game', { fetch }); // now done

        expect(result.imported).toEqual(['branch-77']);
        expect((await getProject(storage, 'game'))!.versions[0]!.status).toBe('ready');
    });

    it('explains rate limiting', async () => {
        const storage = await setup();
        const { client } = fakeBuilds();
        vi.mocked(client.downloadApp).mockRejectedValue(new PlayCanvasApiError('rate limited', 429, 30));

        await expect(startBranchBuild(storage, client, 'game', { branchId: 'b-main' })).rejects.toMatchObject({
            status: 429,
            retryAfterSeconds: 30
        });
        expect((await getProject(storage, 'game'))!.versions).toEqual([]);
    });

    it('rejects unknown branches', async () => {
        const storage = await setup();
        const { client } = fakeBuilds();

        await expect(startBranchBuild(storage, client, 'game', { branchId: 'nope' })).rejects.toThrow(/no branch nope/);
        expect(client.downloadApp).not.toHaveBeenCalled();
    });
});
