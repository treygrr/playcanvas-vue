import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { createEditorManifest } from '@treygrr/playcanvas-vue/editor/manifest';

import type { UnpackedExport } from './runtime/server/unpack.ts';
import type { PlayCanvasProject } from './runtime/types.ts';

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
