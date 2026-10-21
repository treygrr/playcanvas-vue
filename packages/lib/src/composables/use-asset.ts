import type { Asset } from 'playcanvas';
import { dracoInitialize, TEXTURETYPE_RGBP } from 'playcanvas';
import type { MaybeRefOrGetter, Ref, ShallowRef } from 'vue';
import { markRaw, ref, shallowRef, toValue, watch } from 'vue';

import type { AssetMeta } from '../utils/fetch-asset.ts';
import { fetchAsset } from '../utils/fetch-asset.ts';
import { warnOnce } from '../utils/validation.ts';

import { useApp } from './use-app.ts';

const base = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
dracoInitialize({
    jsUrl: base + 'draco_wasm_wrapper.js',
    wasmUrl: base + 'draco_decoder.wasm',
    numWorkers: 2,
    lazyInit: true
});

/**
 * Supported asset types that can be loaded
 */
const supportedTypes = ['texture', 'gsplat', 'container', 'model', 'font'];

type AssetResultCallback = (meta: AssetMeta) => void;

type AssetProps = Record<string, unknown>;

/**
 * Result of an asset loading operation. Every field is a ref, so the result can be destructured.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the public composable result declaration
export interface AssetResult {
    /**
     * The loaded asset, or null if not loaded or failed
     * @defaultValue null
     */
    asset: ShallowRef<Asset | null>;
    /**
     * Whether the asset is currently loading, or false if it has loaded or failed
     * @defaultValue true
     */
    loading: Ref<boolean>;
    /**
     * Error message if loading failed, or null if successful
     * @defaultValue null
     */
    error: Ref<string | null>;
    /**
     * Use this to subscribe to loading progress events
     * @param {AssetMeta} meta - The progress of the asset loading.
     * @returns A function that unsubscribes the callback.
     */
    subscribe: (cb: AssetResultCallback) => () => void;
}

/**
 * Simple composable to fetch an asset from the asset registry.
 * The asset is (re)loaded whenever `src`, `type` or `props` change.
 *
 * @param src - The source URL of the asset, or a ref/getter returning it.
 * @param type - The type of the asset (must be one of: texture, gsplat, container, model, font).
 * @param props - Additional properties to pass to the asset loader, or a ref/getter returning them.
 * @returns Refs holding the asset, loading state, and any error.
 *
 * @example
 * ```vue
 * <script setup>
 * const { asset, loading, error } = useAsset('model.glb', 'container');
 * </script>
 *
 * <template>
 *   <Render v-if="asset" type="asset" :asset="asset" />
 * </template>
 * ```
 */
export const useAsset = (
    src: MaybeRefOrGetter<string>,
    type: string,
    props: MaybeRefOrGetter<AssetProps> = {}
): AssetResult => {
    const app = useApp();
    const subscribers = new Set<AssetResultCallback>();

    const subscribe = (cb: AssetResultCallback) => {
        subscribers.add(cb);
        return () => subscribers.delete(cb);
    };

    const asset = shallowRef<Asset | null>(null);
    const loading = ref(true);
    const error = ref<string | null>(null);

    const setResult = (nextAsset: Asset | null, nextLoading: boolean, nextError: string | null) => {
        asset.value = nextAsset ? markRaw(nextAsset) : null;
        loading.value = nextLoading;
        error.value = nextError;
    };

    const onProgress = (meta: AssetMeta) => {
        for (const cb of subscribers) cb(meta);
    };

    // A string key, so that a props object recreated with equal values doesn't reload the asset
    const inputKey = () => {
        const assetProps = toValue(props);
        try {
            return JSON.stringify([
                toValue(src),
                JSON.stringify({ props: assetProps }, Object.keys({ props: assetProps }).sort())
            ]);
        } catch {
            return null;
        }
    };

    watch(
        inputKey,
        (key, _prev, onCleanup) => {
            const url = toValue(src);
            const assetProps = toValue(props);

            if (key === null) {
                const message = `Invalid props for "useAsset('${url}')". \`props\` must be serializable to JSON.`;
                warnOnce(message);
                setResult(null, false, message);
                return;
            }

            // Reset state when inputs change
            setResult(null, true, null);

            // Validate inputs
            if (!url) {
                warnOnce('Asset source URL is required');
                setResult(null, false, 'Asset source URL is required');
                return;
            }

            if (!supportedTypes.includes(type)) {
                warnOnce(`Unsupported asset type: "${type}". Supported types are "${supportedTypes.join('", "')}"`);
                setResult(null, false, `Unsupported asset type: ${type}`);
                return;
            }

            // Ignore the result of a load that has been superseded
            let stale = false;
            onCleanup(() => {
                stale = true;
            });

            // Load the asset
            fetchAsset({ app, url, type, props: assetProps, onProgress })
                .then((loaded) => {
                    if (!stale) setResult(loaded, false, null);
                })
                .catch((err) => {
                    if (stale) return;
                    warnOnce(`Failed to load asset: ${url}`);
                    setResult(null, false, err?.message || `Failed to load asset: ${url}`);
                });
        },
        { immediate: true }
    );

    return { asset, loading, error, subscribe };
};

