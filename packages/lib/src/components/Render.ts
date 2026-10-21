import { Asset, Entity } from 'playcanvas';
import type { RenderComponent as PcRenderComponent } from 'playcanvas';
import type { SlotsType, VNode } from 'vue';
import { defineComponent, h } from 'vue';

import { useComponent } from '../composables/use-component.ts';
import { Container } from '../Container.ts';
import { validateEngineProps } from '../utils/engine-props.ts';
import type { PublicProps } from '../utils/types-utils.ts';
import { createComponentDefinition, getStaticNullApplication } from '../utils/validation.ts';
import { definedProps, propsFromSchema, warnUnknownAttrs } from '../utils/vue-props.ts';

const primitiveTypes = ['asset', 'box', 'capsule', 'cone', 'cylinder', 'plane', 'sphere', 'torus'] as const;
type PrimitiveType = (typeof primitiveTypes)[number];

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the inherited engine props
export interface RenderProps extends Omit<Partial<PublicProps<PcRenderComponent>>, 'asset' | 'type'> {
    /**
     * The type of primitive shape to render.
     * @default "box"
     */
    type?: PrimitiveType;
    /**
     * The asset to render.
     */
    asset?: Asset;
}

const componentDefinition = createComponentDefinition<RenderProps, PcRenderComponent>(
    'Render',
    () => new Entity('mock-render', getStaticNullApplication()).addComponent('render') as PcRenderComponent,
    (component) => (component as PcRenderComponent).system.destroy(),
    { apiName: 'RenderComponent' }
);

componentDefinition.schema = {
    ...componentDefinition.schema,
    asset: {
        validate: (value: unknown) => !value || value instanceof Asset,
        errorMsg: (value: unknown) => `Invalid value for prop "asset": ${value}. Expected an Asset.`,
        default: undefined
    },
    type: {
        validate: (value: unknown) => typeof value === 'string' && primitiveTypes.includes(value as PrimitiveType),
        errorMsg: (value: unknown) =>
            `Invalid value for prop "type": ${value}. Expected one of: "${primitiveTypes.join('", "')}".`,
        default: 'box'
    }
};

const renderProps = propsFromSchema(componentDefinition.schema);
const renderKeys = Object.keys(componentDefinition.schema);

const RenderComponent = defineComponent(
    (props: RenderProps) => {
        useComponent('render', () => validateEngineProps(props, componentDefinition), componentDefinition.schema);
        return () => null;
    },
    { name: 'RenderComponent', props: renderProps as never }
);

/**
 * A Render component allows an entity to render a 3D model. You can specify the type of model to render with the `type` prop,
 * which can be a primitive shape, or a model asset.
 *
 * @see https://api.playcanvas.com/engine/classes/RenderComponent.html
 *
 * @example
 * <Entity name="Box">
 *   <Render type="box" />
 * </Entity>
 *
 * @example
 * const { asset } = useModel('./statue.glb');
 * // <Render type="asset" :asset="asset" />
 */
export const Render = defineComponent(
    (props: RenderProps, { attrs, slots }) => {
        warnUnknownAttrs(attrs, componentDefinition);

        return () => {
            const { type, asset } = props;

            // Don't render if the type is asset and the asset is not provided
            if (type === 'asset' && !asset) return null;

            // Render a container if the asset is a container
            if (asset?.type === 'container') {
                return h(Container, { asset }, slots);
            }

            // Otherwise, render the component
            return h(RenderComponent, definedProps(props, renderKeys));
        };
    },
    {
        name: 'Render',
        inheritAttrs: false,
        props: renderProps as never,
        slots: Object as SlotsType<{ default?: () => VNode[] }>
    }
);

export { componentDefinition as renderComponentDefinition };
