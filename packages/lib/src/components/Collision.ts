import type { CollisionComponent } from 'playcanvas';
import { Entity } from 'playcanvas';
import { defineComponent } from 'vue';

import { useComponent } from '../composables/use-component.ts';
import { useParent } from '../composables/use-parent.ts';
import { validateEngineProps } from '../utils/engine-props.ts';
import type { PublicProps, Serializable } from '../utils/types-utils.ts';
import { createComponentDefinition, getStaticNullApplication } from '../utils/validation.ts';
import { propsFromSchema, warnUnknownAttrs } from '../utils/vue-props.ts';

import { usePhysicsWarnings } from './physics-warnings.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the inherited engine props
export interface CollisionProps extends Partial<Serializable<PublicProps<CollisionComponent>>> {
    type?: 'box' | 'capsule' | 'compound' | 'cone' | 'cylinder' | 'mesh' | 'sphere';
}

const componentDefinition = createComponentDefinition<CollisionProps, CollisionComponent>(
    'Collision',
    () => new Entity('mock-collision', getStaticNullApplication()).addComponent('collision') as CollisionComponent,
    (component) => (component as CollisionComponent).system.destroy(),
    { apiName: 'CollisionComponent' }
);

componentDefinition.schema = {
    ...componentDefinition.schema,
    type: {
        validate: (value: unknown) =>
            typeof value === 'string' &&
            ['box', 'capsule', 'compound', 'cone', 'cylinder', 'mesh', 'sphere'].includes(value as string),
        errorMsg: (value: unknown) =>
            `Invalid value for prop "type": ${value}. Expected one of: "box", "capsule", "compound", "cone", "cylinder", "mesh", "sphere".`,
        default: 'box'
    }
};

/**
 * The Collision component adds a collider to the entity. This enables the entity to collide with other entities.
 * You can manually define the shape of the collider with the `type` prop, or let the component infer the shape from a `Render` component.
 * @see https://api.playcanvas.com/engine/classes/CollisionComponent.html
 *
 * @example
 * <Entity>
 *   <Collision type="box" />
 *   <Render /> <!-- the shape is inferred from the render component -->
 * </Entity>
 */
export const Collision = defineComponent(
    (props: CollisionProps, { attrs }) => {
        warnUnknownAttrs(attrs, componentDefinition);
        const entity = useParent();
        const physics = usePhysicsWarnings('Collision', '<Collision type="box" />');

        // The component is only added once the physics library has loaded
        useComponent(
            () => (physics.isPhysicsLoaded ? 'collision' : null),
            () => {
                const safeProps = validateEngineProps(props, componentDefinition);
                // If no type is defined, infer if possible from a render component
                if (props.type === undefined && entity.render) {
                    safeProps.type = entity.render.type as CollisionProps['type'];
                }
                return safeProps;
            },
            componentDefinition.schema
        );

        return () => null;
    },
    { name: 'Collision', inheritAttrs: false, props: propsFromSchema(componentDefinition.schema) as never }
);
