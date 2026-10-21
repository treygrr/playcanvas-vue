import { createEditorManifest } from '@treygrr/playcanvas-vue/editor/manifest';
import type { Storage } from 'unstorage';

import type { PlayCanvasProject } from '../../types';
import type { UnpackLimits, UnpackedExport } from '../unpack';
import { unpackExport } from '../unpack';

import type { ProjectRecord, VersionOrigin, VersionRecord } from './records';
import { createToken } from './records';

/**
 * Storage layout, under the `playcanvas` mount:
 *
 *   projects/<slug>.json                    the project record
 *   files/<slug>/<version>/<path>           a version's files
 */
const projectKey = (slug: string) => `projects:${slug}.json`;
const versionPrefix = (slug: string, version: string) => `files:${slug}:${version}`;
const fileKey = (slug: string, version: string, path: string) => `${versionPrefix(slug, version)}:${path}`;

/**
 * Removes every key under `prefix`. Drivers handle `storage.clear(prefix)` differently, and some
 * clear the whole mount, so keys are removed one by one.
 */
async function removePrefix(storage: Storage, prefix: string): Promise<void> {
    const keys = await storage.getKeys(prefix);
    await Promise.all(keys.map((key) => storage.removeItem(key)));
}

export async function getProject(storage: Storage, slug: string): Promise<ProjectRecord | null> {
    return (await storage.getItem<ProjectRecord>(projectKey(slug))) ?? null;
}

export async function saveProject(storage: Storage, project: ProjectRecord): Promise<void> {
    await storage.setItem(projectKey(project.slug), project);
}

export async function listProjects(storage: Storage): Promise<ProjectRecord[]> {
    const keys = (await storage.getKeys('projects')).filter((key) => key.endsWith('.json'));
    const projects = await Promise.all(keys.map((key) => storage.getItem<ProjectRecord>(key)));
    return projects.filter((project): project is ProjectRecord => Boolean(project));
}

/**
 * Removes a project and all of its files.
 */
export async function deleteProject(storage: Storage, slug: string): Promise<void> {
    await removePrefix(storage, `files:${slug}:`);
    await storage.removeItem(projectKey(slug));
}

export async function readVersionFile(
    storage: Storage,
    slug: string,
    version: string,
    path: string
): Promise<Uint8Array | null> {
    const data = await storage.getItemRaw<Uint8Array | ArrayBuffer | string>(fileKey(slug, version, path));
    if (data == null) return null;
    if (typeof data === 'string') return new TextEncoder().encode(data);
    return data instanceof Uint8Array ? data : new Uint8Array(data);
}

export async function writeVersionFiles(
    storage: Storage,
    slug: string,
    version: string,
    files: Map<string, Uint8Array>
): Promise<number> {
    let size = 0;
    for (const [path, data] of files) {
        await storage.setItemRaw(fileKey(slug, version, path), data);
        size += data.length;
    }
    return size;
}

export async function removeVersionFiles(storage: Storage, slug: string, version: string): Promise<void> {
    await removePrefix(storage, `${versionPrefix(slug, version)}:`);
}

export type ImportedVersionInfo = {
    id?: string;
    label?: string | null;
    releaseNotes?: string | null;
    createdAt?: string;
};

/**
 * Builds a ready version record from unpacked files.
 */
export function readyVersion(
    unpacked: UnpackedExport,
    origin: VersionOrigin,
    size: number,
    info: ImportedVersionInfo = {}
): VersionRecord {
    const now = new Date().toISOString();
    return {
        id: info.id ?? unpacked.version,
        label: info.label ?? null,
        releaseNotes: info.releaseNotes ?? null,
        origin,
        status: 'ready',
        createdAt: info.createdAt ?? now,
        importedAt: now,
        size,
        previewToken: createToken(),
        title: unpacked.title,
        engineVersion: unpacked.engineVersion,
        manifest: createEditorManifest(unpacked.config)
    };
}

/**
 * Validates a zip, stores its files as a new version of `project`, and adds the version to the
 * record. The record is not saved, and the version doesn't go live.
 *
 * @returns The new version, or the existing one if this zip was already imported.
 */
export async function importZip(
    storage: Storage,
    project: ProjectRecord,
    zip: Uint8Array,
    origin: VersionOrigin & { type: 'zip' },
    limits?: UnpackLimits
): Promise<VersionRecord> {
    const unpacked = await unpackExport(zip, origin.name, limits);

    const existing = project.versions.find((version) => version.id === unpacked.version);
    if (existing?.status === 'ready') return existing;

    const size = await writeVersionFiles(storage, project.slug, unpacked.version, unpacked.files);
    const version = readyVersion(unpacked, origin, size);

    project.versions = [...project.versions.filter((v) => v.id !== version.id), version];
    return version;
}

/**
 * What `<PlayCanvasScene>` is given for a version: where its files are and how to load it.
 *
 * @param baseURL The module's base URL, eg `/_playcanvas`.
 */
export function toPublicProject(project: ProjectRecord, version: VersionRecord, baseURL: string): PlayCanvasProject {
    return {
        slug: project.slug,
        title: version.title ?? project.title,
        version: version.id,
        engineVersion: version.engineVersion ?? null,
        base: `${baseURL.replace(/\/$/, '')}/files/${project.slug}/${version.id}/`,
        manifest: version.manifest!
    };
}
