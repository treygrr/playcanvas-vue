import type { CameraComponent } from 'playcanvas';
import { Entity } from 'playcanvas';
import { defineComponent } from 'vue';

import { useComponent } from '../composables/use-component.ts';
import { validateEngineProps } from '../utils/engine-props.ts';
import type { PublicProps, Serializable } from '../utils/types-utils.ts';
import { createComponentDefinition, getStaticNullApplication } from '../utils/validation.ts';
import { propsFromSchema, warnUnknownAttrs } from '../utils/vue-props.ts';

export type CameraProps = Partial<Serializable<PublicProps<CameraComponent>>>;

const componentDefinition = createComponentDefinition<CameraProps, CameraComponent>(
    'Camera',
    () => new Entity('mock-camera', getStaticNullApplication()).addComponent('camera') as CameraComponent,
    (component) => (component as CameraComponent).system.destroy(),
    { apiName: 'CameraComponent' }
);

/**
 * The Camera component makes an entity behave like a camera and gives you a view into the scene.
 * Moving the container entity will move the camera.
 *
 * @see https://api.playcanvas.com/engine/classes/CameraComponent.html
 *
 * @example
 * <Entity>
 *   <Camera :fov="75" :near-clip="0.1" :far-clip="1000" />
 * </Entity>
 */
export const Camera = defineComponent(
    (props: CameraProps, { attrs }) => {
        warnUnknownAttrs(attrs, componentDefinition);
        useComponent('camera', () => validateEngineProps(props, componentDefinition), componentDefinition.schema);
        return () => null;
    },
    { name: 'Camera', inheritAttrs: false, props: propsFromSchema(componentDefinition.schema) as never }
);

export { componentDefinition as cameraComponentDefinition };
