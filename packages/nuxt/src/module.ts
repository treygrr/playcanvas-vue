import { existsSync, watch } from 'node:fs';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';

import {
    addComponent,
    addServerHandler,
    addTypeTemplate,
    createResolver,
    defineNuxtModule,
    extendPages,
    useLogger
} from '@nuxt/kit';

import type { PlayCanvasProject } from './runtime/types.ts';
import type { UnpackLimits } from './runtime/server/unpack.ts';
import { UnpackError, defaultLimits, slugify, unpackExport } from './runtime/server/unpack.ts';
import { writeExport } from './write-export.ts';

export type { PlayCanvasProject, PlayCanvasProjects, PlayCanvasProjectSlug } from './runtime/types.ts';

export type ModuleOptions = {
    /**
     * The folder, relative to the project root, holding PlayCanvas Editor "Download" zips.
     * Each zip becomes a project, with a slug made from its file name.
     * @default 'playcanvas'
     */
    dir: string;
    /**
     * The route prefix of the generated full-window pages, eg `/play/my-project`. `false` disables them.
     * @default '/play'
     */
    route: string | false;
    /**
     * The URL that project files are served from.
     * @default '/_playcanvas'
     */
    baseURL: string;
    /**
     * Limits for unpacking zips and published apps.
     */
    limits: UnpackLimits;
    /**
     * The route of the admin, where PlayCanvas projects are added and released. `false` disables it.
     * Log in with NUXT_PLAYCANVAS_ADMIN_PASSWORD, or decide access with a `playcanvas:authorize` hook.
     * @default '/_playcanvas'
     */
    admin: string | false;
    /**
     * Syncing tracked PlayCanvas projects with their published apps.
     */
    sync: {
        /**
         * Check PlayCanvas in the background when a project is requested, at most once per `interval`.
         * @default true
         */
        onRequest: boolean;
        /**
         * The least time between syncs of a project, in seconds.
         * @default 300
         */
        interval: number;
    };
};

const logger = useLogger('playcanvas');

/** The engine minor version an export was made with should match the installed one */
const checkEngineVersion = (project: PlayCanvasProject, rootDir: string) => {
    if (!project.engineVersion) return;
    try {
        const require = createRequire(join(rootDir, 'package.json'));
        const installed: string = require('playcanvas/package.json').version;
        const minor = (version: string) => version.split('.').slice(0, 2).join('.');
        if (minor(installed) !== minor(project.engineVersion)) {
            logger.warn(
                `"${project.slug}" was exported with PlayCanvas Engine ${project.engineVersion}, but ${installed} is installed. ` +
                    'Scripts written for another engine version may not work.'
            );
        }
    } catch {
        // playcanvas isn't resolvable from the project root, nothing to compare
    }
};

