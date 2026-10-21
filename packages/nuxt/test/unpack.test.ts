import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { strToU8, zipSync } from 'fflate';
import type { Zippable } from 'fflate';
import { afterEach, describe, it, expect } from 'vitest';

import { UnpackError, slugify, unpackExport } from '../src/runtime/server/unpack.ts';
import { writeExport } from '../src/write-export.ts';

const config = {
    application_properties: { scripts: [1], useKeyboard: true, enableWebGl2: true },
    scenes: [{ name: 'Main Scene', url: '100.json' }],
    assets: {
        '1': { type: 'script', file: { url: '__game-scripts.js' }, data: {} },
        '2': { type: 'texture', file: { url: 'files/assets/2/1/ball.png' }, data: {} }
    }
};

/** The files of a typical Editor "Download" build */
const exportFiles = (): Zippable => ({
    'index.html': strToU8('<html><head><title>Ball Game</title></head></html>'),
    'playcanvas-stable.min.js': strToU8('/** @license PlayCanvas Engine v2.23.3 revision abc */ (function(){})()'),
    '__start__.js': strToU8('// launch page loader'),
    '__settings__.js': strToU8('window.SCENE_PATH = "100.json";'),
    '__modules__.js': strToU8('window.PRELOAD_MODULES = [];'),
    '__loading__.js': strToU8('// loading screen'),
    '__game-scripts.js': strToU8('var Spin = pc.createScript("spin");'),
    'config.json': strToU8(JSON.stringify(config)),
    '100.json': strToU8(JSON.stringify({ name: 'Main Scene', entities: {} })),
    files: { assets: { '2': { '1': { 'ball.png': new Uint8Array([137, 80, 78, 71]) } } } }
});

const zip = (files: Zippable) => zipSync(files);

const dirs: string[] = [];
afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('slugify', () => {
    it('makes URL slugs from zip names', () => {
        expect(slugify('My First Project.zip')).toBe('my-first-project');
        expect(slugify('Über Démo (v2).ZIP')).toBe('uber-demo-v2');
        expect(slugify('___.zip')).toBe('');
    });
});

describe('unpackExport', () => {
    it('keeps the project files and drops the launch page', async () => {
        const unpacked = await unpackExport(zip(exportFiles()), 'game.zip');

        expect([...unpacked.files.keys()].sort()).toEqual([
            '100.json',
            '__game-scripts.js',
            'config.json',
            'files/assets/2/1/ball.png'
        ]);
        expect(unpacked.title).toBe('Ball Game');
        expect(unpacked.engineVersion).toBe('2.23.3');
        expect(unpacked.version).toMatch(/^[0-9a-f]{12}$/);
    });

    it('gives the same zip the same version', async () => {
        const data = zip(exportFiles());
        expect((await unpackExport(data, 'a.zip')).version).toBe((await unpackExport(data, 'b.zip')).version);
    });

    it('finds an export inside a folder', async () => {
        const unpacked = await unpackExport(zip({ 'Ball Game': exportFiles() }), 'game.zip');
        expect(unpacked.files.has('config.json')).toBe(true);
        expect(unpacked.files.has('100.json')).toBe(true);
    });

    it('ignores files added by archivers', async () => {
        const unpacked = await unpackExport(
            zip({ ...exportFiles(), __MACOSX: { '._config.json': strToU8('x') }, '.DS_Store': strToU8('x') }),
            'game.zip'
        );
        expect([...unpacked.files.keys()].some((path) => path.includes('MACOSX') || path.includes('DS_Store'))).toBe(
            false
        );
    });

    it.each([
        ['a parent directory path', '../evil.js'],
        ['a nested parent directory path', 'files/../../evil.js'],
        ['an absolute path', '/etc/evil'],
        ['a Windows path', 'files\\evil.js'],
        ['a drive letter', 'C:/evil.js']
    ])('rejects %s', async (_label, name) => {
        await expect(unpackExport(zip({ ...exportFiles(), [name]: strToU8('x') }), 'evil.zip')).rejects.toThrow(
            /unsafe file path/
        );
    });

    it('rejects zips that are too large or have too many files', async () => {
        const data = zip({ ...exportFiles(), 'big.bin': new Uint8Array(2048) });

        await expect(unpackExport(data, 'big.zip', { maxSize: 1024, maxFiles: 100 })).rejects.toThrow(
            /more than 1024 bytes/
        );
        await expect(unpackExport(data, 'big.zip', { maxSize: 1e9, maxFiles: 3 })).rejects.toThrow(/more than 3 files/);
    });

    it('rejects things that are not Editor exports', async () => {
        await expect(unpackExport(strToU8('not a zip'), 'x.zip')).rejects.toThrow(/not a readable zip/);
        await expect(unpackExport(zip({ 'readme.txt': strToU8('hi') }), 'x.zip')).rejects.toThrow(/no config.json/);
        await expect(unpackExport(zip({ 'config.json': strToU8('{oops') }), 'x.zip')).rejects.toThrow(/not valid JSON/);

        const { '100.json': _scene, ...withoutScene } = exportFiles() as Record<string, Uint8Array>;
        await expect(unpackExport(zip(withoutScene), 'x.zip')).rejects.toThrow(/scene file "100.json" is missing/);
    });

    it('throws UnpackErrors naming the zip', async () => {
        await expect(unpackExport(strToU8('nope'), 'Broken.zip')).rejects.toThrow(UnpackError);
        await expect(unpackExport(strToU8('nope'), 'Broken.zip')).rejects.toThrow(/"Broken.zip"/);
    });
});

describe('writeExport', () => {
    it('writes the files to a versioned folder, and the project file', async () => {
        const outDir = await mkdtemp(join(tmpdir(), 'playcanvas-'));
        dirs.push(outDir);
        const unpacked = await unpackExport(zip(exportFiles()), 'game.zip');

        const project = await writeExport(unpacked, 'ball-game', outDir, '/_playcanvas/');

        expect(project.base).toBe(`/_playcanvas/assets/ball-game/${unpacked.version}/`);
        expect(project.manifest.scriptsOrder).toEqual([1]);
        expect(project.manifest.input.keyboard).toBe(true);

        const versionDir = join(outDir, 'assets', 'ball-game', unpacked.version);
        expect(await readFile(join(versionDir, 'files/assets/2/1/ball.png'))).toEqual(Buffer.from([137, 80, 78, 71]));
        expect(JSON.parse(await readFile(join(outDir, 'projects', 'ball-game.json'), 'utf8'))).toEqual(project);
    });

    it('removes the previous version', async () => {
        const outDir = await mkdtemp(join(tmpdir(), 'playcanvas-'));
        dirs.push(outDir);
        const first = await unpackExport(zip(exportFiles()), 'game.zip');
        const second = await unpackExport(zip({ ...exportFiles(), 'extra.txt': strToU8('new') }), 'game.zip');

        await writeExport(first, 'ball-game', outDir, '/_playcanvas');
        await writeExport(second, 'ball-game', outDir, '/_playcanvas');

        expect(await readdir(join(outDir, 'assets', 'ball-game'))).toEqual([second.version]);
    });
});
