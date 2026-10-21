import dedent from 'dedent';
import type { Scene, Texture } from 'playcanvas';
import { EnvLighting, Quat, Sky, SKYTYPE_DOME, SKYTYPE_INFINITE, Asset } from 'playcanvas';
import { defineComponent, onScopeDispose, watch, watchEffect } from 'vue';

import { useApp } from '../composables/use-app.ts';
import { validateEngineProps } from '../utils/engine-props.ts';
import type { PublicProps } from '../utils/types-utils.ts';
import type { Schema } from '../utils/validation.ts';
import { createComponentDefinition, getStaticNullApplication, warnOnce } from '../utils/validation.ts';
import { propsFromSchema, warnUnknownAttrs } from '../utils/vue-props.ts';

const appUUIDs = new Set<string>();

// Types
type SceneProps = Omit<Partial<PublicProps<Scene>>, 'skybox' | 'envAtlas'> & {
    /**
     * The skybox asset.
     * Used to set the skybox of the environment.
     */
    skybox?: Asset | null;
    /**
     * The environment lighting.
     * Used to set the lighting of the environment.
     */
    envAtlas?: Asset | null;
};

type SkyProps = Omit<Partial<PublicProps<Sky>>, 'node' | 'center'> & {
    /**
     * The scale of the sky.
     */
    scale?: [number, number, number];
    /**
     * The position of the sky.
     */
    position?: [number, number, number];
    /**
     * The center of the sky.
     */
    center?: [number, number, number];
    /**
     * The rotation of the sky.
     */
    rotation?: [number, number, number];
    /**
     * Whether to show the skybox.
     */
    showSkybox?: boolean;
};

export type EnvironmentProps = SkyProps & SceneProps;

// Component Definitions
const skyComponentDefinition = createComponentDefinition<SkyProps, Sky>(
    'Sky',
    () => new Sky(getStaticNullApplication().scene),
    (sky: Sky) => sky.resetSkyMesh()
);

const sceneComponentDefinition = createComponentDefinition<SceneProps, Scene>(
    'Scene',
    () => getStaticNullApplication().scene
);

skyComponentDefinition.schema = {
    ...skyComponentDefinition.schema,
    scale: {
        validate: (value: unknown) =>
            Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number'),
        errorMsg: (value: unknown) => `Expected an array of 3 numbers, got \`${typeof value}\``,
        default: [100, 100, 100]
    },
    rotation: {
        validate: (value: unknown) =>
            Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number'),
        errorMsg: (value: unknown) => `Expected an array of 3 numbers, got \`${typeof value}\``,
        default: [0, 0, 0]
    },
    position: {
        validate: (value: unknown) =>
            Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number'),
        errorMsg: (value: unknown) => `Expected an array of 3 numbers, got \`${typeof value}\``,
        default: [0, 0, 0]
    },
    center: {
        validate: (value: unknown) =>
            Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number'),
        errorMsg: (value: unknown) => `Expected an array of 3 numbers, got \`${typeof value}\``,
        default: [0, 0.05, 0]
    },
    showSkybox: {
        validate: (value: unknown) => typeof value === 'boolean',
        errorMsg: (value: unknown) => `Expected a boolean, got \`${typeof value}\``,
        default: true
    }
} as Schema<SkyProps, Sky>;

sceneComponentDefinition.schema = {
    ...sceneComponentDefinition.schema,
    envAtlas: {
        validate: (value: unknown) => value === null || (value instanceof Asset && value.type === 'texture'),
        errorMsg: (value: unknown) => `Expected a \`Asset\` instance, got \`${typeof value}\``,
        default: null
    },
    skybox: {
        validate: (value: unknown) => value === null || (value instanceof Asset && value.type === 'texture'),
        errorMsg: (value: unknown) => `Expected a \`Asset\` instance, got \`${typeof value}\``,
        default: null
    }
} as Schema<SceneProps, Scene>;

/**
 * @beta
 * Environment component
 * The Environment component is used to set the environment lighting and skybox.
 *
 * @example
 * ```vue
 * <Environment :env-atlas="envAtlas" :exposure="1.2" />
 * ```
 */
