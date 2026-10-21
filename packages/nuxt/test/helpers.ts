import { vi } from 'vitest';

import type { PlayCanvasApp } from '../src/runtime/server/utils/playcanvas-api.ts';

export const buildConfig = {
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

/** A published app, hosted at https://playcanv.as/b/<code> */
export const publishedApp = (id: number, code: string, overrides: Partial<PlayCanvasApp> = {}): PlayCanvasApp => ({
    id,
    project_id: 1625489,
    owner_id: 1,
    name: 'Ball Game',
    description: null,
    version: null,
    release_notes: null,
    thumbnails: null,
    size: 100,
    views: 0,
    completed_at: '2026-10-21T02:51:41.803Z',
    created_at: '2026-10-21T02:51:40.403Z',
    modified_at: '2026-10-21T02:51:41.803Z',
    url: `https://playcanv.as/b/${code}`,
    ...overrides
});

export type BuildFiles = Record<string, string | Uint8Array | undefined>;

/** The files of a published build, with `overrides` replacing or (when undefined) removing some */
export const buildFiles = (overrides: BuildFiles = {}): BuildFiles => ({
    'index.html': '<title>Ball Game</title><script src="playcanvas-stable.min.js"></script>',
    'playcanvas-stable.min.js': '/** PlayCanvas Engine v2.23.3 */',
    'config.json': JSON.stringify(buildConfig),
    '100.json': '{"entities":{}}',
    '__game-scripts.js': 'var Spin = pc.createScript("spin");',
    'files/assets/2/1/My Ball.png': new Uint8Array([1, 2, 3]),
    'files/assets/2/1/My Ball.basis': new Uint8Array([4, 5]),
    ...overrides
});

/**
 * A fake playcanv.as serving published builds by code: `https://playcanv.as/b/<code>` embeds
 * `https://playcanv.as/apps/<code>/index.html`.
 */
export const fakeHosting = (builds: Record<string, BuildFiles>) => {
    const requested: string[] = [];

    const fetchFn = vi.fn(async (input: string | URL) => {
        const url = new URL(String(input));
        requested.push(url.href);
        if (url.hostname !== 'playcanv.as') return new Response('not found', { status: 404 });

        const page = url.pathname.match(/^\/b\/([^/]+)$/);
        if (page) {
            return new Response(
                `<iframe allowfullscreen src="https://playcanv.as/apps/${page[1]}/index.html"></iframe>`
            );
        }

        const file = url.pathname.match(/^\/apps\/([^/]+)\/(.+)$/);
        const body = file ? builds[file[1]!]?.[decodeURIComponent(file[2]!)] : undefined;
        return body === undefined ? new Response('missing', { status: 404 }) : new Response(body as BodyInit);
    });

    return { fetch: fetchFn as unknown as typeof fetch, requested };
};
