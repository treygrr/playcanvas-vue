import { flushPromises, mount } from '@vue/test-utils';
import type { Application as PcApplication } from 'playcanvas';
import type { VNodeChild } from 'vue';
import { defineComponent, h, nextTick } from 'vue';

import { Application } from '../src/Application.ts';
import { useApp } from '../src/composables/use-app.ts';

/**
 * Waits for the application's async graphics device, and the renders that follow it.
 */
export const settle = async () => {
    await flushPromises();
    await nextTick();
    await flushPromises();
};

/**
 * Mounts `scene` inside an `<Application>`, and resolves once the application is running.
 *
 * @param scene A render function for the scene. Reactive state read inside it is tracked.
 * @param props Props for the `<Application>`.
 */
export async function mountScene(scene: () => VNodeChild = () => null, props: Record<string, unknown> = {}) {
    let app: PcApplication | null = null;

    const CaptureApp = defineComponent(() => {
        app = useApp();
        return () => null;
    });

    const Root = defineComponent(() => () => h(Application, props, () => [h(CaptureApp), scene()]));

    const wrapper = mount(Root, { attachTo: document.body });
    await settle();

    if (!app) throw new Error('The application did not start');

    return { wrapper, app: app as PcApplication };
}