export const Environment = defineComponent(
    (props: EnvironmentProps, { attrs }) => {
        warnUnknownAttrs(attrs, { name: 'Environment', apiName: 'Scene' });
        const app = useApp();

        /**
         * The environment is global state, so only the first `<Environment/>` mounted in an
         * application is used. Any others warn and do nothing.
         */
        const appUUID = app.root.getGuid();
        if (appUUIDs.has(appUUID)) {
            warnOnce(
                dedent`Multiple \`<Environment/>\` components have been mounted.
                Only the first \`<Environment/>\` component will be used.`
            );
            return () => null;
        }
        appUUIDs.add(appUUID);
        onScopeDispose(() => appUUIDs.delete(appUUID));

        // Sanitize and validate the props
        const sceneProps = () => validateEngineProps(props as SceneProps, sceneComponentDefinition, true);
        const skyProps = () => validateEngineProps(props as SkyProps, skyComponentDefinition, true);

        /**
         * Sets the skybox of the environment.
         */
        watch(
            () => sceneProps().skybox,
            (skyBoxAsset, _prev, onCleanup) => {
                if (!skyBoxAsset) return;

                const isCubeMap = Array.isArray(skyBoxAsset.resources) && skyBoxAsset.resources.length === 6;
                let skybox: Texture = skyBoxAsset.resource as Texture;

                // If the skybox is not a cube map, try to generate a cube map from it.
                if (!isCubeMap) {
                    skybox = EnvLighting.generateSkyboxCubemap(skyBoxAsset.resource as Texture);
                }

                app.scene.skybox = skybox;

                onCleanup(() => {
                    if (app?.scene) {
                        app.scene.skybox = null;
                    }
                });
            },
            { immediate: true }
        );

        /**
         * Sets the environment lighting.
         */
        watch(
            () => sceneProps().envAtlas,
            (envAtlas, _prev, onCleanup) => {
                app.scene.envAtlas = (envAtlas?.resource as Texture) ?? null;

                onCleanup(() => {
                    if (app?.scene) {
                        app.scene.envAtlas = null;
                    }
                });
            },
            { immediate: true }
        );

        /**
         * Sets the remaining environment settings.
         */
        watchEffect(() => {
            const safeSceneProps = sceneProps();
            const safeSkyProps = skyProps();

            app.scene.exposure = safeSceneProps.exposure ?? 1;

            if (safeSkyProps.rotation) {
                app.scene.skyboxRotation = new Quat().setFromEulerAngles(
                    safeSkyProps.rotation[0],
                    safeSkyProps.rotation[1],
                    safeSkyProps.rotation[2]
                );
            }

            if (safeSkyProps.scale) {
                app.scene.sky.node.setLocalScale(...safeSkyProps.scale);
            }

            if (safeSkyProps.position) {
                app.scene.sky.node.setLocalPosition(...safeSkyProps.position);
            }

            if (safeSkyProps.center) {
                app.scene.sky.center.set(...safeSkyProps.center);
            }

            app.scene.sky.type = safeSkyProps.type ?? SKYTYPE_DOME;
            app.scene.sky.depthWrite = safeSkyProps.depthWrite ?? true;

            // Set the skybox mip level
            app.scene.skyboxMip = safeSceneProps.skyboxMip ?? 0;
            app.scene.skyboxLuminance = safeSceneProps.skyboxLuminance ?? 1;
            app.scene.skyboxIntensity = safeSceneProps.skyboxIntensity ?? 1;
            app.scene.skyboxHighlightMultiplier = safeSceneProps.skyboxHighlightMultiplier ?? 1;

            const layer = app?.scene?.layers?.getLayerByName('Skybox');
            if (layer) {
                layer.enabled = safeSkyProps.showSkybox ?? true;
            }
        });

        onScopeDispose(() => {
            /**
             * We have hardcoded the default values for the scene and sky in order to reset them
             *
             * This isn't perfect as any changes the the engine defaults will break this.
             * TODO: Find a better way to reset the scene and sky.
             */
            if (app.scene) {
                app.scene.exposure = 1;
                app.scene.skyboxRotation = new Quat().setFromEulerAngles(0, 0, 0);
                app.scene.sky.node.setLocalScale(1, 1, 1);
                app.scene.sky.node.setLocalPosition(0, 0, 0);
                app.scene.sky.center.set(0, 0.05, 0);
                app.scene.sky.type = SKYTYPE_INFINITE;
                app.scene.sky.depthWrite = false;
                app.scene.skyboxMip = 0;
                app.scene.skyboxLuminance = 0;
                app.scene.skyboxIntensity = 1;
                app.scene.skyboxHighlightMultiplier = 1;
                const layer = app?.scene?.layers?.getLayerByName('Skybox');
                if (layer) {
                    layer.enabled = true;
                }
            }
        });

        return () => null;
    },
    {
        name: 'Environment',
        inheritAttrs: false,
        props: propsFromSchema({
            ...sceneComponentDefinition.schema,
            ...skyComponentDefinition.schema
        } as Schema<EnvironmentProps, unknown>) as never
    }
);
