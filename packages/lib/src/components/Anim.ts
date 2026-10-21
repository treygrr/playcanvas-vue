import type { AnimComponent, AnimTrack, ContainerResource } from 'playcanvas';
import { Entity, Asset } from 'playcanvas';
import { defineComponent, watch } from 'vue';

import { useComponent } from '../composables/use-component.ts';
import { validateEngineProps } from '../utils/engine-props.ts';
import type { PublicProps, Serializable } from '../utils/types-utils.ts';
import { createComponentDefinition, getStaticNullApplication } from '../utils/validation.ts';
import { propsFromSchema, warnUnknownAttrs } from '../utils/vue-props.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the inherited engine props
export interface AnimProps extends Partial<Serializable<PublicProps<AnimComponent>>> {
    /**
     * The asset containing the animations to play. Setting this prop will automatically assign the animations to the component.
     * @type {Asset}
     */
    asset?: Asset;
}

const componentDefinition = createComponentDefinition<AnimProps, AnimComponent>(
    'Anim',
    () => new Entity('mock-anim', getStaticNullApplication()).addComponent('anim') as AnimComponent,
    (component) => (component as AnimComponent).system.destroy()
);

componentDefinition.schema = {
    ...componentDefinition.schema,
    asset: {
        validate: (value: unknown) => !value || value instanceof Asset,
        errorMsg: (value: unknown) => `Invalid value for prop "asset": ${value}. Expected an Asset.`,
        default: undefined
    }
};

/**
 * The Anim component allows an entity to play animations.
 * GLB's and GLTF's often contain animations. When you attach this component to an entity,
 * it will automatically animate them. You'll also need a Render component to display the entity.
 *
 * @see https://api.playcanvas.com/engine/classes/AnimComponent.html
 *
 * @example
 * <Entity>
 *   <Render type="asset" :asset="asset" />
 *   <Anim :asset="asset" />
 * </Entity>
 */
export const Anim = defineComponent(
    (props: AnimProps, { attrs }) => {
        warnUnknownAttrs(attrs, componentDefinition);

        // Create the anim component
        const anim = useComponent(
            'anim',
            () => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the asset is assigned separately
                const { asset, ...safeProps } = validateEngineProps(props, componentDefinition, true);
                return safeProps;
            },
            componentDefinition.schema
        );

        // Assign Asset animations to Anim component
        watch(
            [() => props.asset, anim],
            ([asset, component]) => {
                const resource = asset?.resource as ContainerResource | undefined;

                // Early out if component instantiation fails, or the asset contains no animations
                if (!component || !resource?.animations || resource.animations.length === 0) return;

                // Filter out non animations, and assign animations to component
                resource.animations
                    .filter((animation) => animation.type === 'animation')
                    .forEach((animation) => {
                        (component as AnimComponent).assignAnimation('animation', animation.resource as AnimTrack);
                    });
            },
            { immediate: true }
        );

        return () => null;
    },
    { name: 'Anim', inheritAttrs: false, props: propsFromSchema(componentDefinition.schema) as never }
);
