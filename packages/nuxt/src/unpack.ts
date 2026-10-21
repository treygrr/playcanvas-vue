import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

import type { EditorConfig } from '@treygrr/playcanvas-vue/editor/manifest';
import { createEditorManifest } from '@treygrr/playcanvas-vue/editor/manifest';
import { strFromU8, unzipSync } from 'fflate';

import type { PlayCanvasProject } from './runtime/types.ts';

export type UnpackLimits = {
    /** The most bytes a zip may unpack to */
    maxSize: number;
    /** The most files a zip may contain */
    maxFiles: number;
};

export const defaultLimits: UnpackLimits = { maxSize: 512 * 1024 * 1024, maxFiles: 10_000 };

// Files only used by the export's standalone launch page: its engine build and loader
const launchPageFiles =
    /^(index\.html|__start__\.js|__loading__\.js|__settings__\.js|__modules__\.js|playcanvas[\w.-]*\.js)$/;

// Files added by archivers, never part of an export
const archiverJunk = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/;

export class UnpackError extends Error {
    constructor(zipName: string, message: string) {
        super(`Invalid PlayCanvas export "${zipName}": ${message}`);
        this.name = 'UnpackError';
    }
}

/**
 * Turns a file name like "My First Project.zip" into a URL slug like "my-first-project".
 */
export const slugify = (name: string): string =>
    name
        .replace(/\.zip$/i, '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

/**
 * Checks that a zip entry name is a plain relative path, so that it can't be written outside the
 * output folder ("zip slip"): no absolute paths, drive letters, backslashes, or `..` segments.
 */
const isSafeEntryName = (name: string) =>
    name.length > 0 &&
    !name.includes('\0') &&
    !name.includes('\\') &&
    !name.startsWith('/') &&
    !/^[a-z]:/i.test(name) &&
    !name.split('/').some((segment) => segment === '..');

export type UnpackedExport = {
    version: string;
    title: string;
    engineVersion: string | null;
    config: EditorConfig;
    /** The files to serve, keyed by their path relative to the export root */
    files: Map<string, Uint8Array>;
};

/**
 * Validates and unpacks a PlayCanvas Editor "Download" zip in memory. Nothing in the zip is executed:
 * the config is parsed as JSON, and the launch page is only read as text for its title and engine version.
 *
 * @param zip The zip file contents.
 * @param zipName The zip file name, for error messages.
 * @param limits Size limits for the unpacked contents.
 */
export function unpackExport(zip: Uint8Array, zipName: string, limits: UnpackLimits = defaultLimits): UnpackedExport {
    let fileCount = 0;
    let declaredSize = 0;

    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(zip, {
            // Check limits from the zip directory before decompressing anything
            filter: (file) => {
                if (file.name.endsWith('/') || archiverJunk.test(file.name)) return false;
                if (!isSafeEntryName(file.name)) throw new UnpackError(zipName, `unsafe file path "${file.name}"`);
                fileCount++;
                declaredSize += file.originalSize;
                if (fileCount > limits.maxFiles) {
                    throw new UnpackError(zipName, `more than ${limits.maxFiles} files`);
                }
                if (declaredSize > limits.maxSize) {
                    throw new UnpackError(zipName, `unpacks to more than ${limits.maxSize} bytes`);
                }
                return true;
            }
        });
    } catch (error) {
        if (error instanceof UnpackError) throw error;
        throw new UnpackError(zipName, `not a readable zip file (${(error as Error).message})`);
    }

    // The declared sizes can lie, so check what was actually decompressed too
    const actualSize = Object.values(entries).reduce((sum, data) => sum + data.length, 0);
    if (actualSize > limits.maxSize) throw new UnpackError(zipName, `unpacks to more than ${limits.maxSize} bytes`);

    // Exports are usually flat, but re-zipped ones can be inside a folder
    const configPath = Object.keys(entries)
        .filter((name) => posix.basename(name) === 'config.json')
        .sort((a, b) => a.split('/').length - b.split('/').length)[0];
    if (!configPath) throw new UnpackError(zipName, 'no config.json found. Is this an Editor "Download" build?');
    const root = posix.dirname(configPath) === '.' ? '' : `${posix.dirname(configPath)}/`;

    let config: EditorConfig;
    try {
        config = JSON.parse(strFromU8(entries[configPath]!));
    } catch {
        throw new UnpackError(zipName, 'config.json is not valid JSON');
    }
    if (!config || typeof config !== 'object' || !Array.isArray(config.scenes) || typeof config.assets !== 'object') {
        throw new UnpackError(zipName, 'config.json is not a PlayCanvas project config');
    }
    if (config.scenes.length === 0) throw new UnpackError(zipName, 'the project has no scenes');

    const files = new Map<string, Uint8Array>();
    for (const [name, data] of Object.entries(entries)) {
        if (!name.startsWith(root)) continue;
        const path = name.slice(root.length);
        if (!launchPageFiles.test(path)) files.set(path, data);
    }

    for (const scene of config.scenes) {
        if (!files.has(scene.url)) throw new UnpackError(zipName, `the scene file "${scene.url}" is missing`);
    }

    const launchPageData = entries[`${root}index.html`];
    const launchPage = launchPageData ? strFromU8(launchPageData) : '';
    const title = launchPage.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || zipName.replace(/\.zip$/i, '');

    const engineFile = Object.keys(entries).find((name) => /^playcanvas[\w.-]*\.js$/.test(posix.basename(name)));
    const engineHeader = engineFile ? strFromU8(entries[engineFile]!.subarray(0, 512)) : '';
    const engineVersion = engineHeader.match(/PlayCanvas Engine v(\d+\.\d+\.\d+)/)?.[1] ?? null;

    const version = createHash('sha256').update(zip).digest('hex').slice(0, 12);

    return { version, title, engineVersion, config, files };
}

/**
 * Writes an unpacked export to `<outDir>/assets/<slug>/<version>/`, and its project file to
 * `<outDir>/projects/<slug>.json`. Older versions of the project are removed.
 *
 * @param unpacked The unpacked export.
 * @param slug The project slug.
 * @param outDir The folder to write to.
 * @param baseURL The URL `outDir` is served from.
 */
export async function writeExport(
    unpacked: UnpackedExport,
    slug: string,
    outDir: string,
    baseURL: string
): Promise<PlayCanvasProject> {
    const projectDir = resolve(outDir, 'assets', slug);
    const versionDir = resolve(projectDir, unpacked.version);

    await rm(projectDir, { recursive: true, force: true });

    for (const [path, data] of unpacked.files) {
        const target = resolve(versionDir, ...path.split('/'));
        // Defence in depth: the entry names were already checked
        if (relative(versionDir, target).startsWith(`..${sep}`)) throw new Error(`Refusing to write ${target}`);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, data);
    }

    const project: PlayCanvasProject = {
        slug,
        title: unpacked.title,
        version: unpacked.version,
        engineVersion: unpacked.engineVersion,
        base: `${baseURL.replace(/\/$/, '')}/assets/${slug}/${unpacked.version}/`,
        manifest: createEditorManifest(unpacked.config)
    };

    await mkdir(join(outDir, 'projects'), { recursive: true });
    await writeFile(join(outDir, 'projects', `${slug}.json`), JSON.stringify(project, null, 2));

    return project;
}
