import type { ComponentDefinition } from './validation.ts';
import { validatePropsPartial, validatePropsWithDefaults } from './validation.ts';
import { definedProps } from './vue-props.ts';

/**
 * Validates the props of an engine component against its definition.
 * Reading this inside an effect tracks every prop in the schema.
 *
 * @param props The component props.
 * @param componentDef The component definition.
 * @param withDefaults When true, props that aren't set fall back to their schema default.
 * Otherwise they are left out, and the engine keeps its own value.
 */
export function validateEngineProps<T extends object, InstanceType>(
    props: T,
    componentDef: ComponentDefinition<T, InstanceType>,
    withDefaults = false
): T {
    const setProps = definedProps(props, Object.keys(componentDef.schema)) as T;
    return withDefaults
        ? validatePropsWithDefaults(setProps as never, componentDef)
        : validatePropsPartial(setProps as never, componentDef);
}
