import type { Application as PcApplication } from 'playcanvas';
import { AppBase, Entity as PcEntity, FILLMODE_NONE, GraphNode, Script, WasmModule } from 'playcanvas';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { h, ref } from 'vue';

import { editorConfig } from '../../test/fixtures/editor-config.ts';
import { mountScene, settle } from '../../test/mount.ts';
import { Light } from '../components/Light.ts';
import { Entity } from '../Entity.ts';
import { Modify } from '../gltf/components/Modify.ts';

import { editorApplicationProps } from './EditorProject.ts';
import { EditorScene } from './EditorScene.ts';
import { loadEditorProject } from './load-editor-project.ts';
import { createEditorManifest } from './manifest.ts';

const fullManifest = createEditorManifest(editorConfig);

// Most tests leave out the Ammo module, so that no test app starts physics with a fake Ammo
const manifest = { ...fullManifest, modules: [] };

/**
 * Stands in for the network: `configure`, `preload` and `loadScene` succeed and build `buildScene()`,
 * and the Ammo module loads instantly.
 */
const fakeLoading = (buildScene: (app: PcApplication) => PcEntity = () => new PcEntity('Root')) => {
    const steps: string[] = [];

    vi.spyOn(WasmModule, 'setConfig').mockImplementation(() => undefined);
    vi.spyOn(WasmModule, 'getInstance').mockImplementation((name, callback) => {
        steps.push(`module:${name}`);
        callback({});
    });
    vi.spyOn(AppBase.prototype, 'configure').mockImplementation(function (this: PcApplication, url, callback) {
        steps.push(`configure:${url}`);
        // The config sets the project's canvas settings
        this.setCanvasFillMode('FILL_WINDOW');
        setTimeout(() => callback(null), 0);
    });
    vi.spyOn(AppBase.prototype, 'preload').mockImplementation((callback) => {
        steps.push('preload');
        setTimeout(() => callback(), 0);
    });

    const loadScene = (app: PcApplication) => {
        vi.spyOn(app.scenes, 'loadSceneSettings').mockImplementation((scene, callback) => {
            steps.push(`settings:${typeof scene === 'string' ? scene : scene.url}`);
            setTimeout(() => callback(null), 0);
        });
        return vi.spyOn(app.scenes, 'loadSceneHierarchy').mockImplementation((scene, callback) => {
            steps.push(`scene:${typeof scene === 'string' ? scene : scene.url}`);
            const root = buildScene(app);
            app.root.addChild(root);
            setTimeout(() => callback(null, root), 0);
        });
    };

    return { steps, loadScene };
};

afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { pc?: unknown }).pc;
    delete (globalThis as { Ammo?: unknown }).Ammo;
});

describe('createEditorManifest', () => {
    it('reads scenes, scripts, input and device settings', () => {
        expect(fullManifest.config).toBe('config.json');
        expect(fullManifest.scenes).toEqual([
            { name: 'Main Scene', url: '1000.json' },
            { name: 'Level 2', url: '1001.json' }
        ]);
        expect(fullManifest.scriptsOrder).toEqual([101, 102]);
        expect(fullManifest.input).toEqual({ mouse: true, touch: true, keyboard: true, gamepads: false });
        expect(fullManifest.device.deviceTypes).toEqual(['webgl2']);
        expect(fullManifest.canvas.fillMode).toBe('FILL_WINDOW');
    });

    it('resolves wasm modules from their glue and fallback script assets', () => {
        expect(fullManifest.modules).toEqual([
            {
                moduleName: 'Ammo',
                glueUrl: 'files/assets/201/1/ammo.wasm.js',
                wasmUrl: 'files/assets/203/1/ammo.wasm.wasm',
                fallbackUrl: 'files/assets/202/1/ammo.js',
                preload: true
            }
        ]);
    });

    it('maps to Application props', () => {
        const props = editorApplicationProps(fullManifest, '/exports/demo');

        expect(props).toMatchObject({
            useKeyboard: true,
            useElementInput: true,
            assetPrefix: '/exports/demo/',
            scriptsOrder: [101, 102],
            deviceTypes: ['webgl2']
        });
    });
});

