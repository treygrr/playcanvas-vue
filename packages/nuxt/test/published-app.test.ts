import { createStorage } from 'unstorage';
import { describe, it, expect, vi } from 'vitest';

import type { PlayCanvasApp } from '../src/runtime/server/utils/playcanvas-api.ts';
import { PlayCanvasApiError, createPlayCanvasClient } from '../src/runtime/server/utils/playcanvas-api.ts';
import {
    addPlayCanvasProject,
    filesInConfig,
    importPublishedApp,
    resolveBuildUrl
} from '../src/runtime/server/utils/published-app.ts';
import { createProjectRecord } from '../src/runtime/server/utils/records.ts';
import { getProject, readVersionFile } from '../src/runtime/server/utils/store.ts';

const app: PlayCanvasApp = {
    id: 786530,
    project_id: 1625489,
    owner_id: 1,
    name: 'Ball Game',
    description: null,
    version: '1.2.0',
    release_notes: 'Faster ball',
    thumbnails: null,
    size: 100,
    views: 0,
    completed_at: '2026-10-21T02:51:41.803Z',
    created_at: '2026-10-21T02:51:40.403Z',
    modified_at: '2026-10-21T02:51:41.803Z',
    url: 'https://playcanv.as/b/abc123'
};

const config = {
    application_properties: { scripts: [1] },
    scenes: [{ name: 'Main', url: '100.json' }],
    assets: {
        '1': { type: 'script', file: { url: '__game-scripts.js' }, data: {} },
        '2': {
            type: 'texture',
            file: {
                url: 'files/assets/2/1/My%20Ball.png?t=abc',
                variants: { basis: { url: 'files/assets/2/1/My%20Ball.basis' } }
            }
        },
        '3': { type: 'texture', file: { url: 'https://cdn.example.com/elsewhere.png' } },
        '4': { type: 'texture', file: { url: '../../secret.json' } },
        '5': { type: 'material', file: null, data: {} }
    }
};

/** A fake playcanv.as, serving one published build */
const fakeHosting = (files: Record<string, string | Uint8Array> = {}) => {
    const build: Record<string, string | Uint8Array> = {
        'index.html': '<title>Ball Game</title><script src="playcanvas-stable.min.js"></script>',
        'playcanvas-stable.min.js': '/** PlayCanvas Engine v2.23.3 */',
        'config.json': JSON.stringify(config),
        '100.json': '{"entities":{}}',
        '__game-scripts.js': 'var Spin = pc.createScript("spin");',
        'files/assets/2/1/My Ball.png': new Uint8Array([1, 2, 3]),
        'files/assets/2/1/My Ball.basis': new Uint8Array([4, 5]),
        ...files
    };
    const requested: string[] = [];

    const fetchFn = vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        requested.push(url.href);
        if (url.href === 'https://playcanv.as/b/abc123') {
            return new Response('<iframe allowfullscreen src="https://playcanv.as/apps/abc123/index.html"></iframe>');
        }
        const path = decodeURIComponent(url.pathname.replace('/apps/abc123/', ''));
        const body = url.hostname === 'playcanv.as' ? build[path] : undefined;
        return body === undefined ? new Response('missing', { status: 404 }) : new Response(body as BodyInit);
    });

    return { fetch: fetchFn as unknown as typeof fetch, requested };
};

describe('resolveBuildUrl', () => {
    it('finds the build folder from the app page', async () => {
        const { fetch } = fakeHosting();
        expect(String(await resolveBuildUrl(app, fetch))).toBe('https://playcanv.as/apps/abc123/');
    });

    it('only accepts apps hosted on playcanv.as', async () => {
        await expect(resolveBuildUrl({ ...app, url: 'https://evil.example.com/b/abc' })).rejects.toThrow(
            /isn't hosted on playcanv.as/
        );
    });
});

describe('filesInConfig', () => {
    it('lists scenes, asset files and variants, skipping absolute and data URLs', () => {
        expect(filesInConfig(config as never).sort()).toEqual([
            '../../secret.json',
            '100.json',
            '__game-scripts.js',
            'files/assets/2/1/My%20Ball.basis',
            'files/assets/2/1/My%20Ball.png'
        ]);
    });
});

