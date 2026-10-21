import type { EditorConfig } from '@treygrr/playcanvas-vue/editor/manifest';
import { strFromU8, unzipSync } from 'fflate';

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
export const isSafeEntryName = (name: string) =>
    name.length > 0 &&
    !name.includes('\0') &&
    !name.includes('\\') &&
    !name.startsWith('/') &&
    !/^[a-z]:/i.test(name) &&
    !name.split('/').some((segment) => segment === '..');

/**
 * A short hash of `data`, used as a version id. Uses Web Crypto, so it runs on any server runtime.
 */
export async function contentHash(data: Uint8Array): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
    return [...new Uint8Array(digest).slice(0, 6)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Path helpers for zip entry names, which always use forward slashes
const dirname = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.');
const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);

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
export async function unpackExport(
    zip: Uint8Array,
    zipName: string,
    limits: UnpackLimits = defaultLimits
): Promise<UnpackedExport> {
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

    return prepareExport(entries, zipName, await contentHash(zip));
}

/**
 * Parses and checks the `config.json` of an export.
 *
 * @param data The file contents.
 * @param name The export's name, for error messages.
 */
export function parseConfig(data: Uint8Array, name: string): EditorConfig {
    let config: EditorConfig;
    try {
        config = JSON.parse(strFromU8(data));
    } catch {
        throw new UnpackError(name, 'config.json is not valid JSON');
    }
    if (!config || typeof config !== 'object' || !Array.isArray(config.scenes) || typeof config.assets !== 'object') {
        throw new UnpackError(name, 'config.json is not a PlayCanvas project config');
    }
    if (config.scenes.length === 0) throw new UnpackError(name, 'the project has no scenes');
    return config;
}

/**
 * Checks the files of an export, and picks out the ones to serve: everything but the launch page.
 * The title and engine version are read from the launch page, as text.
 *
 * @param entries The export's files, by path. They can be inside a folder.
 * @param name The export's name, for error messages and as a fallback title.
 * @param version The version id.
 */
export function prepareExport(entries: Record<string, Uint8Array>, name: string, version: string): UnpackedExport {
    const zipName = name;

    // Exports are usually flat, but re-zipped ones can be inside a folder
    const configPath = Object.keys(entries)
        .filter((name) => basename(name) === 'config.json')
        .sort((a, b) => a.split('/').length - b.split('/').length)[0];
    if (!configPath) throw new UnpackError(zipName, 'no config.json found. Is this an Editor "Download" build?');
    const root = dirname(configPath) === '.' ? '' : `${dirname(configPath)}/`;

    const config = parseConfig(entries[configPath]!, zipName);

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

    const engineFile = Object.keys(entries).find((name) => /^playcanvas[\w.-]*\.js$/.test(basename(name)));
    const engineHeader = engineFile ? strFromU8(entries[engineFile]!.subarray(0, 512)) : '';
    const engineVersion = engineHeader.match(/PlayCanvas Engine v(\d+\.\d+\.\d+)/)?.[1] ?? null;

    return { version, title, engineVersion, config, files };
}
