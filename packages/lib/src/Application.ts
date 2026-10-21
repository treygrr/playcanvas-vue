import {
    FILLMODE_NONE,
    FILLMODE_FILL_WINDOW,
    FILLMODE_KEEP_ASPECT,
    RESOLUTION_AUTO,
    Application as PlayCanvasApplication,
    Mouse,
    TouchDevice,
    RESOLUTION_FIXED,
    DEVICETYPE_WEBGL2,
    DEVICETYPE_WEBGPU,
    DEVICETYPE_NULL
} from 'playcanvas';
import type { MaybeRef, PropType, SlotsType, VNode } from 'vue';
import {
    computed,
    defineComponent,
    h,
    markRaw,
    mergeProps,
    provide,
    shallowRef,
    toValue,
    watch,
    watchEffect
} from 'vue';

import { provideParent } from './composables/use-parent.ts';
import { AppKey, PointerEventsKey } from './contexts/keys.ts';
import { providePhysics } from './contexts/physics.ts';
import type { GraphicsDeviceOptions } from './types/graphics-device-options.ts';
import { defaultGraphicsDeviceOptions } from './types/graphics-device-options.ts';
import type { DeviceType } from './utils/create-graphics-device.ts';
import { internalCreateGraphicsDevice } from './utils/create-graphics-device.ts';
import { env } from './utils/env.ts';
import { createPicker } from './utils/picker.ts';
import type { PublicProps } from './utils/types-utils.ts';
import { definedProps, propsFromSchema } from './utils/vue-props.ts';
import type { Schema } from './utils/validation.ts';
import {
    validatePropsWithDefaults,
    validatePropsPartial,
    createComponentDefinition,
    getNullApplication,
    applyProps
} from './utils/validation.ts';

// These props are excluded from the <Application/> component props.
type ExcludedApplicationProps = 'mouse' | 'touch' | 'keyboard' | 'gamepads' | 'scene' | 'scripts' | 'assets';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- interfaces preserve inherited prop overrides
export interface ApplicationProps extends Omit<Partial<PublicProps<PlayCanvasApplication>>, ExcludedApplicationProps> {
    /**
     * Controls how the canvas fills the window and resizes when the window changes.
     * @default FILLMODE_NONE
     */
    fillMode?: typeof FILLMODE_NONE | typeof FILLMODE_FILL_WINDOW | typeof FILLMODE_KEEP_ASPECT;

    /**
     * Change the resolution of the canvas, and set the way it behaves when the window is resized.
     * @default RESOLUTION_AUTO
     */
    resolutionMode?: typeof RESOLUTION_AUTO | typeof RESOLUTION_FIXED;

    /**
     * When `true`, the PlayCanvas Physics system will be enabled.
     * @default false
     */
    usePhysics?: boolean;

    /**
     * The device types to use for the graphics device. This allows you to set an order of preference for the graphics device.
     * The first device type in the array that is supported by the browser will be used.
     *
     * @example
     * <Application :device-types="[DEVICETYPE_WEBGPU, DEVICETYPE_WEBGL2]" />
     *
     * This will use the WebGPU device if it is supported, otherwise it will use the WebGL2 device.
     *
     * @default [DEVICETYPE_WEBGL2]
     */
    deviceTypes?: DeviceType[];

