import type { Storage } from 'unstorage';

import type { UnpackLimits } from '../unpack';
import { UnpackError, defaultLimits } from '../unpack';

import type { PlayCanvasClient } from './playcanvas-api';
import type { VersionRecord } from './records';
import { createToken } from './records';
import { getProject, importZip, putVersion, updateProject } from './store';

/** Build archives are only ever downloaded from PlayCanvas */
const ARCHIVE_HOST = 'playcanvas.com';
/** A build still running after this long is treated as failed */
const BUILD_TIMEOUT_MS = 15 * 60_000;

export type StartBuildOptions = {
    branchId: string;
    /** Scene ids, the first being the initial scene. Defaults to every scene, in Editor order */
    sceneIds?: number[];
};

export type FinishBuildOptions = {
    fetch?: typeof fetch;
    limits?: UnpackLimits;
    /** How often to check the build job */
    pollMs?: number;
    /** Give up waiting after this long, leaving the build to be resumed by a later sync */
    waitMs?: number;
};

/** The version id of a branch build */
export const buildVersionId = (jobId: number) => `branch-${jobId}`;

/**
 * Starts building a branch of a tracked PlayCanvas project, and records it as an importing version.
 * Finish it with `finishBranchBuild()`. Builds use the API's strict rate limit, so only start them on request.
 */
export async function startBranchBuild(
    storage: Storage,
    client: PlayCanvasClient,
    slug: string,
    { branchId, sceneIds }: StartBuildOptions
): Promise<VersionRecord> {
    const project = await getProject(storage, slug);
    if (!project?.playcanvas) throw new Error(`"${slug}" isn't a PlayCanvas project`);
    const { projectId } = project.playcanvas;

    const branch = (await client.listBranches(projectId)).find((b) => b.id === branchId);
    if (!branch) throw new Error(`The project has no branch ${branchId}`);

    const scenes = sceneIds?.length ? sceneIds : (await client.listScenes(projectId)).map((scene) => scene.id);
    if (!scenes.length) throw new Error('The project has no scenes to build');

    const job = await client.downloadApp({ projectId, name: `${project.title} (${branch.name})`, scenes, branchId });

    const now = new Date().toISOString();
    const version: VersionRecord = {
        id: buildVersionId(job.id),
        label: `${branch.name} branch`,
        releaseNotes: null,
        origin: { type: 'branch', branchId, jobId: job.id },
        status: 'importing',
        attempts: 1,
        lastAttemptAt: now,
        createdAt: now,
        previewToken: createToken()
    };

    await updateProject(storage, slug, (p) => putVersion(p, version));
    return version;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for a branch build's job, then downloads and imports its zip. Marks the version failed if the
 * job fails or takes too long. If `waitMs` passes first, the version is left importing, for a later
 * sync to resume.
 *
 * @returns The version, or null if it's still building.
 */
export async function finishBranchBuild(
    storage: Storage,
    client: PlayCanvasClient,
    slug: string,
    versionId: string,
    {
        fetch: fetchFn = globalThis.fetch,
        limits = defaultLimits,
        pollMs = 2000,
        waitMs = 5 * 60_000
    }: FinishBuildOptions = {}
): Promise<VersionRecord | null> {
    const project = await getProject(storage, slug);
    const version = project?.versions.find((v) => v.id === versionId);
    if (!project || !version || version.origin.type !== 'branch') return null;
    if (version.status !== 'importing') return version;
    const { jobId } = version.origin;

    const fail = async (message: string) => {
        const updated = await updateProject(storage, slug, (p) => {
            const v = p.versions.find((v) => v.id === versionId);
            if (v) Object.assign(v, { status: 'failed', error: message });
        });
        return updated?.versions.find((v) => v.id === versionId) ?? null;
    };

    try {
        // Wait for the build
        const started = Date.now();
        let job = await client.getJob<{ download_url?: string }>(jobId);
        while (job.status === 'running') {
            if (Date.parse(version.lastAttemptAt ?? version.createdAt) + BUILD_TIMEOUT_MS < Date.now()) {
                return fail('The build took too long');
            }
            // With waitMs 0, this checks the job once and returns
            if (Date.now() - started >= waitMs) return null;
            await sleep(pollMs);
            job = await client.getJob<{ download_url?: string }>(jobId);
        }
        if (job.status === 'error') return fail(`The build failed: ${job.messages.join(' ') || 'no reason given'}`);

        // Download its zip
        const url = new URL(job.data.download_url ?? '');
        if (url.protocol !== 'https:' || url.hostname !== ARCHIVE_HOST) {
            return fail(`Unexpected build download location: ${url.origin}`);
        }
        const response = await fetchFn(url, { signal: AbortSignal.timeout(5 * 60_000) });
        if (!response.ok) return fail(`Failed to download the build: ${response.status}`);
        if (Number(response.headers.get('content-length')) > limits.maxSize) {
            return fail(new UnpackError(version.label ?? versionId, `is larger than ${limits.maxSize} bytes`).message);
        }
        const zip = new Uint8Array(await response.arrayBuffer());

        // Import it, keeping the version's id, label and preview token
        const imported = await importZip(storage, { ...project, versions: [] }, zip, version.origin, limits, {
            id: versionId,
            label: version.label,
            createdAt: version.createdAt
        });
        const updated = await updateProject(storage, slug, (p) => putVersion(p, imported));
        return updated?.versions.find((v) => v.id === versionId) ?? null;
    } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
    }
}
