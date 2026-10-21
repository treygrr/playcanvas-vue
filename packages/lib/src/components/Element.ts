import type { ElementComponent } from 'playcanvas';
import { Entity } from 'playcanvas';
import { defineComponent } from 'vue';

import { useComponent } from '../composables/use-component.ts';
import { validateEngineProps } from '../utils/engine-props.ts';
import type { PublicProps, Serializable } from '../utils/types-utils.ts';
import { createComponentDefinition, getStaticNullApplication } from '../utils/validation.ts';
import { propsFromSchema, warnUnknownAttrs } from '../utils/vue-props.ts';

export type ElementProps = Partial<Serializable<PublicProps<ElementComponent>>>;

const componentDefinition = createComponentDefinition<ElementProps, ElementComponent>(
    'Element',
    () => new Entity('mock-element', getStaticNullApplication()).addComponent('element') as ElementComponent,
    (component) => (component as ElementComponent).system.destroy(),
    { apiName: 'ElementComponent' }
);

/**
 * The Element component renders 2D UI content — text, an image, or a group — on an entity.
 * Add it to a child of an entity that has a {@link Screen} component.
 *
 * @see https://api.playcanvas.com/engine/classes/ElementComponent.html
 *
 * @example
 * <Entity>
 *   <Screen />
 *   <Entity>
 *     <Element type="text" :font-asset="font" text="Hello, World!" />
 *   </Entity>
 * </Entity>
 */
export const Element = defineComponent(
    (props: ElementProps, { attrs }) => {
        warnUnknownAttrs(attrs, componentDefinition);
        useComponent(
            'element',
            () => validateEngineProps(props, componentDefinition, true),
            componentDefinition.schema
        );
        return () => null;
    },
    { name: 'Element', inheritAttrs: false, props: propsFromSchema(componentDefinition.schema) as never }
);
