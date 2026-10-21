import type { ComponentObjectPropsOptions, PropType } from 'vue';
import { camelize, toRaw } from 'vue';

import { env } from './env.ts';
import type { ComponentDefinition, Schema } from './validation.ts';
import { warnOnce } from './validation.ts';

/**
 * Builds Vue runtime prop options from a component schema, so every engine property can be bound as a
 * regular Vue prop (`:intensity="2"`, `cast-shadows`, ...).
 *
 * Props default to `undefined`, which means "not set": the engine keeps its own value. Props whose
 * engine default is a boolean get Vue's boolean casting, so `<Render cast-shadows />` means `true`.
 *
 * @param schema The schema to derive props from.
 * @param extra Additional prop options, which override derived ones.
 */
export function propsFromSchema<T, InstanceType>(
    schema: Schema<T, InstanceType>,
    extra: Record<string, unknown> = {}
): ComponentObjectPropsOptions<T> {
    const props: Record<string, { type?: PropType<unknown>; default: undefined }> = {};

    for (const key of Object.keys(schema)) {
        const propDef = schema[key as keyof T];
        props[key] =
            typeof propDef?.default === 'boolean' ? { type: Boolean, default: undefined } : { default: undefined };
    }

    return { ...props, ...extra } as ComponentObjectPropsOptions<T>;
}

/**
 * Returns a plain object holding only the props that have been set. Values are unwrapped from any
 * reactive proxy, as the engine must never hold proxies of its own objects.
 *
 * @param props The component props.
 * @param keys The props to read. Reading them inside an effect tracks them.
 */
export function definedProps<T>(props: T, keys: readonly string[]): Partial<T> {
    const result: Record<string, unknown> = {};

    for (const key of keys) {
        const value = (props as Record<string, unknown>)[key];
        if (value !== undefined) result[key] = toRaw(value);
    }

    return result as Partial<T>;
}

/**
 * Warns about attributes that don't match any prop of the component. Engine components render
 * nothing, so Vue would otherwise drop these silently.
 *
 * @param attrs The component's fallthrough attributes.
 * @param componentDef The component definition, used for the warning text.
 */
export function warnUnknownAttrs<T, InstanceType>(
    attrs: Record<string, unknown>,
    componentDef: Pick<ComponentDefinition<T, InstanceType>, 'name' | 'apiName'>
): void {
    if (env === 'production') return;

    const unknownProps = Object.keys(attrs).map(camelize);
    if (unknownProps.length === 0) return;

    const { name, apiName } = componentDef;
    warnOnce(
        `Unknown props in "<${name}/>."\n` +
            `The following props are invalid and will be ignored: "${unknownProps.join('", "')}"\n\n` +
            `Please see the documentation https://api.playcanvas.com/engine/classes/${apiName ?? name}.html.`
    );
}

/**
 * Normalizes raw vnode props (as written in a template) to camelCase keys, applying Vue's boolean
 * shorthand: `<Modify.Light cast-shadows />` becomes `{ castShadows: true }`.
 *
 * @param props The raw vnode props.
 */
export function normalizeVNodeProps(props: Record<string, unknown> | null): Record<string, unknown> {
    if (!props) return {};

    return Object.fromEntries(
        Object.entries(props).map(([key, value]) => [camelize(key), value === '' ? true : value])
    );
}
