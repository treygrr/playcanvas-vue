import type { LightComponent } from 'playcanvas';
import { Entity } from 'playcanvas';
import { defineComponent } from 'vue';

import { useComponent } from '../composables/use-component.ts';
import { validateEngineProps } from '../utils/engine-props.ts';
import type { PublicProps, Serializable } from '../utils/types-utils.ts';
import type { Schema } from '../utils/validation.ts';
import { createComponentDefinition, getStaticNullApplication } from '../utils/validation.ts';
import { propsFromSchema, warnUnknownAttrs } from '../utils/vue-props.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the inherited engine props
export interface LightProps extends Partial<Serializable<PublicProps<LightComponent>>> {
    /**
     * The type of the light.
     * @default "directional"
     */
    type?: 'directional' | 'omni' | 'spot';
}

const componentDefinition = createComponentDefinition<LightProps, LightComponent>(
    'Light',
    () => new Entity('mock-light', getStaticNullApplication()).addComponent('light') as LightComponent,
    (component) => (component as LightComponent).system.destroy(),
    { apiName: 'LightComponent' }
);

componentDefinition.schema = {
    ...componentDefinition.schema,
    type: {
        validate: (value: unknown) =>
            typeof value === 'string' && ['directional', 'omni', 'spot'].includes(value as string),
        errorMsg: (value: unknown) =>
            `Invalid value for prop "type": ${value}. Expected one of: "directional", "omni", "spot".`,
        default: 'directional'
    }
} as Schema<LightProps, LightComponent>;

/**
 * The Light component adds a light source to the entity. A light can be a directional, omni, or spot light.
 * Lights can be moved and orientated with the `position` and `rotation` props of its entity.
 *
 * @see https://api.playcanvas.com/engine/classes/LightComponent.html
 *
 * @example
 * <Entity :rotation="[0, 10, 0]">
 *   <Light type="directional" />
 * </Entity>
 */
export const Light = defineComponent(
    (props: LightProps, { attrs }) => {
        warnUnknownAttrs(attrs, componentDefinition);
        useComponent('light', () => validateEngineProps(props, componentDefinition, true), componentDefinition.schema);
        return () => null;
    },
    { name: 'Light', inheritAttrs: false, props: propsFromSchema(componentDefinition.schema) as never }
);

export { componentDefinition as lightComponentDefinition };