describe('importPublishedApp', () => {
    it('downloads the build into storage as a version', async () => {
        const storage = createStorage();
        const { fetch, requested } = fakeHosting();
        const project = createProjectRecord('ball-game', 'Ball Game', { projectId: 1625489 });

        const version = await importPublishedApp(storage, project, app, { fetch });

        expect(version).toMatchObject({
            id: 'app-786530',
            status: 'ready',
            label: '1.2.0',
            releaseNotes: 'Faster ball',
            origin: { type: 'app', appId: 786530 },
            title: 'Ball Game',
            engineVersion: '2.23.3',
            createdAt: '2026-10-21T02:51:41.803Z'
        });
        expect(project.versions).toEqual([version]);
        expect(project.liveVersion).toBeNull();

        // Stored under decoded names, as browsers request them
        expect(await readVersionFile(storage, 'ball-game', 'app-786530', 'files/assets/2/1/My Ball.png')).toEqual(
            new Uint8Array([1, 2, 3])
        );
        expect(
            await readVersionFile(storage, 'ball-game', 'app-786530', 'files/assets/2/1/My Ball.basis')
        ).not.toBeNull();
        // The launch page isn't stored
        expect(await readVersionFile(storage, 'ball-game', 'app-786530', 'index.html')).toBeNull();

        // Nothing outside the build was requested
        expect(requested.every((url) => url.startsWith('https://playcanv.as/'))).toBe(true);
        expect(requested.some((url) => url.includes('secret'))).toBe(false);
    });

    it('fails if a file is missing, without adding a version', async () => {
        const storage = createStorage();
        const { fetch } = fakeHosting({ '100.json': undefined as never });
        const project = createProjectRecord('ball-game', 'Ball Game');

        await expect(importPublishedApp(storage, project, app, { fetch })).rejects.toThrow(
            /failed to download 100.json: 404/
        );
        expect(project.versions).toEqual([]);
    });

    it('enforces size limits while downloading', async () => {
        const storage = createStorage();
        const { fetch } = fakeHosting({ 'files/assets/2/1/My Ball.png': new Uint8Array(4096) });
        const project = createProjectRecord('ball-game', 'Ball Game');

        await expect(
            importPublishedApp(storage, project, app, { fetch, limits: { maxSize: 2048, maxFiles: 100 } })
        ).rejects.toThrow(/larger than 2048 bytes/);
    });

    it('imports an app once', async () => {
        const storage = createStorage();
        const { fetch } = fakeHosting();
        const project = createProjectRecord('ball-game', 'Ball Game');

        const first = await importPublishedApp(storage, project, app, { fetch });
        const second = await importPublishedApp(storage, project, app, { fetch });

        expect(second).toBe(first);
    });
});

describe('PlayCanvas client', () => {
    const apiFetch = (routes: Record<string, () => Response>) =>
        vi.fn(async (input: string | URL, init?: RequestInit) => {
            const url = new URL(String(input));
            expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-token');
            const route = routes[url.pathname + url.search] ?? routes[url.pathname];
            return route ? route() : new Response('{}', { status: 404 });
        }) as unknown as typeof fetch;

    it('requires a token', () => {
        expect(() => createPlayCanvasClient({ token: '' })).toThrow(/NUXT_PLAYCANVAS_TOKEN/);
    });

    it('pages through apps, newest first', async () => {
        const older = { ...app, id: 1, created_at: '2026-01-01T00:00:00Z' };
        const page = Array.from({ length: 50 }, (_, i) => ({
            ...app,
            id: 100 + i,
            created_at: '2026-05-01T00:00:00Z'
        }));
        const fetch = apiFetch({
            '/api/projects/1/apps?skip=0&limit=50': () => Response.json({ result: page, pagination: { total: 51 } }),
            '/api/projects/1/apps?skip=50&limit=50': () => Response.json({ result: [older], pagination: { total: 51 } })
        });

        const apps = await createPlayCanvasClient({ token: 'secret-token', fetch }).listApps(1);

        expect(apps).toHaveLength(51);
        expect(apps.at(-1)!.id).toBe(1);
    });

    it('reports a missing primary app as null, and rate limits with a retry time', async () => {
        const fetch = apiFetch({
            '/api/projects/1/app': () => new Response('{}', { status: 404 }),
            '/api/apps/9': () =>
                new Response('{}', { status: 429, headers: { ratelimit: 'limit=5, remaining=0, reset=42' } })
        });
        const client = createPlayCanvasClient({ token: 'secret-token', fetch });

        expect(await client.getPrimaryApp(1)).toBeNull();
        const error = await client.getApp(9).catch((e: PlayCanvasApiError) => e);
        expect(error).toBeInstanceOf(PlayCanvasApiError);
        expect(error).toMatchObject({ status: 429, retryAfterSeconds: 42 });
        expect(String(error)).not.toContain('secret-token');
    });
});

describe('addPlayCanvasProject', () => {
    const client = (apps: PlayCanvasApp[], primary: PlayCanvasApp | null) =>
        ({ listApps: async () => apps, getPrimaryApp: async () => primary }) as never;

    it('tracks a project, named after its primary app', async () => {
        const storage = createStorage();

        const project = await addPlayCanvasProject(storage, client([app], app), 1625489);

        expect(project).toMatchObject({ slug: 'ball-game', title: 'Ball Game', playcanvas: { projectId: 1625489 } });
        expect(await getProject(storage, 'ball-game')).toEqual(project);
    });

    it('accepts a custom slug, and refuses taken ones', async () => {
        const storage = createStorage();

        await addPlayCanvasProject(storage, client([app], null), 1, { slug: 'Showroom!' });
        expect(await getProject(storage, 'showroom')).not.toBeNull();

        await expect(addPlayCanvasProject(storage, client([], null), 2, { slug: 'showroom' })).rejects.toThrow(
            /already used/
        );
        await expect(
            addPlayCanvasProject(storage, client([], null), 3, { slug: 'lobby', reservedSlugs: ['lobby'] })
        ).rejects.toThrow(/already used/);
    });
});
