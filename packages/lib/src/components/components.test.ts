import type { Entity as PcEntity } from 'playcanvas';
import { Color, Vec2 } from 'playcanvas';
import { describe, it, expect, vi } from 'vitest';
import type { VNodeChild } from 'vue';
import { h, ref } from 'vue';

import { mountScene, settle } from '../../test/mount.ts';
import { Entity } from '../Entity.ts';

import { Camera } from './Camera.ts';
import { Element } from './Element.ts';
import { Light } from './Light.ts';
import { Render } from './Render.ts';
import { RigidBody } from './RigidBody.ts';
import { Screen } from './Screen.ts';

const inEntity = (child: () => VNodeChild) => () => h(Entity, { name: 'host' }, child);
const host = (app: { root: PcEntity }) => app.root.findByName('host') as PcEntity;

describe('engine components', () => {
    it('adds a render component with the given type', async () => {
        const { app } = await mountScene(inEntity(() => h(Render, { type: 'sphere' })));

        expect(host(app).render?.type).toBe('sphere');
    });

    it('casts boolean shorthand props, eg `<Render cast-shadows />`', async () => {
        const { app } = await mountScene(inEntity(() => h(Render, { type: 'box', 'cast-shadows': '' })));

        expect(host(app).render?.castShadows).toBe(true);
    });

    it('leaves props that are not set at the engine default', async () => {
        const { app } = await mountScene(inEntity(() => h(Camera)));

        expect(host(app).camera?.fov).toBe(45);
    });

    it('updates the component when props change', async () => {
        const fov = ref(60);
        const { app } = await mountScene(inEntity(() => h(Camera, { fov: fov.value })));
        expect(host(app).camera?.fov).toBe(60);

        fov.value = 30;
        await settle();

        expect(host(app).camera?.fov).toBe(30);
    });

    it('converts color strings to engine colors', async () => {
        const { app } = await mountScene(inEntity(() => h(Light, { type: 'omni', color: 'red' })));

        expect(host(app).light?.type).toBe('omni');
        expect(host(app).light?.color).toEqual(new Color(1, 0, 0, 1));
    });

    it('removes the component when unmounted', async () => {
        const show = ref(true);
        const { app } = await mountScene(inEntity(() => (show.value ? h(Light) : null)));
        expect(host(app).light).toBeTruthy();

        show.value = false;
        await settle();

        expect(host(app).light).toBeFalsy();
    });

    it('warns about unknown props', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        await mountScene(inEntity(() => h(Camera, { notAProp: 1 })));
        // Warnings are logged asynchronously
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(warn).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.stringContaining('"notAProp"'));
        warn.mockRestore();
    });

    it('does not add a rigid body until physics is enabled', async () => {
        const { app } = await mountScene(inEntity(() => h(RigidBody, { type: 'dynamic' })));

        expect(host(app).rigidbody).toBeFalsy();
    });

    // Regression: referenceResolution was applied as a raw array, but the engine
    // setter reads value.x/value.y, leaving the screen scale (and child UI) NaN.
    it('applies Screen referenceResolution as a Vec2', async () => {
        const { app } = await mountScene(inEntity(() => h(Screen, { referenceResolution: [1280, 720] })));

        const screen = host(app).screen!;
        expect(screen.referenceResolution).toBeInstanceOf(Vec2);
        expect(screen.referenceResolution.x).toBe(1280);
        expect(screen.referenceResolution.y).toBe(720);
    });

    // Regression: the auto-generated schema used to include the engine's read-only
    // `aabb` getter and assign to it on mount, throwing "Cannot set property aabb".
    it('mounts a text element', async () => {
        const { app } = await mountScene(() =>
            h(Entity, null, () => [
                h(Screen),
                h(Entity, { name: 'host' }, () => h(Element, { type: 'text', text: 'Hello, World!', fontSize: 24 }))
            ])
        );

        expect(host(app).element?.type).toBe('text');
        expect(host(app).element?.text).toBe('Hello, World!');
    });
});
