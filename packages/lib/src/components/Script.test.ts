import type { Entity as PcEntity } from 'playcanvas';
import { Script as PcScript } from 'playcanvas';
import { describe, it, expect, vi } from 'vitest';
import { h, ref, shallowRef } from 'vue';

import { mountScene, settle } from '../../test/mount.ts';
import { Entity } from '../Entity.ts';

import type { ScriptExposed } from './Script.ts';
import { Script } from './Script.ts';

describe('Script', () => {
    it('passes props to the script instance before it initializes', async () => {
        const initialized = vi.fn();

        class TestingScript extends PcScript {
            speed = 0;
            direction: number[] = [];
            initialize() {
                initialized(this.speed, this.direction);
            }
        }

        await mountScene(() => h(Entity, () => h(Script, { script: TestingScript, speed: 2, direction: [1, 0, 0] })));

        expect(initialized).toHaveBeenCalledWith(2, [1, 0, 0]);
    });

    it('camelizes kebab-case attributes', async () => {
        class TestingScript extends PcScript {
            pivotPoint = 0;
        }
        const scriptRef = shallowRef<ScriptExposed<TestingScript> | null>(null);

        await mountScene(() => h(Entity, () => h(Script, { script: TestingScript, 'pivot-point': 5, ref: scriptRef })));

        expect(scriptRef.value?.script?.pivotPoint).toBe(5);
    });

    it('exposes the script instance through a template ref', async () => {
        class TestScript extends PcScript {}
        const scriptRef = shallowRef<ScriptExposed | null>(null);

        await mountScene(() => h(Entity, () => h(Script, { script: TestScript, ref: scriptRef })));

        expect(scriptRef.value?.script).toBeInstanceOf(TestScript);
    });

    it('updates script properties without re-initializing', async () => {
        const initialized = vi.fn();
        class TestScript extends PcScript {
            speed = 0;
            initialize() {
                initialized();
            }
        }
        const speed = ref(1);
        const scriptRef = shallowRef<ScriptExposed<TestScript> | null>(null);

        await mountScene(() => h(Entity, () => h(Script, { script: TestScript, speed: speed.value, ref: scriptRef })));

        speed.value = 2;
        await settle();

        expect(scriptRef.value?.script?.speed).toBe(2);
        expect(initialized).toHaveBeenCalledOnce();
    });

    class OrbitCamera extends PcScript {
        static scriptName = 'orbitCamera';
    }
    class FallbackScript extends PcScript {}

    it.each([
        ['explicit scriptName', OrbitCamera, 'orbitCamera'],
        ['class-name fallback', FallbackScript, 'fallbackScript']
    ] as const)('cleans up and remounts using %s', async (_label, script, scriptName) => {
        const mounted = ref(true);
        const scriptRef = shallowRef<ScriptExposed | null>(null);
        const { app } = await mountScene(() =>
            h(Entity, { name: 'host' }, () => (mounted.value ? h(Script, { script, ref: scriptRef }) : null))
        );

        const entity = app.root.findByName('host') as PcEntity;
        const first = scriptRef.value!.script!;
        expect(entity.script![scriptName as never]).toBe(first);

        mounted.value = false;
        await settle();
        expect(entity.script![scriptName as never]).toBeUndefined();

        const warn = vi.spyOn(console, 'warn');
        mounted.value = true;
        await settle();

        expect(scriptRef.value?.script).toBeInstanceOf(script);
        expect(scriptRef.value?.script).not.toBe(first);
        expect(entity.script![scriptName as never]).toBe(scriptRef.value?.script);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('destroys the script instance on unmount', async () => {
        const destroyed = vi.fn();
        class UnmountScript extends PcScript {
            initialize() {
                this.on('destroy', destroyed);
            }
        }
        const mounted = ref(true);

        await mountScene(() => h(Entity, () => (mounted.value ? h(Script, { script: UnmountScript }) : null)));

        mounted.value = false;
        await settle();

        expect(destroyed).toHaveBeenCalledOnce();
    });
});
