import type { Entity } from 'playcanvas';
import type { PropType, SlotsType, VNode } from 'vue';
import { defineComponent, h, shallowRef, watch } from 'vue';

import type { ApplicationProps } from '../Application.ts';
import { Application } from '../Application.ts';

import { EditorScene } from './EditorScene.ts';
import type { EditorConfig, EditorManifest } from './manifest.ts';
import { createEditorManifest, joinUrl } from './manifest.ts';

/**
 * The `<Application>` props an Editor export needs: its input devices, graphics settings, and where its
 * assets and scripts are served from. UI element input is always enabled, as Editor UIs rely on it.
 *
 * @param manifest The manifest of the export.
 * @param base The base URL the export is served from.
 */
export function editorApplicationProps(manifest: EditorManifest, base: string): ApplicationProps {
    const { input, device, scriptsOrder } = manifest;

    return {
        deviceTypes: device.deviceTypes,
        graphicsDeviceOptions: {
            antialias: device.antialias,
            alpha: device.alpha,
            preserveDrawingBuffer: device.preserveDrawingBuffer,
            powerPreference: device.powerPreference as GPUPowerPreference
        },
        useMouse: input.mouse,
        useTouch: input.touch,
        useKeyboard: input.keyboard,
        useGamepads: input.gamepads,
        useElementInput: true,
        assetPrefix: base.replace(/\/?$/, '/'),
        scriptsOrder
    };
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the public prop declaration
export interface EditorProjectProps {
    /** The base URL of an unzipped Editor export, the folder holding its `config.json` */
    src: string;
    /** The manifest of the export. When omitted, it is created from the export's `config.json` */
    manifest?: EditorManifest;
    /** The name or URL of the scene to load. Defaults to the first scene */
    scene?: string;
    /**
     * Apply the project's canvas fill and resolution settings, eg to fill the window like the Editor launch page.
     * @default false
     */
    useProjectCanvasSettings?: boolean;
}

/**
 * Plays a PlayCanvas Editor export: creates an application with the project's settings, and loads its scene.
 * Attributes are passed on to the `<Application>`, so `class`, `style` and application props work as usual.
 *
 * @example
 * <!-- the export unzipped into public/exports/my-project/ -->
 * <EditorProject src="/exports/my-project/" class="h-96">
 *   <template #loading>Loading…</template>
 * </EditorProject>
 */
export const EditorProject = defineComponent(
    (props: EditorProjectProps, { slots, attrs, emit }) => {
        const fetched = shallowRef<EditorManifest | null>(null);
        const error = shallowRef<Error | null>(null);

        watch(
            () => [props.src, props.manifest] as const,
            async ([src, manifest], _prev, onCleanup) => {
                let cancelled = false;
                onCleanup(() => {
                    cancelled = true;
                });

                fetched.value = null;
                error.value = null;
                if (manifest) return;

                try {
                    const response = await fetch(joinUrl(src, 'config.json'));
                    if (!response.ok) throw new Error(`Failed to load ${response.url}: ${response.status}`);
                    const config = (await response.json()) as EditorConfig;
                    if (!cancelled) fetched.value = createEditorManifest(config);
                } catch (err) {
                    if (cancelled) return;
                    error.value = err instanceof Error ? err : new Error(String(err));
                    emit('error', error.value);
                }
            },
            { immediate: true }
        );

        return () => {
            const manifest = props.manifest ?? fetched.value;
            if (error.value) return slots.error?.({ error: error.value });
            if (!manifest) return slots.loading?.();

            const base = props.src.replace(/\/?$/, '/');
            return h(
                Application,
                {
                    ...editorApplicationProps(manifest, base),
                    ...(props.useProjectCanvasSettings
                        ? {
                              fillMode: manifest.canvas.fillMode as ApplicationProps['fillMode'],
                              resolutionMode: manifest.canvas.resolutionMode as ApplicationProps['resolutionMode']
                          }
                        : {}),
                    ...attrs
                },
                () =>
                    h(
                        EditorScene,
                        {
                            manifest,
                            base,
                            scene: props.scene,
                            useProjectCanvasSettings: props.useProjectCanvasSettings,
                            onLoaded: (root: Entity) => emit('loaded', root),
                            onError: (err: Error) => emit('error', err)
                        },
                        slots
                    )
            );
        };
    },
    {
        name: 'EditorProject',
        inheritAttrs: false,
        props: {
            src: { type: String, required: true },
            manifest: { type: Object as PropType<EditorManifest>, default: undefined },
            scene: { type: String, default: undefined },
            useProjectCanvasSettings: { type: Boolean, default: false }
        },
        emits: {
            loaded: (root: Entity) => Boolean(root),
            error: (error: Error) => error instanceof Error
        },
        slots: Object as SlotsType<{
            default?: () => VNode[];
            loading?: () => VNode[];
            error?: (props: { error: Error }) => VNode[];
        }>
    }
);