    /** Graphics Settings */
    graphicsDeviceOptions?: GraphicsDeviceOptions;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- interfaces preserve inherited prop overrides
export interface ApplicationWithoutCanvasProps extends ApplicationProps {
    /** The canvas element to render to, or a ref to it */
    canvas: MaybeRef<HTMLCanvasElement | null | undefined>;
}

const exclude: ExcludedApplicationProps[] = ['mouse', 'touch', 'keyboard', 'gamepads', 'scene', 'scripts', 'assets'];

const componentDefinition = createComponentDefinition<ApplicationWithoutCanvasProps, PlayCanvasApplication>(
    'Application',
    () => getNullApplication(),
    (app) => app.destroy(),
    { exclude }
);

// Props configuring the application itself, rather than being applied to it
const configSchema = {
    deviceTypes: {
        validate: (value: unknown) =>
            Array.isArray(value) &&
            value.every(
                (v: unknown) =>
                    typeof v === 'string' &&
                    [DEVICETYPE_WEBGPU, DEVICETYPE_WEBGL2, DEVICETYPE_NULL].includes(
                        v as typeof DEVICETYPE_WEBGPU | typeof DEVICETYPE_WEBGL2 | typeof DEVICETYPE_NULL
                    )
            ),
        errorMsg: (value: unknown) => {
            return `deviceTypes must be an array containing one or more of: '${DEVICETYPE_WEBGPU}', '${DEVICETYPE_WEBGL2}', '${DEVICETYPE_NULL}'. Received: ['${value}']`;
        },
        /**
         * In test environments, we default to a Null device, because we can't use WebGL2/WebGPU.
         * This is just for testing purposes so we can test the fallback logic, without initializing WebGL2/WebGPU.
         */
        default: env === 'test' ? [DEVICETYPE_NULL] : [DEVICETYPE_WEBGL2]
    },
    usePhysics: {
        validate: (value: unknown) => typeof value === 'boolean',
        errorMsg: (value: unknown) => `usePhysics must be a boolean. Received: ${value}`,
        default: false
    },
    fillMode: {
        validate: (value: unknown) =>
            typeof value === 'string' &&
            [FILLMODE_NONE, FILLMODE_FILL_WINDOW, FILLMODE_KEEP_ASPECT].includes(
                value as typeof FILLMODE_NONE | typeof FILLMODE_FILL_WINDOW | typeof FILLMODE_KEEP_ASPECT
            ),
        errorMsg: () => `"fillMode" must be one of: ${FILLMODE_NONE}, ${FILLMODE_FILL_WINDOW}, ${FILLMODE_KEEP_ASPECT}`,
        default: FILLMODE_NONE
    },
    resolutionMode: {
        validate: (value: unknown) =>
            typeof value === 'string' &&
            [RESOLUTION_AUTO, RESOLUTION_FIXED].includes(value as typeof RESOLUTION_AUTO | typeof RESOLUTION_FIXED),
        errorMsg: () => `"resolutionMode" must be one of: ${RESOLUTION_AUTO}, ${RESOLUTION_FIXED}`,
        default: RESOLUTION_AUTO
    },
    graphicsDeviceOptions: {
        validate: (value: unknown) => value === undefined || (typeof value === 'object' && value !== null),
        errorMsg: (value: unknown) => `graphicsDeviceOptions must be an object. Received: ${value}`,
        default: undefined
    }
} as Schema<ApplicationWithoutCanvasProps, PlayCanvasApplication>;

const configKeys = Object.keys(configSchema);
const appKeys = Object.keys(componentDefinition.schema).filter((key) => !configKeys.includes(key));

const configDefinition = { name: 'Application', schema: configSchema };

const applicationProps = propsFromSchema({
    ...componentDefinition.schema,
    ...configSchema
} as Schema<ApplicationProps, PlayCanvasApplication>);

/**
 * Provides the application, its root entity, pointer events and physics to its descendants.
 * It is keyed by the application, so the whole scene remounts if the application is recreated.
 */
const AppProvider = defineComponent(
    (props: { app: PlayCanvasApplication; pointerEvents: Set<string>; usePhysics: boolean }, { slots }) => {
        provide(AppKey, props.app);
        provide(PointerEventsKey, props.pointerEvents);
        provideParent(props.app.root);
        providePhysics(props.app, () => props.usePhysics);

        return () => slots.default?.();
    },
    { name: 'AppProvider', props: ['app', 'pointerEvents', 'usePhysics'] }
);

/**
 * An alternative Application component that does not create a canvas element.
 * This allows you to create a canvas independently from PlayCanvas and pass it in.
 *
 * @example
 * <script setup>
 * const canvas = ref(null);
 * </script>
 *
 * <template>
 *   <canvas ref="canvas" />
 *   <ApplicationWithoutCanvas :canvas="canvas">
 *     <Entity />
 *   </ApplicationWithoutCanvas>
 * </template>
 */
export const ApplicationWithoutCanvas = defineComponent(
    (props: ApplicationWithoutCanvasProps, { slots }) => {
        const config = computed(() =>
            validatePropsWithDefaults(
                definedProps(props, configKeys) as ApplicationWithoutCanvasProps,
                configDefinition
            )
        );

        // Recreate the application only when the *values* of the device settings change
        const deviceKey = computed(() => {
            const { deviceTypes = [], graphicsDeviceOptions } = config.value;
            const graphicsOptsKey = graphicsDeviceOptions
                ? Object.entries(graphicsDeviceOptions)
                      .sort(([a], [b]) => a.localeCompare(b)) // order-insensitive
                      .map(([k, v]) => `${k}:${String(v)}`)
                      .join('|')
                : 'none';
            return `${deviceTypes.join('-')}/${graphicsOptsKey}`;
        });

        const app = shallowRef<PlayCanvasApplication | null>(null);
        const pointerEvents = new Set<string>();

        watch(
            [() => toValue(props.canvas), deviceKey],
            ([canvas], _prev, onCleanup) => {
                // Tracks if the application is torn down while awaiting the graphics device
                let cancelled = false;
                let pcApp: PlayCanvasApplication | null = null;
                let disposePicker: (() => void) | null = null;

                onCleanup(() => {
                    cancelled = true;
                    disposePicker?.();
                    if (pcApp) {
                        pcApp.destroy();
                        app.value = null;
                    }
                });

                if (!canvas) return;

                const { deviceTypes, graphicsDeviceOptions } = config.value;

                (async () => {
                    // Create the graphics device
                    const dev = await internalCreateGraphicsDevice(canvas, {
                        deviceTypes,
                        ...defaultGraphicsDeviceOptions,
                        ...graphicsDeviceOptions
                    });

                    // Bail out if torn down while we were awaiting, destroying the device immediately
                    if (cancelled) {
                        dev.destroy?.();
                        return;
                    }

                    // Proceed with normal PlayCanvas init
                    pcApp = markRaw(
                        new PlayCanvasApplication(canvas, {
                            mouse: new Mouse(canvas),
                            touch: new TouchDevice(canvas),
                            graphicsDevice: dev
                        })
                    );
                    pcApp.start();

                    disposePicker = createPicker(pcApp, canvas, pointerEvents);
                    app.value = pcApp;
                })();
            },
            { immediate: true }
        );

        // Update the canvas fill and resolution modes
        watchEffect(() => {
            const pcApp = app.value;
            if (!pcApp) return;
            const { fillMode = FILLMODE_NONE, resolutionMode = RESOLUTION_AUTO } = config.value;
            pcApp.setCanvasFillMode(fillMode);
            pcApp.setCanvasResolution(resolutionMode);
        });

        // These app properties can be updated without recreating the application
        watchEffect(() => {
            const appProps = definedProps(props, appKeys);
            const pcApp = app.value;
            if (!pcApp) return;
            const safeProps = validatePropsPartial(appProps as ApplicationWithoutCanvasProps, componentDefinition);
            applyProps(pcApp, componentDefinition.schema, safeProps as unknown as Record<string, unknown>);
        });

        return () =>
            app.value
                ? h(
                      AppProvider,
                      {
                          key: app.value.root.getGuid(),
                          app: app.value,
                          pointerEvents,
                          usePhysics: config.value.usePhysics ?? false
                      },
                      slots
                  )
                : null;
    },
    {
        name: 'ApplicationWithoutCanvas',
        props: {
            ...applicationProps,
            // Untyped, as the canvas is null until a template ref resolves
            canvas: { type: null as unknown as PropType<MaybeRef<HTMLCanvasElement | null | undefined>>, default: null }
        } as never,
        slots: Object as SlotsType<{ default?: () => VNode[] }>
    }
);

/**
 * The **Application** component is the root node of the PlayCanvas Vue API. It creates a canvas element
 * and initializes a PlayCanvas application instance. Attributes like `class` and `style` are applied
 * to the canvas.
 *
 * @example
 * <Application>
 *   <Entity />
 * </Application>
 */
export const Application = defineComponent(
    (props: ApplicationProps, { slots, attrs }) => {
        const canvas = shallowRef<HTMLCanvasElement | null>(null);

        return () => [
            h(
                'canvas',
                mergeProps(
                    {
                        ref: canvas,
                        class: 'pc-app',
                        style: { width: '100%', height: '100%' },
                        'aria-label': 'Interactive 3D Scene'
                    },
                    attrs
                )
            ),
            h(ApplicationWithoutCanvas, { ...definedProps(props, Object.keys(applicationProps)), canvas }, slots)
        ];
    },
    {
        name: 'Application',
        inheritAttrs: false,
        props: applicationProps as never,
        slots: Object as SlotsType<{ default?: () => VNode[] }>
    }
);
