import type { H3Event } from 'h3';

import {
    createError,
    defineEventHandler,
    getHeader,
    getRouterParam,
    readBody,
    useRuntimeConfig,
    useStorage
} from '#imports';

import { checkPasswordLogin, getAuthState, requireAdmin, useAdminSession } from '../utils/auth';
import { usePlayCanvasClient } from '../utils/context';
import { safePathSegments } from '../utils/paths';
import { PlayCanvasApiError } from '../utils/playcanvas-api';
import { addPlayCanvasProject, importPublishedApp } from '../utils/published-app';
import type { ProjectRecord, VersionRecord } from '../utils/records';
import { deleteProject, getProject, listProjects, updateProject } from '../utils/store';
import { putVersion, syncProjectOnce } from '../utils/sync';

type RepoProject = { slug: string; title: string; version: string };

/** A version, without its manifest, which only the player needs */
const versionSummary = ({ manifest: _manifest, ...version }: VersionRecord) => version;

const projectDetail = (project: ProjectRecord) => ({
    ...project,
    pinned: project.pinned ?? false,
    versions: [...project.versions]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map(versionSummary)
});

const projectSummary = (project: ProjectRecord) => {
    const live = project.versions.find((v) => v.id === project.liveVersion);
    return {
        slug: project.slug,
        title: project.title,
        playcanvas: project.playcanvas,
        liveVersion: project.liveVersion,
        liveLabel: live?.label ?? null,
        autoRelease: project.autoRelease,
        pinned: project.pinned ?? false,
        unpublished: project.unpublished,
        expiresAt: project.expiresAt,
        lastSyncAt: project.lastSyncAt,
        versions: project.versions.length,
        importing: project.versions.filter((v) => v.status === 'importing').length,
        failed: project.versions.filter((v) => v.status === 'failed').length
    };
};

/** Turns PlayCanvas API errors into responses explaining what went wrong, without the token */
function apiError(error: unknown): never {
    if (error instanceof PlayCanvasApiError) {
        throw createError({ statusCode: error.status === 404 ? 404 : 502, statusMessage: error.message });
    }
    throw error;
}

async function readJson<T>(event: H3Event): Promise<Partial<T>> {
    const body = await readBody(event).catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw createError({ statusCode: 400, statusMessage: 'Expected a JSON object' });
    }
    return body as Partial<T>;
}

async function requireProject(slug: string): Promise<ProjectRecord> {
    const project = await getProject(useStorage('playcanvas'), slug);
    if (!project) throw createError({ statusCode: 404, statusMessage: `There is no project "${slug}"` });
    return project;
}

type ProjectPatch = {
    title: string;
    autoRelease: boolean;
    pinned: boolean;
    unpublished: boolean;
    expiresAt: string | null;
    liveVersion: string | null;
};

/** Validates and applies a project update */
function applyPatch(project: ProjectRecord, patch: Partial<ProjectPatch>): void {
    const bad = (message: string) => {
        throw createError({ statusCode: 400, statusMessage: message });
    };

    if (patch.title !== undefined) {
        if (typeof patch.title !== 'string' || !patch.title.trim() || patch.title.length > 200) {
            bad('title must be 1 to 200 characters');
        }
        project.title = patch.title.trim();
    }

    for (const key of ['autoRelease', 'pinned', 'unpublished'] as const) {
        if (patch[key] === undefined) continue;
        if (typeof patch[key] !== 'boolean') bad(`${key} must be true or false`);
        project[key] = patch[key];
    }

    if (patch.expiresAt !== undefined) {
        if (
            patch.expiresAt !== null &&
            (typeof patch.expiresAt !== 'string' || Number.isNaN(Date.parse(patch.expiresAt)))
        ) {
            bad('expiresAt must be a date, or null');
        }
        project.expiresAt = patch.expiresAt === null ? null : new Date(patch.expiresAt).toISOString();
    }

    if (patch.liveVersion !== undefined) {
        if (patch.liveVersion !== null) {
            const version = project.versions.find((v) => v.id === patch.liveVersion);
            if (!version) bad(`There is no version "${patch.liveVersion}"`);
            if (version!.status !== 'ready') bad(`Version "${patch.liveVersion}" isn't imported yet`);
        }
        project.liveVersion = patch.liveVersion;
        // Choosing a version by hand pins it, so auto-release doesn't replace it on the next sync
        if (project.autoRelease && patch.pinned === undefined) project.pinned = true;
    }
}

/**
 * <baseURL>/api/admin/**
 *
 *   GET    session                               the login state
 *   POST   login { password }                    log in with the admin password
 *   POST   logout
 *   GET    projects                              CMS and repo projects
 *   POST   projects { projectId, slug? }         track a PlayCanvas project
 *   GET    projects/<slug>                       a project and its versions
 *   PATCH  projects/<slug> { … }                 update settings, or the live version
 *   DELETE projects/<slug>                       stop tracking a project, deleting its files
 *   POST   projects/<slug>/sync                  check PlayCanvas for new published apps now
 *   POST   projects/<slug>/versions/<id>/import  download a version that's only available
 */