describe('loadEditorProject', () => {
    it('loads modules, config, preloaded assets and the scene, in order', async () => {
        const { steps, loadScene } = fakeLoading();
        const { app } = await mountScene();
        loadScene(app);
        // Physics starts once its module has loaded
        const onLibraryLoaded = vi.spyOn(app.systems.rigidbody!, 'onLibraryLoaded').mockImplementation(() => undefined);

        const root = await loadEditorProject(app, fullManifest, { base: '/exports/demo/' });

        expect(steps).toEqual([
            'module:Ammo',
            'configure:/exports/demo/config.json',
            'preload',
            'settings:1000.json',
            'scene:1000.json'
        ]);
        expect(WasmModule.setConfig).toHaveBeenCalledWith('Ammo', {
            glueUrl: '/exports/demo/files/assets/201/1/ammo.wasm.js',
            wasmUrl: '/exports/demo/files/assets/203/1/ammo.wasm.wasm',
            fallbackUrl: '/exports/demo/files/assets/202/1/ammo.js'
        });
        expect(onLibraryLoaded).toHaveBeenCalled();
        expect(root.name).toBe('Root');
        expect(root.parent).toBe(app.root);
    });

    it('loads a scene by name', async () => {
        const { steps, loadScene } = fakeLoading();
        const { app } = await mountScene();
        loadScene(app);

        await loadEditorProject(app, manifest, { base: '/x/', scene: 'Level 2' });

        expect(steps).toContain('scene:1001.json');
    });

    it('rejects an unknown scene', async () => {
        fakeLoading();
        const { app } = await mountScene();

        await expect(loadEditorProject(app, manifest, { base: '/x/', scene: 'Nope' })).rejects.toThrow(
            'The project has no scene named "Nope"'
        );
    });

    it("keeps the application's canvas settings unless asked otherwise", async () => {
        const { loadScene } = fakeLoading();
        const { app } = await mountScene();
        loadScene(app);

        await loadEditorProject(app, manifest, { base: '/x/' });
        expect(app.fillMode).toBe(FILLMODE_NONE);

        await loadEditorProject(app, manifest, { base: '/x/', useProjectCanvasSettings: true });
        expect(app.fillMode).toBe('FILL_WINDOW');
    });

    it('registers classic scripts with the application being loaded', async () => {
        const { loadScene } = fakeLoading();
        const { app } = await mountScene();
        loadScene(app);

        await loadEditorProject(app, manifest, { base: '/x/' });

        // What a classic Editor script does when it runs
        const global = globalThis as unknown as { pc: { createScript: (name: string) => typeof Script } };
        const Rotator = global.pc.createScript('rotator');

        expect(app.scripts.get('rotator')).toBe(Rotator);
    });

    it('loads one project at a time', async () => {
        const { steps } = fakeLoading();
        const first = await mountScene();
        const second = await mountScene();
        for (const { app } of [first, second]) {
            vi.spyOn(app.scenes, 'loadSceneSettings').mockImplementation((_scene, callback) => callback(null));
            vi.spyOn(app.scenes, 'loadSceneHierarchy').mockImplementation((_scene, callback) => {
                steps.push(`scene:${app.root.getGuid()}`);
                setTimeout(() => callback(null, new PcEntity('Root')), 0);
            });
        }

        await Promise.all([
            loadEditorProject(first.app, manifest, { base: '/a/' }),
            loadEditorProject(second.app, manifest, { base: '/b/' })
        ]);

        // The second project only starts once the first has loaded its scene
        const firstScene = steps.indexOf(`scene:${first.app.root.getGuid()}`);
        expect(steps.indexOf('configure:/b/config.json')).toBeGreaterThan(firstScene);
    });
});

describe('EditorScene', () => {
    const buildScene = () => {
        const root = new PcEntity('Root');
        const lamp = new PcEntity('Lamp');
        lamp.addComponent('light', { type: 'omni', intensity: 1 });
        root.addChild(lamp);
        // Scenes can hold plain graph nodes, which rules skip
        root.addChild(new GraphNode('Node'));
        return root;
    };

    it('shows the loading slot, then renders children under the scene root', async () => {
        const { loadScene } = fakeLoading(buildScene);
        const show = ref(false);
        const { wrapper, app } = await mountScene(() =>
            show.value
                ? h(
                      EditorScene,
                      { manifest, base: '/x/' },
                      {
                          loading: () => h(Entity, { name: 'Spinner' }),
                          default: () => h(Entity, { name: 'Added' })
                      }
                  )
                : null
        );
        loadScene(app);

        show.value = true;
        await settle();
        expect(app.root.findByName('Spinner')).toBeTruthy();

        await vi.waitFor(() => expect(app.root.findByName('Added')).toBeTruthy());
        expect(app.root.findByName('Added')!.parent!.name).toBe('Root');
        expect(app.root.findByName('Spinner')).toBeNull();
        wrapper.unmount();
    });

    it('applies Modify rules to the loaded scene', async () => {
        const { loadScene } = fakeLoading(buildScene);
        const show = ref(false);
        const { app } = await mountScene(() =>
            show.value
                ? h(EditorScene, { manifest, base: '/x/' }, () =>
                      h(Modify.Node, { path: 'Root.Lamp' }, () => [
                          h(Modify.Light, { intensity: (value: number) => value * 3 }),
                          h(Entity, { name: 'Shade' }, () => h(Light, { type: 'spot' }))
                      ])
                  )
                : null
        );
        loadScene(app);

        show.value = true;
        await vi.waitFor(() => expect(app.root.findByName('Shade')).toBeTruthy());

        const lamp = app.root.findByName('Lamp') as PcEntity;
        expect(lamp.light!.intensity).toBe(3);
        expect(app.root.findByName('Shade')!.parent).toBe(lamp);
    });

    it('destroys the loaded scene when unmounted', async () => {
        const { loadScene } = fakeLoading(buildScene);
        const show = ref(false);
        const { app } = await mountScene(() => (show.value ? h(EditorScene, { manifest, base: '/x/' }) : null));
        loadScene(app);

        show.value = true;
        await vi.waitFor(() => expect(app.root.findByName('Lamp')).toBeTruthy());

        show.value = false;
        await settle();

        expect(app.root.findByName('Lamp')).toBeNull();
    });

    it('renders the error slot when loading fails', async () => {
        fakeLoading();
        vi.spyOn(AppBase.prototype, 'configure').mockImplementation((_url, callback) => callback('Not found'));
        const show = ref(false);
        const { app } = await mountScene(() =>
            show.value
                ? h(
                      EditorScene,
                      { manifest, base: '/x/' },
                      { error: ({ error }: { error: Error }) => h(Entity, { name: `Error: ${error.message}` }) }
                  )
                : null
        );

        show.value = true;
        await vi.waitFor(() => expect(app.root.findByName('Error: Not found')).toBeTruthy());
    });
});
