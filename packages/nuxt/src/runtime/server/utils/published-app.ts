import type { EditorConfig } from '@treygrr/playcanvas-vue/editor/manifest';
import type { Storage } from 'unstorage';

import type { UnpackLimits } from '../unpack';
import { UnpackError, defaultLimits, isSafeEntryName, parseConfig, prepareExport, slugify } from '../unpack';

import type { PlayCanvasApp, PlayCanvasClient } from './playcanvas-api';
import type { ProjectRecord, VersionRecord } from './records';
import { createProjectRecord } from './records';
import { getProject, readyVersion, saveProject, writeVersionFiles } from './store';

/** Published builds are only ever fetched from PlayCanvas hosting */
const BUILD_HOST = 'playcanv.as';

export type ImportOptions = {
    fetch?: typeof fetch;
    limits?: UnpackLimits;
    /** How many files to download at once */
    concurrency?: number;
};

/** The version id of a published app */
export const appVersionId = (app: Pick<PlayCanvasApp, 'id'>) => `app-${app.id}`;

/**
 * Finds the folder a published app's build is served from. An app's `url` is a page that embeds the
 * build in an iframe, eg `https://playcanv.as/b/abc123` embeds `https://playcanv.as/apps/abc123/index.html`.
 */
export async function resolveBuildUrl(app: PlayCanvasApp, fetchFn: typeof fetch = globalThis.fetch): Promise<URL> {
    const page = new URL(app.url);
    if (page.protocol !== 'https:' || page.hostname !== BUILD_HOST) {
        throw new Error(`Published app ${app.id} isn't hosted on ${BUILD_HOST}: ${app.url}`);
    }

    const response = await fetchFn(page);
    if (!response.ok) throw new Error(`Failed to load ${page}: ${response.status}`);
    const html = await response.text();

    const src = html.match(/<iframe[^>]*\ssrc="([^"]+)"/i)?.[1];
    const fallback = `/apps/${page.pathname.split('/').filter(Boolean).pop()}/index.html`;
    const build = new URL(src ?? fallback, page);

    if (build.protocol !== 'https:' || build.hostname !== BUILD_HOST || !build.pathname.startsWith('/apps/')) {
        throw new Error(`Unexpected build location for published app ${app.id}: ${build}`);
    }

    return new URL('./', build);
}

/**
 * The files a build needs, from its config: scenes, and every asset file and variant. Paths are returned
 * as listed (URL encoded); URLs that aren't plain relative paths are skipped.
 */