export default defineEventHandler(async (event) => {
    const segments = safePathSegments(getRouterParam(event, '_') ?? '');
    if (!segments) throw createError({ statusCode: 404 });
    const [resource, slug, sub, id, action] = segments;
    const method = event.method;
    const storage = useStorage('playcanvas');

    if (resource === 'session' && method === 'GET') return getAuthState(event);

    if (resource === 'login' && method === 'POST') {
        if (getHeader(event, 'x-playcanvas-admin') !== '1') throw createError({ statusCode: 403 });
        const { password } = await readJson<{ password: string }>(event);
        if (!(await checkPasswordLogin(event, password))) {
            throw createError({ statusCode: 401, statusMessage: 'Wrong password' });
        }
        const session = await useAdminSession(event);
        await session.update({ admin: true });
        return getAuthState(event);
    }

    if (resource === 'logout' && method === 'POST') {
        if (getHeader(event, 'x-playcanvas-admin') !== '1') throw createError({ statusCode: 403 });
        const session = await useAdminSession(event);
        await session.clear();
        return { ok: true };
    }

    await requireAdmin(event);

    if (resource !== 'projects') throw createError({ statusCode: 404 });

    // projects
    if (!slug) {
        if (method === 'GET') {
            const repo = ((useRuntimeConfig().playcanvas as { repoProjects?: RepoProject[] }).repoProjects ?? []).map(
                (project) => ({ ...project })
            );
            const projects = (await listProjects(storage)).map(projectSummary);
            return { projects: projects.sort((a, b) => a.title.localeCompare(b.title)), repo };
        }

        if (method === 'POST') {
            const { projectId, slug: requestedSlug } = await readJson<{ projectId: number; slug: string }>(event);
            if (!Number.isInteger(projectId) || projectId! <= 0) {
                throw createError({ statusCode: 400, statusMessage: 'projectId must be a PlayCanvas project id' });
            }
            if (requestedSlug !== undefined && typeof requestedSlug !== 'string') {
                throw createError({ statusCode: 400, statusMessage: 'slug must be a string' });
            }

            const reservedSlugs = (
                (useRuntimeConfig().playcanvas as { repoProjects?: RepoProject[] }).repoProjects ?? []
            ).map((project) => project.slug);
            const client = usePlayCanvasClient();
            const project = await addPlayCanvasProject(storage, client, projectId!, {
                slug: requestedSlug || undefined,
                reservedSlugs
            }).catch((error) => {
                if (error instanceof PlayCanvasApiError) apiError(error);
                throw createError({ statusCode: 400, statusMessage: (error as Error).message });
            });

            // Fetch its published apps in the background
            event.waitUntil(syncProjectOnce(storage, client, project.slug).catch((error) => console.error(error)));
            return projectDetail(project);
        }

        throw createError({ statusCode: 405 });
    }

    // projects/<slug>
    if (!sub) {
        const project = await requireProject(slug);

        if (method === 'GET') return projectDetail(project);

        if (method === 'PATCH') {
            const patch = await readJson<ProjectPatch>(event);
            // Validate against the current record, then apply to a fresh read, so syncs aren't overwritten
            applyPatch(structuredClone(project), patch);
            const updated = await updateProject(storage, slug, (p) => applyPatch(p, patch));
            return projectDetail(updated!);
        }

        if (method === 'DELETE') {
            await deleteProject(storage, slug);
            return { ok: true };
        }

        throw createError({ statusCode: 405 });
    }

    // projects/<slug>/sync
    if (sub === 'sync' && !id && method === 'POST') {
        const project = await requireProject(slug);
        if (!project.playcanvas) throw createError({ statusCode: 400, statusMessage: 'Not a PlayCanvas project' });
        const result = await syncProjectOnce(storage, usePlayCanvasClient(), slug);
        return { result, project: projectDetail((await getProject(storage, slug))!) };
    }

    // projects/<slug>/versions/<id>/import
    if (sub === 'versions' && id && action === 'import' && method === 'POST') {
        const project = await requireProject(slug);
        const version = project.versions.find((v) => v.id === id);
        if (!version) throw createError({ statusCode: 404, statusMessage: `There is no version "${id}"` });
        if (version.origin.type !== 'app') {
            throw createError({ statusCode: 400, statusMessage: 'Only published apps can be imported' });
        }
        if (version.status === 'ready' || version.status === 'importing') return projectDetail(project);

        const { appId } = version.origin;
        await updateProject(storage, slug, (p) => {
            const v = p.versions.find((v) => v.id === id)!;
            v.status = 'importing';
            v.attempts = (v.attempts ?? 0) + 1;
            v.lastAttemptAt = new Date().toISOString();
            delete v.error;
        });

        try {
            const app = await usePlayCanvasClient().getApp(appId);
            const imported = await importPublishedApp(storage, { ...project, versions: [] }, app);
            const updated = await updateProject(storage, slug, (p) => putVersion(p, imported));
            return projectDetail(updated!);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await updateProject(storage, slug, (p) => {
                const v = p.versions.find((v) => v.id === id);
                if (v) Object.assign(v, { status: 'failed', error: message });
            });
            if (error instanceof PlayCanvasApiError) apiError(error);
            throw createError({ statusCode: 502, statusMessage: message });
        }
    }

    throw createError({ statusCode: 404 });
});
