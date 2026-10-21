import type { GSplatComponent } from 'playcanvas';
import { Asset, Entity, GSplatInstance, ShaderMaterial } from 'playcanvas';
import { defineComponent } from 'vue';

import { useComponent } from '../composables/use-component.ts';
import { validateEngineProps } from '../utils/engine-props.ts';
import type { PublicProps } from '../utils/types-utils.ts';
import { createComponentDefinition, getStaticNullApplication } from '../utils/validation.ts';
import { propsFromSchema, warnUnknownAttrs } from '../utils/vue-props.ts';

export type GSplatProps = Partial<PublicProps<GSplatComponent>>;

const componentDefinition = createComponentDefinition<GSplatProps, GSplatComponent>(
    'GSplat',
    () => new Entity('mock-gsplat', getStaticNullApplication()).addComponent('gsplat') as GSplatComponent,
    (component) => (component as GSplatComponent).system.destroy(),
    // `id` is a getter-only property and `lodDistances`/`splatBudget` are removed
    // in engine 2.18+, so they must not become settable schema props
    { apiName: 'GSplatComponent', exclude: ['id', 'lodDistances', 'splatBudget'] }
);

componentDefinition.schema = {
    ...componentDefinition.schema,
    asset: {
        validate: (val: unknown) => val instanceof Asset,
        errorMsg: (val: unknown) => `Invalid value for prop "asset": "${JSON.stringify(val)}". Expected an Asset.`,
        default: null
    },
    // `unified` is a special property that can not be modified while the component is enabled
    unified: {
        validate: (val: unknown) => typeof val === 'boolean',
        errorMsg: (val: unknown) => `Invalid value for prop "unified": "${JSON.stringify(val)}". Expected a boolean.`,
        default: false,
        apply: (instance: GSplatComponent, props: Record<string, unknown>, key: string) => {
            const value = props[key] as boolean;

            if (instance.unified === value) {
                return;
            }

            // If not enabled, just set directly
            if (!instance.enabled) {
                instance.unified = value;
                return;
            }

            // Temporarily disable component, set value, re-enable
            instance.enabled = false;
            instance.unified = value;
            instance.enabled = true;
        }
    },
    material: {
        validate: (val: unknown) => val === null || val instanceof ShaderMaterial,
        errorMsg: (val: unknown) => `Invalid value for prop "material": "${val}". Expected a ShaderMaterial or null.`,
        default: null,
        apply: (instance: GSplatComponent, props: Record<string, unknown>, key: string) => {
            const value = props[key] as ShaderMaterial | null;
            if (instance.material === value) {
                return;
            }
            if (value) {
                instance.material = value;
            }
        }
    },
    instance: {
        validate: (val: unknown) => val === null || val instanceof GSplatInstance,
        errorMsg: (val: unknown) => `Invalid value for prop "instance": "${val}". Expected a GSplatInstance or null.`,
        default: null,
        apply: (instance: GSplatComponent, props: Record<string, unknown>, key: string) => {
            const value = props[key] as GSplatInstance | null;
            if (instance.instance === value) {
                return;
            }
            instance.instance = value;
        }
    }
};

/**
 * The GSplat component allows an entity to render a Gaussian Splat.
 * @see https://api.playcanvas.com/engine/classes/GSplatComponent.html
 * @example
 * const { asset } = useSplat('./splat.ply');
 * // <GSplat v-if="asset" :asset="asset" />
 */
export const GSplat = defineComponent(
    (props: GSplatProps, { attrs }) => {
        warnUnknownAttrs(attrs, componentDefinition);
        useComponent('gsplat', () => validateEngineProps(props, componentDefinition, true), componentDefinition.schema);
        return () => null;
    },
    { name: 'GSplat', inheritAttrs: false, props: propsFromSchema(componentDefinition.schema) as never }
);