export function filesInConfig(config: EditorConfig): string[] {
    const urls = new Set<string>();
    const add = (url: unknown) => {
        if (typeof url !== 'string' || !url) return;
        // Absolute and data URLs are loaded from elsewhere, not part of the build
        if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(url)) return;
        urls.add(url.split(/[?#]/)[0]!);
    };

    for (const scene of config.scenes) add(scene.url);

    for (const asset of Object.values(config.assets)) {
        const file = asset.file as { url?: string; variants?: Record<string, { url?: string } | null> } | null;
        add(file?.url);
        for (const variant of Object.values(file?.variants ?? {})) add(variant?.url);
    }

    return [...urls];
}

/** Decodes a URL path, or returns null if it's malformed */
const safeDecode = (path: string) => {
    try {
        return decodeURIComponent(path);
    } catch {
        return null;
    }
};

/** Runs `task` over `items`, `concurrency` at a time */
async function mapLimit<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await task(items[index]!);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    return results;
}

/**
 * Downloads a published app's build and stores it as a version of `project`, checking it the same
 * way as zips. The record is updated but not saved, and the version doesn't go live.
 *
 * @returns The new version, or the existing one if the app was already imported.
 */
export async function importPublishedApp(
    storage: Storage,
    project: ProjectRecord,
    app: PlayCanvasApp,
    { fetch: fetchFn = globalThis.fetch, limits = defaultLimits, concurrency = 6 }: ImportOptions = {}
): Promise<VersionRecord> {
    const id = appVersionId(app);
    const existing = project.versions.find((version) => version.id === id);
    if (existing?.status === 'ready') return existing;

    const name = `${app.name} (app ${app.id})`;
    const base = await resolveBuildUrl(app, fetchFn);

    let totalSize = 0;
    const download = async (path: string, init?: RequestInit): Promise<Uint8Array> => {
        const url = new URL(path, base);
        // Only files inside this build's folder
        if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
            throw new UnpackError(name, `refusing to download ${url}, outside the build`);
        }

        let response: Response | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                response = await fetchFn(url, { ...init, signal: AbortSignal.timeout(60_000) });
                if (response.ok || response.status < 500) break;
            } catch (error) {
                if (attempt === 2)
                    throw new UnpackError(name, `failed to download ${path}: ${(error as Error).message}`);
            }
        }
        if (!response?.ok) throw new UnpackError(name, `failed to download ${path}: ${response?.status}`);

        const data = new Uint8Array(await response.arrayBuffer());
        totalSize += data.length;
        if (totalSize > limits.maxSize) throw new UnpackError(name, `is larger than ${limits.maxSize} bytes`);
        return data;
    };

    const entries: Record<string, Uint8Array> = {};

    entries['config.json'] = await download('config.json');
    const config = parseConfig(entries['config.json'], name);

    // The launch page has the title, and names the engine build, whose header has its version
    entries['index.html'] = await download('index.html');
    const engineFile = new TextDecoder()
        .decode(entries['index.html'])
        .match(/<script src="(playcanvas[\w.-]*\.js)"/)?.[1];
    if (engineFile) {
        entries[engineFile] = await download(engineFile, { headers: { range: 'bytes=0-511' } }).catch(
            () => new Uint8Array()
        );
    }

    const paths = filesInConfig(config).filter((path) => {
        const decoded = safeDecode(path);
        return decoded !== null && isSafeEntryName(decoded) && !(decoded in entries);
    });
    if (paths.length + Object.keys(entries).length > limits.maxFiles) {
        throw new UnpackError(name, `more than ${limits.maxFiles} files`);
    }

    const downloaded = await mapLimit(paths, concurrency, async (path) => [path, await download(path)] as const);
    for (const [path, data] of downloaded) entries[safeDecode(path)!] = data;

    const unpacked = prepareExport(entries, name, id);
    const size = await writeVersionFiles(storage, project.slug, id, unpacked.files);
    const version = readyVersion(unpacked, { type: 'app', appId: app.id }, size, {
        id,
        label: app.version,
        releaseNotes: app.release_notes,
        createdAt: app.completed_at ?? app.created_at
    });

    project.versions = [...project.versions.filter((v) => v.id !== id), version];
    return version;
}

export type AddProjectOptions = {
    /** The URL slug. Defaults to one made from the project's primary app name */
    slug?: string;
    /** Slugs taken by projects from repo zips */
    reservedSlugs?: string[];
};

/**
 * Starts tracking a PlayCanvas project. Its title comes from its primary (or newest) published app,
 * as the API has no way to read a project's name.
 */
export async function addPlayCanvasProject(
    storage: Storage,
    client: PlayCanvasClient,
    projectId: number,
    { slug, reservedSlugs = [] }: AddProjectOptions = {}
): Promise<ProjectRecord> {
    // Fails with a clear error for an unknown project or a token without access
    const [primary, apps] = await Promise.all([client.getPrimaryApp(projectId), client.listApps(projectId)]);
    const title = primary?.name ?? apps[0]?.name ?? `PlayCanvas project ${projectId}`;

    const finalSlug = slugify(slug ?? title);
    if (!finalSlug) throw new Error('The slug needs at least one letter or digit');
    if (reservedSlugs.includes(finalSlug) || (await getProject(storage, finalSlug))) {
        throw new Error(`The slug "${finalSlug}" is already used by another project`);
    }

    const project = createProjectRecord(finalSlug, title, { projectId });
    await saveProject(storage, project);
    return project;
}
