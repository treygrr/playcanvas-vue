import { strToU8, zipSync } from 'fflate';
import { createStorage } from 'unstorage';
import { describe, it, expect } from 'vitest';

import type { ProjectRecord, VersionRecord } from '../src/runtime/server/utils/records.ts';
import { createProjectRecord, resolveVersion, timingSafeEqual } from '../src/runtime/server/utils/records.ts';
import {
    deleteProject,
    getProject,
    importZip,
    listProjects,
    readVersionFile,
    saveProject,
    toPublicProject
} from '../src/runtime/server/utils/store.ts';
import { safePathSegments } from '../src/runtime/server/utils/paths.ts';

const exportZip = (extra: Record<string, Uint8Array> = {}) =>
    zipSync({
        'index.html': strToU8('<title>Ball Game</title>'),
        'config.json': strToU8(
            JSON.stringify({ application_properties: {}, scenes: [{ name: 'Main', url: '1.json' }], assets: {} })
        ),
        '1.json': strToU8('{"entities":{}}'),
        'files/assets/2/1/ball.png': new Uint8Array([1, 2, 3]),
        ...extra
    });

const version = (id: string, overrides: Partial<VersionRecord> = {}): VersionRecord => ({
    id,
    label: null,
    releaseNotes: null,
    origin: { type: 'app', appId: 1 },
    status: 'ready',
    createdAt: '2026-10-01T00:00:00.000Z',
    previewToken: `token-${id}`,
    ...overrides
});

const project = (overrides: Partial<ProjectRecord> = {}): ProjectRecord => ({
    ...createProjectRecord('game', 'Game'),
    versions: [version('v1'), version('v2'), version('v3', { status: 'importing' })],
    liveVersion: 'v1',
    ...overrides
});

describe('resolveVersion', () => {
    it('shows the live version', () => {
        expect(resolveVersion(project())?.id).toBe('v1');
    });

    it('shows nothing until a version is live', () => {
        expect(resolveVersion(project({ liveVersion: null }))).toBeNull();
    });

    it('only shows ready versions', () => {
        expect(resolveVersion(project({ liveVersion: 'v3' }))).toBeNull();
        // A preview of a version that isn't ready falls back to the live version
        expect(resolveVersion(project(), { preview: 'token-v3' })?.id).toBe('v1');
    });

    it('shows the version a preview token belongs to', () => {
        expect(resolveVersion(project(), { preview: 'token-v2' })?.id).toBe('v2');
        expect(resolveVersion(project(), { preview: 'wrong' })?.id).toBe('v1');
    });

    it('hides unpublished and expired projects, except for previews', () => {
        const now = new Date('2026-10-10T00:00:00.000Z');

        expect(resolveVersion(project({ unpublished: true }))).toBeNull();
        expect(resolveVersion(project({ expiresAt: '2026-10-09T00:00:00.000Z' }), { now })).toBeNull();
        expect(resolveVersion(project({ expiresAt: '2026-10-11T00:00:00.000Z' }), { now })?.id).toBe('v1');
        expect(resolveVersion(project({ unpublished: true }), { preview: 'token-v1' })?.id).toBe('v1');
    });
});

describe('timingSafeEqual', () => {
    it('compares strings', () => {
        expect(timingSafeEqual('abc', 'abc')).toBe(true);
        expect(timingSafeEqual('abc', 'abd')).toBe(false);
        expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    });
});

describe('store', () => {
    it('saves, lists and deletes projects with their files', async () => {
        const storage = createStorage();
        const record = createProjectRecord('ball-game', 'Ball Game');
        const imported = await importZip(storage, record, exportZip(), { type: 'zip', name: 'Ball Game.zip' });
        await saveProject(storage, record);

        expect((await getProject(storage, 'ball-game'))?.versions.map((v) => v.id)).toEqual([imported.id]);
        expect((await listProjects(storage)).map((p) => p.slug)).toEqual(['ball-game']);
        expect(await readVersionFile(storage, 'ball-game', imported.id, 'files/assets/2/1/ball.png')).toEqual(
            new Uint8Array([1, 2, 3])
        );

        await deleteProject(storage, 'ball-game');
        expect(await getProject(storage, 'ball-game')).toBeNull();
        expect(await readVersionFile(storage, 'ball-game', imported.id, 'config.json')).toBeNull();
    });

    it('imports a zip as a ready version, without making it live', async () => {
        const storage = createStorage();
        const record = createProjectRecord('ball-game', 'Ball Game');

        const imported = await importZip(storage, record, exportZip(), { type: 'zip', name: 'Ball Game.zip' });

        expect(imported).toMatchObject({ status: 'ready', title: 'Ball Game', origin: { type: 'zip' } });
        expect(imported.manifest?.scenes).toEqual([{ name: 'Main', url: '1.json' }]);
        expect(imported.previewToken.length).toBeGreaterThan(16);
        expect(record.liveVersion).toBeNull();
        // The launch page isn't stored
        expect(await readVersionFile(storage, 'ball-game', imported.id, 'index.html')).toBeNull();
    });

    it('only deletes the files of the given project', async () => {
        const storage = createStorage();
        const game = createProjectRecord('game', 'Game');
        const gameTwo = createProjectRecord('game-two', 'Game Two');
        const kept = await importZip(storage, gameTwo, exportZip(), { type: 'zip', name: 'b.zip' });
        await importZip(storage, game, exportZip(), { type: 'zip', name: 'a.zip' });

        await deleteProject(storage, 'game');

        // "game" is a prefix of "game-two", whose files must survive
        expect(await readVersionFile(storage, 'game-two', kept.id, 'config.json')).not.toBeNull();
    });

    it('imports the same zip once', async () => {
        const storage = createStorage();
        const record = createProjectRecord('ball-game', 'Ball Game');
        const zip = exportZip();

        const first = await importZip(storage, record, zip, { type: 'zip', name: 'a.zip' });
        const second = await importZip(storage, record, zip, { type: 'zip', name: 'a.zip' });

        expect(second).toBe(first);
        expect(record.versions).toHaveLength(1);
    });

    it('describes a version for <PlayCanvasScene>', async () => {
        const storage = createStorage();
        const record = createProjectRecord('ball-game', 'Ball Game');
        const imported = await importZip(storage, record, exportZip(), { type: 'zip', name: 'a.zip' });

        expect(toPublicProject(record, imported, '/_playcanvas/')).toMatchObject({
            slug: 'ball-game',
            version: imported.id,
            base: `/_playcanvas/files/ball-game/${imported.id}/`
        });
    });
});

describe('safePathSegments', () => {
    it('splits and decodes paths', () => {
        expect(safePathSegments('game/v1/files/My%20Texture.png')).toEqual(['game', 'v1', 'files', 'My Texture.png']);
    });

    it.each([
        ['a parent segment', 'game/v1/../secret'],
        ['an encoded parent segment', 'game/v1/..%2F..%2Fprojects%2Fgame.json'],
        ['an encoded backslash', 'game/v1/..%5Csecret'],
        ['a null byte', 'game/v1/a%00b'],
        ['an empty segment', 'game//v1/file'],
        ['broken encoding', 'game/v1/%E0%A4%A']
    ])('rejects %s', (_label, path) => {
        expect(safePathSegments(path)).toBeNull();
    });
});