export default defineNuxtModule<ModuleOptions>({
    meta: {
        name: '@treygrr/playcanvas-nuxt',
        configKey: 'playcanvas'
    },
    defaults: {
        dir: 'playcanvas',
        route: '/play',
        baseURL: '/_playcanvas',
        limits: defaultLimits,
        admin: '/_playcanvas',
        sync: { onRequest: true, interval: 300 }
    },
    async setup(options, nuxt) {
        const resolver = createResolver(import.meta.url);
        const sourceDir = resolve(nuxt.options.rootDir, options.dir);
        // Not inside buildDir, which Nuxt clears after modules have run
        const outDir = join(nuxt.options.rootDir, 'node_modules', '.cache', 'playcanvas-nuxt');
        const baseURL = options.baseURL.replace(/\/$/, '');
        const projects = new Map<string, PlayCanvasProject>();

        const unpack = async (zipPath: string) => {
            const name = basename(zipPath);
            const slug = slugify(name);
            if (!slug) throw new UnpackError(name, 'the file name has no letters or digits to make a slug from');

            const unpacked = await unpackExport(new Uint8Array(await readFile(zipPath)), name, options.limits);
            const project = await writeExport(unpacked, slug, outDir, baseURL);
            projects.set(slug, project);
            checkEngineVersion(project, nuxt.options.rootDir);
            logger.success(`PlayCanvas project "${slug}" (${project.title}) ready at ${baseURL}/projects/${slug}.json`);
        };

        const zipsIn = async (dir: string) => {
            try {
                return (await readdir(dir)).filter((file) => file.toLowerCase().endsWith('.zip')).sort();
            } catch {
                return [];
            }
        };

        // Unpack every zip, failing the build on an invalid one so that broken exports aren't deployed
        await rm(outDir, { recursive: true, force: true });
        const zips = await zipsIn(sourceDir);
        const slugs = new Map<string, string>();
        for (const zip of zips) {
            const slug = slugify(zip);
            if (slugs.has(slug)) {
                throw new Error(`[playcanvas] "${zip}" and "${slugs.get(slug)}" both make the project slug "${slug}"`);
            }
            slugs.set(slug, zip);
            await unpack(join(sourceDir, zip));
        }
        if (zips.length === 0) logger.info(`No PlayCanvas exports found in ${options.dir}/`);

        // Serve projects from repo zips as static files. Versions are content hashes, so their files
        // never change. Project files fall through to the CMS route when there's no static one
        nuxt.options.nitro.publicAssets ||= [];
        nuxt.options.nitro.publicAssets.push(
            { dir: join(outDir, 'assets'), baseURL: `${baseURL}/assets`, maxAge: 60 * 60 * 24 * 365 },
            { dir: join(outDir, 'projects'), baseURL: `${baseURL}/projects`, maxAge: 0, fallthrough: true }
        );

        // CMS projects are kept in the `playcanvas` storage mount: a folder by default, or any
        // unstorage driver (S3, R2, Vercel Blob, …) configured under `nitro.storage.playcanvas`
        nuxt.options.nitro.storage ||= {};
        nuxt.options.nitro.storage.playcanvas ??= { driver: 'fs', base: '.data/playcanvas' };
        nuxt.options.nitro.devStorage ||= {};
        nuxt.options.nitro.devStorage.playcanvas ??= {
            driver: 'fs',
            base: join(nuxt.options.rootDir, '.data', 'playcanvas')
        };

        addServerHandler({
            route: `${baseURL}/projects/:slug`,
            method: 'get',
            handler: resolver.resolve('./runtime/server/routes/project.get')
        });
        addServerHandler({
            route: `${baseURL}/api/admin/**`,
            handler: resolver.resolve('./runtime/server/routes/admin')
        });
        addServerHandler({
            route: `${baseURL}/api/sync`,
            method: 'post',
            handler: resolver.resolve('./runtime/server/routes/sync.post')
        });
        addServerHandler({
            route: `${baseURL}/files/**`,
            method: 'get',
            handler: resolver.resolve('./runtime/server/routes/files.get')
        });

        // Project files say which version is live, so browsers must always check for a newer one
        nuxt.options.routeRules ||= {};
        nuxt.options.routeRules[`${baseURL}/projects/**`] = {
            ...nuxt.options.routeRules[`${baseURL}/projects/**`],
            headers: { 'cache-control': 'no-cache' }
        };

        const normalizeRoute = (route: string) => `/${route.replace(/^\/|\/$/g, '')}`;
        // Empty when disabled: runtime config values can't be null
        const playRoute = options.route === false ? '' : normalizeRoute(options.route);
        const adminRoute = options.admin === false ? '' : normalizeRoute(options.admin);

        nuxt.options.runtimeConfig.public.playcanvas = { baseURL, playRoute, adminRoute };

        // Server only. The PlayCanvas API token and sync secret are set at runtime with
        // NUXT_PLAYCANVAS_TOKEN and NUXT_PLAYCANVAS_SYNC_SECRET
        nuxt.options.runtimeConfig.playcanvas = {
            token: '',
            syncSecret: '',
            // The admin password and an optional session secret, set at runtime with
            // NUXT_PLAYCANVAS_ADMIN_PASSWORD and NUXT_PLAYCANVAS_SESSION_SECRET
            adminPassword: '',
            sessionSecret: '',
            // Projects from repo zips, so the admin can show them and keep their slugs reserved
            repoProjects: [...projects.values()].map(({ slug, title, version }) => ({ slug, title, version })),
            syncOnRequest: options.sync.onRequest,
            syncInterval: options.sync.interval,
            ...(nuxt.options.runtimeConfig.playcanvas as Record<string, unknown> | undefined)
        };

        // Re-unpack zips as they change in development. The folder is outside the app source, so
        // Nuxt's own watcher doesn't see it
        if (nuxt.options.dev) {
            const pending = new Map<string, NodeJS.Timeout>();

            const sync = async (zip: string) => {
                const zipPath = join(sourceDir, zip);
                const slug = slugify(zip);
                try {
                    if (existsSync(zipPath)) {
                        await unpack(zipPath);
                    } else {
                        projects.delete(slug);
                        await rm(join(outDir, 'assets', slug), { recursive: true, force: true });
                        await rm(join(outDir, 'projects', `${slug}.json`), { force: true });
                        logger.info(`PlayCanvas project "${slug}" removed`);
                    }
                } catch (error) {
                    logger.error((error as Error).message);
                }
            };

            await mkdir(sourceDir, { recursive: true });
            const watcher = watch(sourceDir, (_event, file) => {
                if (!file || !file.toLowerCase().endsWith('.zip')) return;
                // Copying a zip fires several events, so wait for them to settle
                clearTimeout(pending.get(file));
                pending.set(
                    file,
                    setTimeout(() => {
                        pending.delete(file);
                        void sync(file);
                    }, 300)
                );
            });

            nuxt.hook('close', () => {
                watcher.close();
                pending.forEach((timeout) => clearTimeout(timeout));
            });
        }

        addComponent({
            name: 'PlayCanvasScene',
            filePath: resolver.resolve('./runtime/components/PlayCanvasScene.vue'),
            // The engine needs a browser, so the scene renders on the client only
            mode: 'client'
        });

        extendPages((pages) => {
            if (playRoute) {
                pages.push({
                    name: 'playcanvas-project',
                    path: `${playRoute}/:slug`,
                    file: resolver.resolve('./runtime/pages/PlayCanvasPage.vue')
                });
            }
            if (adminRoute) {
                pages.push(
                    {
                        name: 'playcanvas-admin',
                        path: adminRoute,
                        file: resolver.resolve('./runtime/admin/AdminProjects.vue')
                    },
                    {
                        // Not `projects/`, which is where project files are served
                        name: 'playcanvas-admin-project',
                        path: `${adminRoute}/manage/:slug`,
                        file: resolver.resolve('./runtime/admin/AdminProject.vue')
                    }
                );
            }
        });

        // Type `playcanvas:authorize` hooks in the app's Nitro plugins
        addTypeTemplate(
            {
                filename: 'types/playcanvas-nitro.d.ts',
                getContents: () =>
                    [
                        "import type { H3Event } from 'h3';",
                        '',
                        "declare module 'nitropack' {",
                        '    interface NitroRuntimeHooks {',
                        '        /** Decide whether a request may use the PlayCanvas admin, by setting `auth.allowed` */',
                        "        'playcanvas:authorize': (event: H3Event, auth: { allowed?: boolean }) => void | Promise<void>;",
                        '    }',
                        '}',
                        '',
                        'export {};',
                        ''
                    ].join('\n')
            },
            { nitro: true, nuxt: true }
        );

        // Autocomplete for the projects found at build time
        addTypeTemplate({
            filename: 'types/playcanvas-projects.d.ts',
            getContents: () =>
                [
                    "declare module '@treygrr/playcanvas-nuxt' {",
                    '    interface PlayCanvasProjects {',
                    ...[...slugs.keys()].map((slug) => `        ${JSON.stringify(slug)}: true;`),
                    '    }',
                    '}',
                    'export {};',
                    ''
                ].join('\n')
        });
    }
});
