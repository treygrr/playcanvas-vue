import { StandardMaterial } from 'playcanvas';
import type { MaybeRefOrGetter } from 'vue';
import { markRaw, onScopeDispose, toValue, watchEffect } from 'vue';

import type { PublicProps, Serializable } from '../utils/types-utils.ts';
import { createComponentDefinition, applyProps, validatePropsPartial } from '../utils/validation.ts';

import { useApp } from './use-app.ts';

/**
 * This composable creates a material and keeps its properties in sync with `props`.
 * The material is destroyed when the calling component unmounts.
 *
 * @param {MaterialProps} props - The material props, or a ref/getter returning them.
 * @returns {StandardMaterial} material - The material instance.
 * @see https://api.playcanvas.com/engine/classes/StandardMaterial.html
 *
 * @example
 * const color = ref('red');
 * const material = useMaterial(() => ({ diffuse: color.value, opacity: 0.5 }));
 *
 * // use the material
 * <Render type="box" :material="material" />
 */
export const useMaterial = (props: MaybeRefOrGetter<MaterialProps>): StandardMaterial => {
    // Materials belong to an application, so this must be used inside one
    useApp();

    const material = markRaw(new StandardMaterial());

    // Update material properties when 'props' change
    watchEffect(() => {
        const safeProps = validatePropsPartial(toValue(props), componentDefinition);
        applyProps(material, componentDefinition.schema, safeProps);
        material.update();
    });

    // Clean up the material when the component unmounts
    onScopeDispose(() => material.destroy());

    return material;
};

export type MaterialProps = Partial<Serializable<PublicProps<StandardMaterial>>>;

// create a schema for the material props
const componentDefinition = createComponentDefinition<MaterialProps, StandardMaterial>(
    'Material',
    () => new StandardMaterial(),
    (material) => material.destroy(),
    { apiName: 'StandardMaterial' }
);