/**
 * Simple composable to fetch a splat asset from the asset registry.
 *
 * @param src - The source URL of the splat asset.
 * @param props - Additional properties to pass to the asset loader.
 * @returns Refs holding the asset, loading state, and any error.
 *
 * @example
 * const { asset } = useSplat('splat.ply');
 * // <GSplat v-if="asset" :asset="asset" />
 */
export const useSplat = (src: MaybeRefOrGetter<string>, props: MaybeRefOrGetter<AssetProps> = {}): AssetResult =>
    useAsset(src, 'gsplat', props);

/**
 * Simple composable to fetch a texture asset from the asset registry.
 *
 * @param src - The source URL of the texture asset.
 * @param props - Additional properties to pass to the asset loader.
 * @returns Refs holding the asset, loading state, and any error.
 *
 * @example
 * const { asset } = useTexture('texture.jpg');
 */
export const useTexture = (src: MaybeRefOrGetter<string>, props: MaybeRefOrGetter<AssetProps> = {}): AssetResult =>
    useAsset(src, 'texture', props);

/**
 * Simple composable to load an environment atlas texture asset.
 *
 * @param src - The source URL of the environment atlas texture.
 * @param props - Additional properties to pass to the asset loader.
 * @returns Refs holding the asset, loading state, and any error.
 *
 * @example
 * const { asset } = useEnvAtlas('env.jpg');
 * // <Environment v-if="asset" :env-atlas="asset" />
 */
export const useEnvAtlas = (src: MaybeRefOrGetter<string>, props: MaybeRefOrGetter<AssetProps> = {}): AssetResult =>
    useAsset(src, 'texture', () => {
        const assetProps = toValue(props);
        return {
            ...assetProps,
            data: { type: TEXTURETYPE_RGBP, mipmaps: false, ...((assetProps.data as AssetProps) ?? {}) }
        };
    });

/**
 * Simple composable to load a 3D model asset (GLB/GLTF).
 *
 * @param src - The source URL of the 3D model.
 * @param props - Additional properties to pass to the asset loader.
 * @returns Refs holding the asset, loading state, and any error.
 *
 * @example
 * const { asset } = useModel('model.glb');
 * // <Container v-if="asset" :asset="asset" />
 */
export const useModel = (src: MaybeRefOrGetter<string>, props: MaybeRefOrGetter<AssetProps> = {}): AssetResult =>
    useAsset(src, 'container', props);

/**
 * Simple composable to load a font asset.
 *
 * Fonts are described as SDF textures, so you'll need to convert your .ttf files to SDF textures.
 *
 * Learn more about SDF textures {@link https://developer.playcanvas.com/user-manual/playcanvas-react/api/hooks/use-asset#usefont}.
 *
 * @param src - The source URL of the font asset.
 * @param props - Additional properties to pass to the asset loader.
 * @returns Refs holding the asset, loading state, and any error.
 *
 * @example
 * import roboto from '@assets/fonts/roboto.json?url';
 * const { asset } = useFont(roboto);
 */
export const useFont = (src: MaybeRefOrGetter<string>, props: MaybeRefOrGetter<AssetProps> = {}): AssetResult =>
    useAsset(src, 'font', props);
