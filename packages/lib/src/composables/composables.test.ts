import { mount } from '@vue/test-utils';
import type { Entity as PcEntity, StandardMaterial } from 'playcanvas';
import { Color } from 'playcanvas';
import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';

import { mountScene, settle } from '../../test/mount.ts';
import { Render } from '../components/Render.ts';
import { Entity } from '../Entity.ts';

import { useApp } from './use-app.ts';
import { useAppEvent } from './use-app-event.ts';
import { useAsset } from './use-asset.ts';
import { useMaterial } from './use-material.ts';

describe('useApp', () => {
    it('throws outside of an Application', () => {
        const Comp = defineComponent(() => {
            useApp();
            return () => null;
        });

        expect(() => mount(Comp)).toThrow('`useApp` must be used within an Application component');
    });
});

describe('useAppEvent', () => {
    it('subscribes to app events until unmounted', async () => {
        const callback = vi.fn();
        const show = ref(true);
        const Listener = defineComponent(() => {
            useAppEvent<{ custom: (n: number) => void }>('custom', callback);
            return () => null;
        });

        const { app } = await mountScene(() => (show.value ? h(Listener) : null));

        app.fire('custom', 42);
        expect(callback.mock.calls[0][0]).toBe(42);

        show.value = false;
        await settle();
        app.fire('custom', 43);

        expect(callback).toHaveBeenCalledOnce();
    });
});

describe('useMaterial', () => {
    it('creates a material, keeps it in sync, and destroys it on unmount', async () => {
        const diffuse = ref('red');
        const show = ref(true);
        let material: StandardMaterial | null = null;

        const Box = defineComponent(() => {
            material = useMaterial(() => ({ diffuse: diffuse.value }));
            return () => h(Entity, { name: 'box' }, () => h(Render, { type: 'box', material: material! }));
        });

        const { app } = await mountScene(() => (show.value ? h(Box) : null));

        const entity = app.root.findByName('box') as PcEntity;
        expect(entity.render?.material).toBe(material);
        expect(material!.diffuse).toEqual(new Color(1, 0, 0, 1));

        diffuse.value = 'blue';
        await settle();
        expect(material!.diffuse).toEqual(new Color(0, 0, 1, 1));

        const destroy = vi.spyOn(material!, 'destroy');
        show.value = false;
        await settle();
        expect(destroy).toHaveBeenCalled();
    });
});

describe('useAsset', () => {
    it('reports an error for unsupported asset types', async () => {
        let result: ReturnType<typeof useAsset> | null = null;
        const Loader = defineComponent(() => {
            result = useAsset('file.xyz', 'unknown');
            return () => null;
        });

        await mountScene(() => h(Loader));

        expect(result!.loading.value).toBe(false);
        expect(result!.asset.value).toBeNull();
        expect(result!.error.value).toBe('Unsupported asset type: unknown');
    });

    it('reports an error when no source is given', async () => {
        let result: ReturnType<typeof useAsset> | null = null;
        const Loader = defineComponent(() => {
            result = useAsset('', 'texture');
            return () => null;
        });

        await mountScene(() => h(Loader));

        expect(result!.error.value).toBe('Asset source URL is required');
    });
});
