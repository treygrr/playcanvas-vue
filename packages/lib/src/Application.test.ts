import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import { h, ref } from 'vue';

import { mountScene, settle } from '../test/mount.ts';

import { Application, ApplicationWithoutCanvas } from './Application.ts';
import { Entity } from './Entity.ts';

describe('Application', () => {
    it('renders a canvas with default class and style', async () => {
        const { wrapper } = await mountScene();
        const canvas = wrapper.find('canvas');

        expect(canvas.exists()).toBe(true);
        expect(canvas.classes()).toContain('pc-app');
        expect(canvas.attributes('style')).toContain('width: 100%');
        expect(canvas.attributes('aria-label')).toBe('Interactive 3D Scene');
    });

    it('merges class and style attributes onto the canvas', async () => {
        const wrapper = mount(Application, { attrs: { class: 'scene', style: { height: '50%' } } });
        await settle();
        const canvas = wrapper.find('canvas');

        expect(canvas.classes()).toEqual(['pc-app', 'scene']);
        expect(canvas.attributes('style')).toContain('height: 50%');
    });

    it('starts the application and parents children to its root', async () => {
        const { app } = await mountScene(() => h(Entity, { name: 'child' }));

        expect(app.root.findByName('child')).toBeTruthy();
    });

    it('applies application props, and updates them reactively', async () => {
        const timeScale = ref(0.5);
        const { app } = await mountScene(() => null, {
            get timeScale() {
                return timeScale.value;
            }
        });

        expect(app.timeScale).toBe(0.5);

        timeScale.value = 2;
        await settle();

        expect(app.timeScale).toBe(2);
    });

    it('destroys the application on unmount', async () => {
        const { wrapper, app } = await mountScene(() => h(Entity, { name: 'child' }));
        const root = app.root;

        wrapper.unmount();

        expect(app.root).toBeFalsy();
        expect(root.findByName('child')).toBeFalsy();
    });

    it('renders into a provided canvas with ApplicationWithoutCanvas', async () => {
        const canvas = document.createElement('canvas');
        const wrapper = mount(ApplicationWithoutCanvas, {
            props: { canvas },
            slots: { default: () => h(Entity, { name: 'child' }) }
        });
        await settle();

        // No canvas is rendered, the scene is in the provided one
        expect(wrapper.find('canvas').exists()).toBe(false);
        wrapper.unmount();
    });

    it('recreates the application when the device types change', async () => {
        const deviceTypes = ref(['null']);
        const { wrapper, app } = await mountScene(() => h(Entity, { name: 'child' }), {
            get deviceTypes() {
                return deviceTypes.value;
            }
        });

        deviceTypes.value = ['null', 'webgl2'];
        await settle();

        // The original app has been destroyed, and the scene remounted in a new one
        expect(app.root).toBeFalsy();
        expect(wrapper.findAll('canvas')).toHaveLength(1);
    });
});
