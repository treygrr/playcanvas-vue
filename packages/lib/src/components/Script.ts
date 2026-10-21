import { Script as PcScript } from 'playcanvas';
import type { PropType } from 'vue';
import { camelize, defineComponent, onBeforeUpdate, shallowRef } from 'vue';

import { useScript } from '../composables/use-script.ts';
import type { SubclassOf } from '../utils/types-utils.ts';
import { validateAndSanitize } from '../utils/validation.ts';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- preserve the public prop declaration
export interface ScriptProps {
    /** The script class to attach to the entity */
    script: SubclassOf<PcScript>;
}

/**
 * The value exposed through a template ref on `<Script>`.
 */
export type ScriptExposed<T extends PcScript = PcScript> = {
    /** The script instance, or null if it hasn't been created */
    script: T | null;
};

class NullScript extends PcScript {
    static scriptName = 'null-script';
}

const scriptPropDef = {
    validate: (value: unknown): boolean =>
        Boolean(value && value instanceof Function && value.prototype instanceof PcScript),
    errorMsg: (value: unknown) => `Invalid value for prop "script": "${value}". Expected a subclass of Script.`,
    default: NullScript
};

// Template attributes, camelized so `:pivot-point` maps to the `pivotPoint` script property
const scriptProperties = (attrs: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(attrs).map(([key, value]) => [camelize(key), value]));

/**
 * The Script component allows you to hook into the entity's lifecycle. This allows you to
 * run code during the frame update loop, or when the entity is created or destroyed.
 * Use this for high-performance code that needs to run on every frame.
 *
 * Any other attributes are assigned to the script instance as properties.
 * Use a template ref to access the script instance via `.script`.
 *
 * @see https://api.playcanvas.com/engine/classes/Script.html
 * @example
 * // A Rotator script that rotates the entity around the Y axis
 * class Rotator extends Script {
 *   static scriptName = 'rotator';
 *   speed = 1;
 *
 *   update(dt: number) {
 *     this.entity.rotate(0, this.speed * dt, 0);
 *   }
 * }
 *
 * // <Script :script="Rotator" :speed="10" />
 */
export const Script = defineComponent(
    (props: ScriptProps, { attrs, expose }) => {
        // Attributes aren't reactive, so they are copied on every update
        const properties = shallowRef(scriptProperties(attrs));
        onBeforeUpdate(() => {
            properties.value = scriptProperties(attrs);
        });

        const script = useScript(
            () =>
                validateAndSanitize<SubclassOf<PcScript>, PcScript>(
                    props.script,
                    scriptPropDef,
                    'script',
                    'Script',
                    'ScriptComponent'
                ),
            () => properties.value
        );

        expose({ script });

        return () => null;
    },
    {
        name: 'Script',
        inheritAttrs: false,
        props: { script: { type: Function as PropType<SubclassOf<PcScript>>, required: true } }
    }
);
