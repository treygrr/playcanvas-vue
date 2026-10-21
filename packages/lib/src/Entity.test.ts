import type { Entity as PcEntity } from 'playcanvas';
import { describe, it, expect, vi } from 'vitest';
import { h, ref, shallowRef } from 'vue';

import { mountScene, settle } from '../test/mount.ts';

import type { EntityExposed } from './Entity.ts';
import { Entity } from './Entity.ts';
import { SyntheticPointerEvent } from './utils/synthetic-event.ts';

describe('Entity', () => {
    it('adds an entity with default props to its parent', async () => {
        const { app } = await mountScene(() => h(Entity));

        // The app root is also named "Untitled", so look among its children
        const entity = app.root.children.find((child) => child.name === 'Untitled') as PcEntity;
        expect(entity).toBeTruthy();
        expect(entity.getLocalPosition().toArray()).toEqual([0, 0, 0]);
        expect(entity.getLocalScale().toArray()).toEqual([1, 1, 1]);
    });

    it('applies transform props', async () => {
        const { app } = await mountScene(() =>
            h(Entity, { name: 'box', position: [1, 2, 3], scale: [2, 2, 2], rotation: [0, 90, 0] })
        );

        const entity = app.root.findByName('box') as PcEntity;
        expect(entity.getLocalPosition().toArray()).toEqual([1, 2, 3]);
        expect(entity.getLocalScale().toArray()).toEqual([2, 2, 2]);
        expect(entity.getLocalEulerAngles().y).toBeCloseTo(90);
    });

    it('updates the transform when props change', async () => {
        const position = ref<[number, number, number]>([0, 0, 0]);
        const { app } = await mountScene(() => h(Entity, { name: 'box', position: position.value }));

        position.value = [4, 5, 6];
        await settle();

        expect((app.root.findByName('box') as PcEntity).getLocalPosition().toArray()).toEqual([4, 5, 6]);
    });

    it('nests child entities', async () => {
        const { app } = await mountScene(() =>
            h(Entity, { name: 'parent' }, () => h(Entity, { name: 'child' }, () => h(Entity, { name: 'grandchild' })))
        );

        const grandchild = app.root.findByName('grandchild') as PcEntity;
        expect(grandchild.parent?.name).toBe('child');
        expect(grandchild.parent?.parent?.name).toBe('parent');
    });

    it('removes and destroys the entity when unmounted', async () => {
        const show = ref(true);
        const { app } = await mountScene(() => (show.value ? h(Entity, { name: 'temp' }) : null));

        const entity = app.root.findByName('temp') as PcEntity;
        const destroy = vi.spyOn(entity, 'destroy');

        show.value = false;
        await settle();

        expect(app.root.findByName('temp')).toBeNull();
        expect(destroy).toHaveBeenCalled();
    });

    it('exposes the PlayCanvas entity through a template ref', async () => {
        const entityRef = shallowRef<EntityExposed | null>(null);
        const { app } = await mountScene(() => h(Entity, { name: 'exposed', ref: entityRef }));

        expect(entityRef.value?.entity).toBe(app.root.findByName('exposed'));
    });

    it('calls pointer event listeners', async () => {
        const onPointerdown = vi.fn();
        const onClick = vi.fn();
        const { app } = await mountScene(() => h(Entity, { name: 'target', onPointerdown, onClick }));

        const entity = app.root.findByName('target') as PcEntity;
        const event = new SyntheticPointerEvent(new PointerEvent('pointerdown'));
        entity.fire('pointerdown', event);
        entity.fire('click', event);

        expect(onPointerdown.mock.calls[0][0]).toBe(event);
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('removes pointer event listeners when they are unbound', async () => {
        const onPointerup = vi.fn();
        const bound = ref(true);
        const { app } = await mountScene(() =>
            h(Entity, { name: 'target', onPointerup: bound.value ? onPointerup : undefined })
        );

        bound.value = false;
        await settle();
        (app.root.findByName('target') as PcEntity).fire('pointerup');

        expect(onPointerup).not.toHaveBeenCalled();
    });

    it('throws when used outside of an Application', async () => {
        const { mount } = await import('@vue/test-utils');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        expect(() => mount(Entity)).toThrow('`useParent` must be used within an Application or Entity component');
        warn.mockRestore();
    });
});
