import type { DeviceType } from '../utils/create-graphics-device.ts';

/**
 * A WebAssembly module an Editor project loads before its scene, eg the Ammo physics engine.
 * URLs are relative to the project's base URL.
 */
export type EditorModule = {
    moduleName: string;
    glueUrl?: string;
    wasmUrl?: string;
    fallbackUrl?: string;
    preload: boolean;
};

/**
 * Everything needed to load a PlayCanvas Editor export, derived from its `config.json`.
 * URLs are relative to the export's base URL.
 */
export type EditorManifest = {
    /** The URL of the project config, relative to the base URL */
    config: string;
    /** The scenes in the project, in Editor order. The first is loaded by default */
    scenes: { name: string; url: string }[];
    /** The asset ids of scripts, in load order */
    scriptsOrder: (number | string)[];
    /** The input devices the project uses */
    input: { mouse: boolean; touch: boolean; keyboard: boolean; gamepads: boolean };
    /** Graphics device settings */
    device: {
        deviceTypes: DeviceType[];
        antialias: boolean;
        alpha: boolean;
        preserveDrawingBuffer: boolean;
        powerPreference: GPUPowerPreference | 'default';
    };
    /** The project's canvas settings, used when the scene fills the window */
    canvas: { fillMode: string; resolutionMode: string; width: number; height: number };
    /** WebAssembly modules to load before the scene */
    modules: EditorModule[];
};

type ConfigAsset = {
    type: string;
    file?: { url?: string } | null;
    data?: Record<string, unknown> | null;
};

/**
 * The parts of an Editor project's `config.json` that are read.
 */
export type EditorConfig = {
    application_properties: Record<string, unknown>;
    scenes: { name: string; url: string }[];
    assets: Record<string, ConfigAsset>;
};

/**
 * Derives the settings needed to load an Editor export from its `config.json`.
 *
 * @param config The parsed `config.json` of the export.
 * @param configUrl The URL of `config.json`, relative to the export's base URL.
 * @returns The manifest for the project.
 */
export function createEditorManifest(config: EditorConfig, configUrl = 'config.json'): EditorManifest {
    const props = config.application_properties ?? {};
    const assets = config.assets ?? {};
    const fileUrl = (id: unknown) => (id == null ? undefined : (assets[String(id)]?.file?.url ?? undefined));

    const deviceTypes: DeviceType[] = [];
    if (props.enableWebGpu) deviceTypes.push('webgpu');
    if (props.enableWebGl2 !== false) deviceTypes.push('webgl2');

    // Wasm assets reference their glue and fallback scripts by asset id
    const modules: EditorModule[] = Object.values(assets)
        .filter((asset) => asset.type === 'wasm' && asset.data?.moduleName)
        .map((asset) => ({
            moduleName: String(asset.data!.moduleName),
            glueUrl: fileUrl(asset.data!.glueScriptId),
            wasmUrl: asset.file?.url ?? undefined,
            fallbackUrl: fileUrl(asset.data!.fallbackScriptId),
            preload: true
        }));

    return {
        config: configUrl,
        scenes: (config.scenes ?? []).map(({ name, url }) => ({ name, url })),
        scriptsOrder: Array.isArray(props.scripts) ? (props.scripts as (number | string)[]) : [],
        input: {
            mouse: props.useMouse !== false,
            touch: props.useTouch !== false,
            keyboard: props.useKeyboard !== false,
            gamepads: props.useGamepads === true
        },
        device: {
            deviceTypes: deviceTypes.length ? deviceTypes : ['webgl2'],
            antialias: props.antiAlias !== false,
            alpha: props.transparentCanvas === true,
            preserveDrawingBuffer: props.preserveDrawingBuffer === true,
            powerPreference: (props.powerPreference as EditorManifest['device']['powerPreference']) ?? 'default'
        },
        canvas: {
            fillMode: String(props.fillMode ?? 'FILL_WINDOW'),
            resolutionMode: String(props.resolutionMode ?? 'AUTO'),
            width: Number(props.width ?? 1280),
            height: Number(props.height ?? 720)
        },
        modules
    };
}

/**
 * Joins a base URL and a relative path, keeping absolute URLs as they are.
 * @private
 */
export const joinUrl = (base: string, url: string): string =>
    /^([a-z]+:)?\/\//i.test(url) || url.startsWith('/') ? url : `${base.replace(/\/?$/, '/')}${url}`;
