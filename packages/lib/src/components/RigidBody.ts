import type { RigidBodyComponent } from 'playcanvas';
import { BODYTYPE_STATIC, BODYTYPE_DYNAMIC, BODYTYPE_KINEMATIC, Entity } from 'playcanvas';
import { defineComponent } from 'vue';

import { useComponent } from '../composables/use-component.ts';
import { validateEngineProps } from '../utils/engine-props.ts';
import type { PublicProps, Serializable } from '../utils/types-utils.ts';
import { createComponentDefinition, getStaticNullApplication } from '../utils/validation.ts';
import { propsFromSchema, warnUnknownAttrs } from '../utils/vue-props.ts';

import { usePhysicsWarnings } from './physics-warnings.ts';

const rigidBodyTypes = [BODYTYPE_STATIC, BODYTYPE_DYNAMIC, BODYTYPE_KINEMATIC] as const;
type RigidBodyType = (typeof rigidBodyTypes)[number];

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the inherited engine props
export interface RigidBodyProps extends Partial<Serializable<PublicProps<RigidBodyComponent>>> {
    /**
     * Sets the rigid body type determines how the body is simulated.
     * @default "static"
     */
    type?: RigidBodyType;
}

const componentDefinition = createComponentDefinition<RigidBodyProps, RigidBodyComponent>(
    'RigidBody',
    () => new Entity('mock-rigidbody', getStaticNullApplication()).addComponent('rigidbody') as RigidBodyComponent,
    (component) => (component as RigidBodyComponent).system.destroy(),
    { apiName: 'RigidBodyComponent' }
);

componentDefinition.schema = {
    ...componentDefinition.schema,
    type: {
        validate: (value: unknown) => typeof value === 'string' && rigidBodyTypes.includes(value as RigidBodyType),
        errorMsg: (value: unknown) =>
            `Invalid value for prop "type": ${value}. Expected one of: "${rigidBodyTypes.join(', ')}".`,
        default: 'static'
    }
};

/**
 * Adding a RigidBody component to an entity allows it to participate in the physics simulation.
 * Rigid bodies have mass, and can be moved around by forces. Ensure `use-physics` is set on the Application
 * to use this component.
 *
 * @see https://api.playcanvas.com/engine/classes/RigidBodyComponent.html
 * @example
 * <Entity>
 *   <RigidBody type="dynamic" :mass="1" />
 * </Entity>
 */
export const RigidBody = defineComponent(
    (props: RigidBodyProps, { attrs }) => {
        warnUnknownAttrs(attrs, componentDefinition);
        const physics = usePhysicsWarnings('RigidBody', '<RigidBody type="box" :mass="1" />');

        // The component is only added once the physics library has loaded
        useComponent(
            () => (physics.isPhysicsLoaded ? 'rigidbody' : null),
            () => validateEngineProps(props, componentDefinition),
            componentDefinition.schema
        );

        return () => null;
    },
    { name: 'RigidBody', inheritAttrs: false, props: propsFromSchema(componentDefinition.schema) as never }
);
