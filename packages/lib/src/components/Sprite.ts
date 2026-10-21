import type { SpriteComponent } from 'playcanvas';
import { Asset, Entity } from 'playcanvas';
import { defineComponent } from 'vue';

import { useComponent } from '../composables/use-component.ts';
import { validateEngineProps } from '../utils/engine-props.ts';
import type { PublicProps } from '../utils/types-utils.ts';
import type { Schema } from '../utils/validation.ts';
import { createComponentDefinition, getStaticNullApplication } from '../utils/validation.ts';
import { propsFromSchema, warnUnknownAttrs } from '../utils/vue-props.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the inherited engine props
export interface SpriteProps extends Partial<PublicProps<SpriteComponent>> {
    asset?: Asset;
}

const componentDefinition = createComponentDefinition<SpriteProps, SpriteComponent>(
    'Sprite',
    () => new Entity('mock-sprite', getStaticNullApplication()).addComponent('sprite') as SpriteComponent,
    (component) => (component as SpriteComponent).system.destroy(),
    { apiName: 'SpriteComponent' }
);

componentDefinition.schema = {
    ...componentDefinition.schema,
    asset: {
        validate: (value: unknown) => value instanceof Asset,
        errorMsg: (value: unknown) => `Invalid value for prop "asset": "${value}". Expected an Asset.`,
        default: null
    }
} as Schema<SpriteProps, SpriteComponent>;

/**
 * The Sprite component allows an entity to render a 2D sprite.
 *
 * @see https://api.playcanvas.com/engine/classes/SpriteComponent.html
 * @example
 * <Entity>
 *   <Sprite :asset="asset" />
 * </Entity>
 */
export const Sprite = defineComponent(
    (props: SpriteProps, { attrs }) => {
        warnUnknownAttrs(attrs, componentDefinition);
        useComponent('sprite', () => validateEngineProps(props, componentDefinition, true), componentDefinition.schema);
        return () => null;
    },
    { name: 'Sprite', inheritAttrs: false, props: propsFromSchema(componentDefinition.schema) as never }
);
