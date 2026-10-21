import type { EditorManifest } from '@treygrr/playcanvas-vue/editor/manifest';

/**
 * A project as served to `<PlayCanvasScene>`: where its files are, and how to load it.
 */
export type PlayCanvasProject = {
    slug: string;
    title: string;
    /** A hash of the zip contents. Each version is served from its own immutable folder */
    version: string;
    /** The engine version the project was exported with */
    engineVersion: string | null;
    /** The URL the project's files are served from */
    base: string;
    manifest: EditorManifest;
};

/**
 * The projects found at build time, filled in by a generated declaration for autocomplete.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmented by the module
export interface PlayCanvasProjects {}

/** A project slug. Known slugs autocomplete, but any string is accepted */
export type PlayCanvasProjectSlug = keyof PlayCanvasProjects | (string & {});
