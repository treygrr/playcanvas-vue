import type { ScreenComponent } from 'playcanvas';
import { Entity, Vec2 } from 'playcanvas';
import { defineComponent } from 'vue';

import { useComponent } from '../composables/use-component.ts';
import { validateEngineProps } from '../utils/engine-props.ts';
import type { PublicProps, Serializable } from '../utils/types-utils.ts';
import type { Schema } from '../utils/validation.ts';
import { createComponentDefinition, getStaticNullApplication } from '../utils/validation.ts';
import { propsFromSchema, warnUnknownAttrs } from '../utils/vue-props.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the inherited engine props
export interface ScreenProps extends Partial<Serializable<PublicProps<ScreenComponent>>> {
    /**
     * Whether the screen is rendered in screen space.
     * @default true
     */
    screenSpace?: boolean;
    /**
     * The reference resolution of the screen.
     * @default [1280, 720]
     */
    referenceResolution?: [number, number];
    /**
     * The scale mode of the screen.
     * @default "blend"
     */
    scaleMode?: 'blend' | 'stretch' | 'fit';
}

const componentDefinition = createComponentDefinition<ScreenProps, ScreenComponent>(
    'Screen',
    () => new Entity('mock-screen', getStaticNullApplication()).addComponent('screen') as ScreenComponent,
    (component) => (component as ScreenComponent).system.destroy(),
    { apiName: 'ScreenComponent' }
);

componentDefinition.schema = {
    ...componentDefinition.schema,
    screenSpace: {
        validate: (value: unknown) => typeof value === 'boolean',
        errorMsg: (value: unknown) => `Invalid value for prop "screenSpace": ${value}. Expected a boolean.`,
        default: true
    },
    referenceResolution: {
        validate: (value: unknown) =>
            Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number'),
        errorMsg: (value: unknown) =>
            `Invalid value for prop "referenceResolution": ${value}. Expected a tuple of [number, number].`,
        default: [1280, 720],
        // The engine setter reads `value.x`/`value.y`, so convert the array to a Vec2.
        apply: (instance, props, key) => {
            (instance[key as keyof ScreenComponent] as Vec2) = new Vec2().fromArray(props[key] as number[]);
        }
    },
    scaleMode: {
        validate: (value: unknown) =>
            typeof value === 'string' && ['blend', 'stretch', 'fit'].includes(value as string),
        errorMsg: (value: unknown) =>
            `Invalid value for prop "scaleMode": ${value}. Expected one of: "blend", "stretch", "fit".`,
        default: 'blend'
    }
} as Schema<ScreenProps, ScreenComponent>;

/**
 * The Screen component allows an entity to render a 2D screen space UI element.
 * This is useful for creating UI elements that are rendered in screen space rather than world space.
 *
 * @see https://api.playcanvas.com/engine/classes/ScreenComponent.html
 *
 * @example
 * <Entity>
 *   <Screen screen-space />
 * </Entity>
 */
export const Screen = defineComponent(
    (props: ScreenProps, { attrs }) => {
        warnUnknownAttrs(attrs, componentDefinition);
        useComponent('screen', () => validateEngineProps(props, componentDefinition, true), componentDefinition.schema);
        return () => null;
    },
    { name: 'Screen', inheritAttrs: false, props: propsFromSchema(componentDefinition.schema) as never }
);
