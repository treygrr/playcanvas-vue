import type { Application, Entity } from 'playcanvas';
import * as pc from 'playcanvas';

import type { EditorManifest, EditorModule } from './manifest.ts';
import { joinUrl } from './manifest.ts';

export type LoadEditorProjectOptions = {
    /** The base URL of the export, which its manifest URLs are relative to */
    base: string;
    /** The name or URL of the scene to load. Defaults to the first scene */
    scene?: string;
    /**
     * Apply the project's canvas fill and resolution settings. When false, the application keeps
     * its own, so the scene fits the element it is in.
     * @default false
     */
    useProjectCanvasSettings?: boolean;
};

// Editor projects load one at a time, as their scripts register with whichever app loads them
let queue: Promise<unknown> = Promise.resolve();

const isDestroyed = (app: Application) => !app.root;

/**
 * Classic Editor scripts call the global `pc.createScript(name)`, which registers the script with the
 * engine's "current" application. That switches every frame when several applications run, so the
 * global is pointed at the application being loaded.
 */
const exposeEngineFor = (app: Application) => {
    (globalThis as { pc?: unknown }).pc = {
        ...pc,
        createScript: (name: string, target?: Application) => pc.createScript(name, target ?? app),
        registerScript: (script: Parameters<typeof pc.registerScript>[0], name?: string, target?: Application) =>
            pc.registerScript(script, name, target ?? app)
    };
};

const loadModule = (module: EditorModule, base: string) =>
    new Promise<void>((resolve) => {
        const url = (path?: string) => (path ? joinUrl(base, path) : undefined);
        pc.WasmModule.setConfig(module.moduleName, {
            glueUrl: url(module.glueUrl),
            wasmUrl: url(module.wasmUrl),
            fallbackUrl: url(module.fallbackUrl)
        });

        // Emscripten instances are thenables, so the instance must not be passed to resolve()
        pc.WasmModule.getInstance(module.moduleName, (instance: unknown) => {
            const global = globalThis as Record<string, unknown>;
            if (global[module.moduleName] === undefined) global[module.moduleName] = instance;
            resolve();
        });
    });

const callbackToPromise = <T>(run: (done: (err: unknown, result?: T) => void) => void) =>
    new Promise<T>((resolve, reject) => {
        run((err, result) =>
            err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve(result as T)
        );
    });

/**
 * Loads a PlayCanvas Editor export into a running application: its WebAssembly modules, config,
 * preloaded assets, scripts, and a scene. This is what the export's own `__start__.js` does.
 *
 * Create the application with the export's settings (see `editorApplicationProps()`), so that
 * scripts and input devices the project relies on are available.
 *
 * @param app The application to load into.
 * @param manifest The manifest of the export, see `createEditorManifest()`.
 * @param options Where the export is served, and which scene to load.
 * @returns The root entity of the loaded scene.
 */
export function loadEditorProject(
    app: Application,
    manifest: EditorManifest,
    options: LoadEditorProjectOptions
): Promise<Entity> {
    const run = async () => {
        const { base, useProjectCanvasSettings = false } = options;
        const sceneInfo = options.scene
            ? manifest.scenes.find(({ name, url }) => name === options.scene || url === options.scene)
            : manifest.scenes[0];

        if (!sceneInfo) {
            throw new Error(
                options.scene ? `The project has no scene named "${options.scene}"` : 'The project has no scenes'
            );
        }

        exposeEngineFor(app);

        // WebAssembly modules, eg Ammo for physics
        for (const module of manifest.modules.filter((m) => m.preload)) {
            await loadModule(module, base);
        }
        if (isDestroyed(app)) throw new Error('The application was destroyed while loading');

        if (manifest.modules.some((m) => m.moduleName === 'Ammo') && !app.systems.rigidbody?.dispatcher) {
            app.systems.rigidbody?.onLibraryLoaded();
        }

        // The config overrides the canvas settings, which belong to the application unless asked otherwise.
        // Switching fill mode writes the window size into the canvas style, so that is restored too.
        const { fillMode, resolutionMode } = app;
        const { canvas } = app.graphicsDevice;
        const { width, height } = canvas.style;
        await callbackToPromise((done) => app.configure(joinUrl(base, manifest.config), done));
        if (isDestroyed(app)) throw new Error('The application was destroyed while loading');
        if (!useProjectCanvasSettings) {
            app.setCanvasFillMode(fillMode);
            app.setCanvasResolution(resolutionMode);
            canvas.style.width = width;
            canvas.style.height = height;
            app.updateCanvasSize();
        }

        await new Promise<void>((resolve) => app.preload(() => resolve()));
        if (isDestroyed(app)) throw new Error('The application was destroyed while loading');

        // `loadScene` is for app start-up, and leaves initializing scripts to `app.start()`. The app is
        // already running, so load the settings and hierarchy separately, which initializes them.
        // Scene URLs are resolved against the asset prefix, which is the base URL.
        const sceneItem = app.scenes.findByUrl(sceneInfo.url) ?? app.scenes.find(sceneInfo.name);
        const scene = sceneItem ?? sceneInfo.url;

        await callbackToPromise((done) =>
            app.scenes.loadSceneSettings(scene, done as Parameters<typeof app.scenes.loadSceneSettings>[1])
        );
        if (isDestroyed(app)) throw new Error('The application was destroyed while loading');

        return callbackToPromise<Entity>((done) =>
            app.scenes.loadSceneHierarchy(scene, done as Parameters<typeof app.scenes.loadSceneHierarchy>[1])
        );
    };

    const result = queue.then(run);
    // Keep the queue going after a failed load
    queue = result.catch(() => undefined);
    return result;
}
